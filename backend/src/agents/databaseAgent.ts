import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { llm, type ChatMessage } from '../services/llm.js';
import { validateSql } from '../services/sqlValidator.js';
import { dbManager } from '../database/connection.js';
import { schemaToText } from '../database/schema.js';
import { logger } from '../utils/logger.js';
import {
  airlineSuggestion,
  computeEmployeeProfile,
  employeeActionSuggestion,
  type AirlineSuggestion,
  type EmployeeAction,
} from '../services/businessRules.js';
import type { SchemaInfo } from '../types/index.js';

export type BusinessSuggestion = AirlineSuggestion | EmployeeAction;

export interface DatabaseAgentResult {
  /** 最后一次成功执行的 SQL（用于前端展示） */
  sql: string | null;
  data: Record<string, unknown>[];
  answer: string;
  /** 业务建议（打折 / 升育留裁），由 LLM 调用业务工具时捕获 */
  suggestion?: BusinessSuggestion | null;
}

/** execute_sql 工具定义（只读 SELECT） */
const EXECUTE_SQL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'execute_sql',
    description:
      '在数据库上执行一条只读 SELECT 查询并返回结果。返回 {ok, rowCount, rows} 或 {ok:false, error}。只允许 SELECT，禁止 INSERT/UPDATE/DELETE/DDL/多语句/系统表。',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '要执行的 SELECT SQL 语句' },
      },
      required: ['sql'],
    },
  },
};

/** 员工画像工具：输入姓名，返回考勤/工资/考评/风险分/人才标签 */
const EMPLOYEE_PROFILE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'employee_profile',
    description:
      '输入员工姓名，返回该员工的完整人才画像：在岗率、请假率、迟到/旷工次数、工资与部门均值对比、考评趋势、流失风险分、人才标签（力争上游/稳步成长/有待观察/流失风险/边缘化）及理由。姓名必须是 crm_employee_t 中真实存在的员工名。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '员工姓名' },
      },
      required: ['name'],
    },
  },
};

/** 干预动作建议工具：输入姓名，返回 升/育/留/裁 建议 */
const SUGGEST_ACTION_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'suggest_action',
    description:
      '输入员工姓名，返回基于人才画像的干预建议：升（升职加薪20%）/ 育（加薪+放权）/ 留（维持留任）/ 裁（进入淘汰名单），含建议依据。姓名必须是 crm_employee_t 中真实存在的员工名。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '员工姓名' },
      },
      required: ['name'],
    },
  },
};

/** 打折建议工具：基于近 3 个月真实运营数据给出票价下调建议 */
const AIRLINE_SUGGESTION_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'airline_suggestion',
    description:
      '基于近 3 个月真实航班与订单数据，计算整体/月度客座率、毛利率、促销（8月）vs 平时（6-7月）的票价与客座率弹性，并给出票价打折幅度建议（依据、预期效果、风险）。',
    parameters: { type: 'object', properties: {} },
  },
};

const MAX_ROUNDS = 8;
const MAX_RESULT_ROWS = 100;

const BUSINESS_TOOLS = [
  EMPLOYEE_PROFILE_TOOL,
  SUGGEST_ACTION_TOOL,
  AIRLINE_SUGGESTION_TOOL,
];

function buildSystemPrompt(schema: SchemaInfo): string {
  return `你是一个企业数据分析助手，通过执行 SQL 和调用业务工具来回答用户的中文问题。当前数据库包含两个业务域：航空运营分析 与 人才流失预测/干预。

## 数据库 Schema
${schemaToText(schema)}

## 表关系
- 员工主数据：crm_employee_t（含工资/邮箱/住址/岗位/绩效等全量字段），其 ID 关联 hr_attendance_t / hr_salary_t / hr_review_t（1 个员工多条记录）
- 航空：airline_flight_t.FLIGHT_ID = airline_booking_t.FLIGHT_ID（1 个航班多笔订单）
- 指标口径：客座率 = 订票人数 / 总座位数 × 100%；毛利率 = (收入 - 成本) / 收入 × 100%；在岗率 = present / 总考勤天数 × 100%

## 可用工具
- execute_sql(sql)：执行只读 SELECT 查询。返回 {ok, rowCount, rows} 或 {ok:false, error}。
- employee_profile(name)：返回指定员工的人才画像（考勤/工资/考评/风险分/标签）。
- suggest_action(name)：返回指定员工的 升/育/留/裁 干预建议。
- airline_suggestion()：返回基于真实数据的票价打折建议。

## 工具选择策略
- 用户问「某员工怎么样 / 流失风险 / 画像 / 建议怎么处理」→ 调用 employee_profile + suggest_action（用真实姓名，可先 execute_sql 查员工名单确认姓名）。
- 用户问「该打几折 / 客座率太低怎么办 / 促销建议」→ 调用 airline_suggestion()。
- 其余数据查询（客座率、毛利率、部门对比、排行等）→ 用 execute_sql 分析。

## 分析策略（execute_sql）
- 先根据 Schema 判断需要哪些字段；对不熟悉的字段先取样看几条真实数据，再写分析 SQL。
- 复杂问题允许分多步：例如「住址在哪个区的人最多」，可先用 SUBSTRING_INDEX 提取区名后 GROUP BY 统计。
- **尽量一次算完**：能用一个 JOIN + GROUP BY 完成的查询就不要拆成多次执行。
- **JOIN 聚合陷阱**：airline_booking_t 与 airline_flight_t JOIN 后，flight 表的行会被订单数放大，此时 SUM(f.TOTAL_SEATS)/SUM(f.OPERATING_COST) 会被重复计算导致客座率/毛利率错误。计算客座率、毛利率时必须先在子查询里按 FLIGHT_ID 聚合订单数/订单金额，再与航班表 JOIN（或直接用 COUNT(b.ORDER_ID) 而不要对航班列做 SUM 后再与订单数相除）。
- 只使用 Schema 中存在的表和字段；中文值直接作为 SQL 字符串（如 '技术部'）。

## 输出规则
- 多轮对话：结合上方历史消息理解当前问题（如「他/她」「那个部门」「那平均呢」等指代要追溯到之前讨论的对象）。
- 一旦拿到足够数据就停止调用工具，直接输出最终自然语言回答；**不要为了"完美"反复探查**。
- 给出最终回答前，确保最后一次 execute_sql 就是支撑你结论的最终查询（系统会把该查询展示给用户，请优先用能一次算完的聚合/过滤 SQL）。
- 回答必须完全基于真实查询/工具结果，禁止编造数字；金额等数字使用千分位（如 25,000 元）。
- 如果数据库中没有能回答问题的字段，如实说明缺什么。
- 直接输出回答文本，不要输出 JSON，不要复述工具返回的原始数据。`;
}

/**
 * 数据库 Agent：通过 Function Calling 让 LLM 与数据库多步交互。
 * LLM 可反复调用 execute_sql 探查数据、调整查询，最终给出基于真实数据的回答。
 * @param history 会话历史（最近若干轮 user/assistant 消息），用于多轮对话的记忆
 */
export async function analyzeQuestion(
  question: string,
  schema: SchemaInfo,
  history: ChatMessage[] = [],
): Promise<DatabaseAgentResult> {
  const allowedTables = schema.tables.map((t) => t.name);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(schema) },
    ...history,
    { role: 'user', content: question },
  ];

  let lastSql: string | null = null;
  let lastData: Record<string, unknown>[] = [];
  let suggestion: BusinessSuggestion | null = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const result = await llm.chatWithTools(messages, [EXECUTE_SQL_TOOL, ...BUSINESS_TOOLS]);

    if (result.kind === 'answer') {
      logger.info('DB agent finished', { round, costRounds: round, hasSuggestion: !!suggestion });
      return { sql: lastSql, data: lastData, answer: result.content, suggestion };
    }

    // 处理本轮工具调用
    const nextMessages: ChatMessage[] = [...messages, result.assistantMessage];
    for (const call of result.calls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      // ---- 业务工具 ----
      if (call.name === 'employee_profile' || call.name === 'suggest_action') {
        const name = typeof parsedArgs.name === 'string' ? parsedArgs.name.trim() : '';
        if (!name) {
          nextMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: '缺少参数 name' }),
          });
          continue;
        }
        const profile = await computeEmployeeProfile(name);
        if (!profile) {
          nextMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: `员工「${name}」不存在，请先执行 SELECT NAME FROM crm_employee_t 查询真实姓名` }),
          });
          continue;
        }
        const content =
          call.name === 'employee_profile'
            ? profile
            : await employeeActionSuggestion(name);
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, ...content }),
        });
        if (call.name === 'suggest_action') {
          suggestion = content as EmployeeAction;
        }
        continue;
      }

      if (call.name === 'airline_suggestion') {
        const content = await airlineSuggestion();
        suggestion = content;
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, ...content }),
        });
        continue;
      }

      // ---- execute_sql ----
      if (call.name !== 'execute_sql') {
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: `未知工具：${call.name}` }),
        });
        continue;
      }

      const sql = typeof parsedArgs.sql === 'string' ? parsedArgs.sql.trim() : '';

      const validation = validateSql(sql, allowedTables);
      if (!validation.valid || !validation.sql) {
        logger.warn('DB agent tool SQL rejected', { reason: validation.reason });
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: `SQL 被拒绝：${validation.reason ?? '未知原因'}` }),
        });
        continue;
      }
      const safeSql = validation.sql;

      try {
        const startedAt = Date.now();
        const rows = await dbManager.query<Record<string, unknown>[]>(safeSql);
        logger.info('DB agent executed SQL', {
          costMs: Date.now() - startedAt,
          rowCount: rows.length,
        });
        lastSql = safeSql;
        lastData = rows.map((r) => ({ ...r }));
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: true,
            rowCount: rows.length,
            rows: rows.slice(0, MAX_RESULT_ROWS),
          }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        nextMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: `执行失败：${message}` }),
        });
      }
    }
    messages.length = 0;
    messages.push(...nextMessages);
  }

  logger.warn('DB agent reached max rounds');
  return {
    sql: lastSql,
    data: lastData,
    answer: '经过多轮查询后仍未得出答案，请尝试换一种问法。',
    suggestion,
  };
}
