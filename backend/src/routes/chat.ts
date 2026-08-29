import { Router } from 'express';
import { z } from 'zod';
import { getSchema } from '../database/schema.js';
import { generateSql } from '../agents/sqlAgent.js';
import { generateAnswer } from '../agents/answerAgent.js';
import { analyzeQuestion, type BusinessSuggestion } from '../agents/databaseAgent.js';
import {
  airlineSuggestion,
  computeAirlineMetrics,
  computeDashboardOverview,
  computeEmployeeProfile,
  employeeActionSuggestion,
  type EmployeeProfile,
} from '../services/businessRules.js';
import { historyService } from '../services/historyService.js';
import { sessionStore, type SessionTurn } from '../services/sessionStore.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { ChatResponse } from '../types/index.js';

const router = Router();

const chatBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, '问题不能为空')
    .max(500, '问题过长（最多 500 字）'),
  /** 会话 ID（前端生成并持久化），同一会话内多轮提问会带上上下文记忆 */
  sessionId: z.string().trim().min(1).max(64).optional(),
});

/**
 * POST /api/chat
 * 完整流程：校验输入 → 获取 Schema → SQL Agent(NL→SQL) → SQL 安全校验 → 执行 SQL → Answer Agent(Result→NL) → 记录历史
 * 真实模式走数据库 Agent（Function Calling 多步分析 + 业务工具）；Mock 模式走规则（业务问题直接命中业务规则引擎）。
 * 多轮对话：同一 sessionId 会注入最近若干轮问答作为上下文记忆。
 */
router.post('/chat', async (req, res) => {
  const startedAt = Date.now();
  const parsed = chatBodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '输入校验失败',
    });
  }

  const question = parsed.data.question;
  const sessionId = parsed.data.sessionId;
  logger.info('Request received', { question, sessionId });

  let data: Record<string, unknown>[] = [];
  let sql: string | null = null;
  let answer = '';
  let suggestion: BusinessSuggestion | null = null;

  try {
    const schema = await getSchema();

    if (config.aiMockMode) {
      // ---- Mock 模式：业务问题直接命中规则引擎，其余走规则生成 SQL → 真实执行 ----
      const biz = await tryMockBusiness(question);
      if (biz) {
        answer = biz.answer;
        suggestion = biz.suggestion;
        data = biz.data;
        logger.info('Mock business rule hit', { suggestion: suggestion?.type });
      } else {
        const sqlResult = await generateSql(question, schema);
        sql = sqlResult.sql;
        logger.info('Generated SQL (mock)', { sql });

        if (sql) {
          const { dbManager } = await import('../database/connection.js');
          const dbStartedAt = Date.now();
          const rows = await dbManager.query(sql);
          data = rows as Record<string, unknown>[];
          logger.info('Database execution finished', {
            executionTimeMs: Date.now() - dbStartedAt,
            rowCount: data.length,
          });
        }
        answer = await generateAnswer({ question, sql, data });
      }
    } else {
      // ---- 真实 LLM 模式：数据库 Agent（Function Calling 多步分析 + 业务工具 + 上下文记忆） ----
      const history = sessionId
        ? sessionStore.getRecent(sessionId).map<SessionTurn>((t) => t)
        : [];
      const agent = await analyzeQuestion(question, schema, history);
      sql = agent.sql;
      data = agent.data;
      answer = agent.answer;
      suggestion = agent.suggestion ?? null;
      logger.info('DB agent answer', {
        sql,
        answer,
        hasSuggestion: !!suggestion,
        historyTurns: history.length,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Chat flow failed', { error: message });
    await saveHistory(question, null, message, startedAt, true);
    return res.status(500).json({
      success: false,
      question,
      error: `查询失败：${message}`,
    });
  }

  // 记录本轮问答到会话记忆
  if (sessionId) {
    sessionStore.push(sessionId, { role: 'user', content: question });
    sessionStore.push(sessionId, { role: 'assistant', content: answer });
  }

  const executionTimeMs = Date.now() - startedAt;
  await saveHistory(question, sql, answer, startedAt, false);

  logger.info('Chat flow finished', {
    totalExecutionTimeMs: executionTimeMs,
    rowCount: data.length,
  });

  const response: ChatResponse = {
    success: true,
    question,
    sql,
    data,
    answer,
    executionTimeMs,
    error: null,
    suggestion,
  };
  res.json(response);
});

/** Mock 模式的业务问题规则（答案 100% 来自规则引擎 + 真实数据库） */
async function tryMockBusiness(
  question: string,
): Promise<{ answer: string; suggestion: BusinessSuggestion | null; data: Record<string, unknown>[] } | null> {
  const wantEmployee = /员工|画像|流失|风险|绩效|建议|怎么处理|怎么样|表现/.test(question);

  // 1. 员工画像 / 干预建议（问题中带真实员工姓名）
  if (wantEmployee) {
    const empName = await findEmployeeName(question);
    if (empName) {
      const [profile, action] = await Promise.all([
        computeEmployeeProfile(empName),
        employeeActionSuggestion(empName),
      ]);
      if (profile && action) {
        return {
          answer: buildEmployeeAnswer(profile, action),
          suggestion: action,
          data: [profile as unknown as Record<string, unknown>],
        };
      }
    }
  }

  // 2. 航空打折建议
  if (/(打折|促销|优惠|卖得不好|提升上座|客座率.{0,4}低)/.test(question)) {
    const [s, m] = await Promise.all([airlineSuggestion(), computeAirlineMetrics()]);
    return {
      answer: `${s.description}\n\n依据：${s.basis.join('；')}\n预期效果：${s.expectedEffect}\n风险提示：${s.risk}\n（当前整体客座率 ${m.loadFactor}%，8月促销客座率 ${m.promoVsNormal.promoLoadFactor}%，平时 ${m.promoVsNormal.normalLoadFactor}%）`,
      suggestion: s,
      data: [],
    };
  }

  // 3. 在岗率 / 请假率（整体或指定部门）
  if (/(在岗率|请假率)/.test(question)) {
    const deptMatch = question.match(/([\u4e00-\u9fa5]{1,6}部)/);
    const dept = deptMatch ? deptMatch[1] : null;
    const { dbManager } = await import('../database/connection.js');
    if (dept) {
      const rows = await dbManager.query<Array<{ department: string; attendance_rate: number; leave_rate: number }>>(
        `SELECT e.DEPARTMENT_NAME AS department,
                SUM(CASE WHEN a.STATUS = 'present' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attendance_rate,
                SUM(CASE WHEN a.STATUS = 'leave' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS leave_rate
         FROM crm_employee_t e JOIN hr_attendance_t a ON e.ID = a.EMPLOYEE_ID
         WHERE e.DEPARTMENT_NAME = ?
         GROUP BY e.DEPARTMENT_NAME`,
        [dept],
      );
      const row = rows[0];
      if (!row) return { answer: `数据库中没有「${dept}」部门或该部门暂无考勤记录。`, suggestion: null, data: [] };
      const label = question.includes('请假率') ? '请假率' : '在岗率';
      const value = label === '在岗率' ? row.attendance_rate : row.leave_rate;
      return {
        answer: `${dept}最近 3 个月${label}为 ${Math.round(Number(value) * 10) / 10}%（在岗率 ${Math.round(row.attendance_rate * 10) / 10}%、请假率 ${Math.round(row.leave_rate * 10) / 10}%）。`,
        suggestion: null,
        data: [],
      };
    }
    const rows = await dbManager.query<Array<{ attendance_rate: number; leave_rate: number }>>(
      `SELECT SUM(CASE WHEN STATUS = 'present' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attendance_rate,
              SUM(CASE WHEN STATUS = 'leave' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS leave_rate
       FROM hr_attendance_t`,
    );
    const row = rows[0];
    const label = question.includes('请假率') ? '请假率' : '在岗率';
    const value = label === '在岗率' ? row?.attendance_rate : row?.leave_rate;
    return {
      answer: `公司整体最近 3 个月${label}为 ${Math.round(Number(value ?? 0) * 10) / 10}%（在岗率 ${Math.round(Number(row?.attendance_rate ?? 0) * 10) / 10}%、请假率 ${Math.round(Number(row?.leave_rate ?? 0) * 10) / 10}%）。`,
      suggestion: null,
      data: [],
    };
  }

  // 4. 看板总览
  if (/(整体情况|看板|总览|盘点|全局)/.test(question)) {
    const d = await computeDashboardOverview();
    const riskTopText = d.hr.riskTop
      .map((r) => `${r.name}（${r.department}，风险分 ${r.riskScore}，${r.label}）`)
      .join('、');
    const lowRoutes = d.airline.lowestLoadRoutes
      .map((r) => `${r.route}（客座率 ${r.loadFactor}%）`)
      .join('、');
    const answer =
      `【人力】共 ${d.hr.totalEmployees} 名员工，整体在岗率 ${d.hr.attendanceRate}%，请假率 ${d.hr.leaveRate}%。` +
      `流失风险 Top5：${riskTopText}。干预动作分布：${d.hr.actionDistribution.map((a) => `${a.action} ${a.count} 人`).join('、')}。` +
      `\n【航空】近 3 个月共 ${d.airline.totalFlights} 个航班，整体客座率 ${d.airline.loadFactor}%，收入 ${fmtMoney(d.airline.revenue)}，毛利率 ${d.airline.grossMargin}%。低客座率航线：${lowRoutes}。`;
    return { answer, suggestion: null, data: [] };
  }

  return null;
}

async function findEmployeeName(question: string): Promise<string | null> {
  try {
    const { dbManager } = await import('../database/connection.js');
    const rows = await dbManager.query<Array<{ NAME: string }>>(
      `SELECT NAME FROM crm_employee_t`,
    );
    return rows.map((r) => String(r.NAME)).find((n) => n.length > 1 && question.includes(n)) ?? null;
  } catch {
    return null;
  }
}

function buildEmployeeAnswer(p: EmployeeProfile, s: BusinessSuggestion & { type: 'employee' }): string {
  return (
    `【${p.name}】人才画像\n` +
    `- 部门/岗位：${p.department} / ${p.position}（入职 ${p.hireDate}）\n` +
    `- 绩效等级：${p.performanceLevel}，考评走势：${p.reviewTrend.join(' → ') || '暂无'}\n` +
    `- 出勤：在岗率 ${p.attendanceRate}%，请假率 ${p.leaveRate}%，迟到 ${p.lateCount} 次，旷工 ${p.absentCount} 次\n` +
    `- 薪酬：月均 ${fmtMoney(p.avgSalary)}（部门均值 ${fmtMoney(p.deptAvgSalary)}）\n` +
    `- 人才标签：${p.label}；流失风险分 ${p.riskScore}\n` +
    `- 风险理由：${p.reasons.length ? p.reasons.join('；') : '暂无明显风险信号'}\n\n` +
    `干预建议：${s.actionLabel}。${s.description}`
  );
}

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString()} 元`;
}

async function saveHistory(
  question: string,
  sql: string | null,
  answer: string,
  startedAt: number,
  isError: boolean,
): Promise<void> {
  try {
    await historyService.add({
      question,
      sql,
      answer,
      executionTimeMs: Date.now() - startedAt,
      error: isError ? answer : null,
    });
  } catch (err) {
    logger.error('Failed to save history', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export default router;
