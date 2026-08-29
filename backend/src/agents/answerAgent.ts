import { llm } from '../services/llm.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const ANSWER_AGENT_SYSTEM_PROMPT = `你是一个数据库查询结果回答助手。

你的任务：根据用户问题、实际执行的 SQL 和 SQL 的真实查询结果，生成一段简洁、准确的中文自然语言回答。

## 硬性规则
- 只允许使用给定的"查询结果"中的数据回答问题，绝对禁止编造或推断查询结果中不存在的数据
- 不允许自己计算数据库中没有的数值
- 金额等数字用千分位展示（如 25,000 元）
- 如果查询结果为空数组，如实说明"没有查询到相关数据"
- 回答要口语化、自然，直接回答用户问题，不要复述 SQL 或 JSON
- 直接输出回答文本，不要输出 JSON、不要用 Markdown 代码块`;

export interface AnswerAgentInput {
  question: string;
  sql: string | null;
  data: Record<string, unknown>[];
  /** SQL Agent 给出 sql 为 null 时的原因说明 */
  explanation?: string;
}

/**
 * Answer Agent：SQL 查询结果 → 自然语言回答。
 * 真实模式调用 LLM；Mock 模式使用基于真实结果列的模板格式化。
 */
export async function generateAnswer(input: AnswerAgentInput): Promise<string> {
  if (config.aiMockMode) {
    return mockGenerateAnswer(input);
  }
  return llmGenerateAnswer(input);
}

async function llmGenerateAnswer(input: AnswerAgentInput): Promise<string> {
  const startedAt = Date.now();
  const raw = await llm.chatJson(
    [
      { role: 'system', content: ANSWER_AGENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `用户问题：${input.question}`,
          `执行的 SQL：${input.sql ?? '（未生成 SQL）'}`,
          input.sql
            ? `查询结果：\n${JSON.stringify(input.data)}`
            : `未生成 SQL 的原因：${input.explanation ?? ''}`,
        ].join('\n'),
      },
    ],
    0.3,
    { jsonMode: false }, // 回答必须是自然语言纯文本，不是 JSON
  );
  logger.info('LLM answer generated', { costMs: Date.now() - startedAt });
  return parseAnswerObject(raw);
}

/** LLM 可能返回纯文本或 JSON 包装，统一提取自然语言文本 */
function parseAnswerObject(raw: string): string {
  let trimmed = raw.trim();
  // 去掉可能的 Markdown 代码块围栏
  trimmed = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/m, '').trim();
  try {
    const obj = JSON.parse(trimmed) as { answer?: unknown };
    if (typeof obj.answer === 'string' && obj.answer.length > 0) {
      return obj.answer.trim();
    }
  } catch {
    // 不是 JSON，当作纯文本
  }
  return trimmed;
}

/* ============================ Mock 模式 ============================ */

function formatNumber(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  // 去掉多余的小数位（如 25000.00 → 25000）
  const clean = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return clean.toLocaleString('en-US');
}

/** 从 SQL 中提取部门名（与实际执行的 WHERE 条件保持一致，避免编造） */
function extractDepartmentFromSql(sql: string): string | null {
  const match = sql.match(/DEPARTMENT_NAME\s*=\s*'([^']+)'/i);
  return match ? match[1] : null;
}

/** 从 SQL 中提取姓名（用于属性查询的回答） */
function extractNameFromSql(sql: string): string | null {
  const match = sql.match(/NAME\s*=\s*'([^']+)'/i);
  return match ? match[1] : null;
}

/**
 * Mock 生成回答：完全基于真实查询结果做模板化格式化，
 * 不计算任何数据库之外的数据。
 */
function mockGenerateAnswer(input: AnswerAgentInput): string {
  const { question, sql, data, explanation } = input;

  if (!sql) {
    return `抱歉，当前数据库无法回答这个问题。${explanation ?? ''}`;
  }
  if (data.length === 0) {
    return '没有查询到相关数据。';
  }

  const first = data[0];
  const keys = Object.keys(first);
  const upperKeys = keys.map((k) => k.toUpperCase());
  const dept = extractDepartmentFromSql(sql);
  const companyWide = question.includes('公司');

  const findKey = (alias: string[]): string | undefined => {
    const idx = upperKeys.findIndex((k) => alias.some((a) => k.includes(a)));
    return idx >= 0 ? keys[idx] : undefined;
  };

  // 平均工资
  const avgKey = findKey(['AVERAGE', 'AVG']);
  if (avgKey) {
    const prefix = dept ? `${dept}` : companyWide ? '整个公司' : '全部员工';
    return `${prefix}的平均工资是 ${formatNumber(first[avgKey])} 元。`;
  }

  // 总工资
  const sumKey = findKey(['TOTAL_SALARY', 'SUM']);
  if (sumKey) {
    const prefix = dept ? `${dept}` : companyWide ? '整个公司' : '全部员工';
    return `${prefix}的总工资是 ${formatNumber(first[sumKey])} 元。`;
  }

  // 按区统计：住址在哪个区的人最多
  const districtKey = findKey(['DISTRICT']);
  const districtCountKey = findKey(['TOTAL_EMPLOYEES', 'COUNT', 'CNT']);
  if (districtKey && districtCountKey) {
    const topDistrict = String(first[districtKey]);
    const topCount = formatNumber(first[districtCountKey]);
    const topList = data
      .slice(0, 3)
      .map((r) => `${String(r[districtKey])}区${formatNumber(r[districtCountKey])}人`)
      .join('、');
    return `住址在「${topDistrict}区」的员工最多，共 ${topCount} 人。${
      data.length > 1 ? `（前几：${topList}）` : ''
    }`;
  }

  // 计数
  const countKey = findKey(['COUNT', 'TOTAL_EMPLOYEES', 'CNT']);
  if (countKey) {
    const n = formatNumber(first[countKey]);
    return dept ? `${dept}共有 ${n} 人。` : `公司一共有 ${n} 人。`;
  }

  // 属性查询：张三的邮箱 / 住址 / 工资
  const person = extractNameFromSql(sql);
  const emailKey = findKey(['EMAIL']);
  if (person && emailKey) {
    return `${person}的邮箱是 ${String(first[emailKey])}。`;
  }
  const addressKey = findKey(['ADDRESS']);
  if (person && addressKey) {
    return `${person}的家庭住址是 ${String(first[addressKey])}。`;
  }
  const personSalaryKey = findKey(['SALARY']);
  if (person && personSalaryKey && data.length === 1) {
    return `${person}的工资是 ${formatNumber(first[personSalaryKey])} 元。`;
  }

  // 员工 + 工资（最高工资的人）
  const nameKey = findKey(['NAME']);
  const salaryKey = findKey(['SALARY']);
  if (nameKey && salaryKey) {
    const names = data.map((row) => String(row[nameKey])).join('、');
    const salaries = data.map((row) => formatNumber(row[salaryKey])).join('、');
    if (data.length === 1) {
      return `${names}，工资 ${salaries} 元。`;
    }
    const label = question.includes('最高') ? '工资最高的人' : '员工';
    return `${label}：${names}，工资分别是 ${salaries} 元。`;
  }

  // 兜底：把结果字段拼出来
  const parts = keys.map((k) => `${k}: ${String(first[k])}`).join('，');
  return `查询结果：${parts}。`;
}
