import { llm, parseLlmJson } from '../services/llm.js';
import { validateSql } from '../services/sqlValidator.js';
import { schemaToText } from '../database/schema.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { SchemaInfo, SqlAgentResult } from '../types/index.js';

const SQL_AGENT_SYSTEM_PROMPT = `你是一个 MySQL SQL 生成专家。你的任务是根据：
1. 用户的中文自然语言问题
2. 数据库 Schema

生成正确的 MySQL SQL 查询。

## 硬性规则
- 只能使用 Schema 中提供的数据库表和字段，不允许猜测、编造任何表名或字段名
- 必须优先使用 SQL 进行计算：
  - 平均值使用 AVG
  - 总和使用 SUM
  - 数量使用 COUNT
  - 最大值使用 MAX
  - 最小值使用 MIN
  - 排名问题使用 ORDER BY ... DESC/ASC LIMIT 1
- "最高工资的人" 必须查询对应员工的姓名（NAME）和工资（SALARY），不能只返回最高工资数字
- 部门过滤必须使用 DEPARTMENT_NAME 字段，中文部门名称直接作为 SQL 字符串（如 '技术部'）
- 只生成 SELECT 查询；禁止 INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE / CREATE / GRANT / REVOKE
- 禁止访问系统表（mysql.*、information_schema.* 等）
- 只允许单条 SQL，禁止使用分号拼接多条语句
- 不允许使用 SQL 注释绕过上述限制
- 结果列尽量使用易懂的英文别名（如 average_salary、total_employees）

## 输出格式（必须输出合法 JSON 对象，不要输出 Markdown 代码块）：
{
  "sql": "SELECT ...;",
  "explanation": "对本次查询的简要中文说明"
}

如果用户的问题无法根据当前 Schema 回答（例如要求的字段不存在）：
{
  "sql": null,
  "explanation": "说明为什么当前数据库无法回答，例如缺失的字段名"
}`;

/**
 * SQL Agent：自然语言 → SQL。
 * 真实模式调用 LLM；Mock 模式使用内置规则生成（答案仍来自真实 MySQL 执行）。
 */
export async function generateSql(
  question: string,
  schema: SchemaInfo,
): Promise<SqlAgentResult> {
  const allowedTables = schema.tables.map((t) => t.name);

  const result = config.aiMockMode
    ? await mockGenerateSql(question, schema)
    : await llmGenerateSql(question, schema);

  // 无论如何，生成的 SQL 都必须通过安全校验
  if (result.sql) {
    const validation = validateSql(result.sql, allowedTables);
    if (!validation.valid) {
      logger.warn('Generated SQL rejected by validator', {
        sql: result.sql,
        reason: validation.reason,
      });
      return {
        sql: null,
        explanation: `生成的 SQL 未通过安全检查：${validation.reason ?? '未知原因'}`,
      };
    }
    result.sql = validation.sql ?? null;
  }

  return result;
}

/** 真实 LLM 生成 SQL */
async function llmGenerateSql(question: string, schema: SchemaInfo): Promise<SqlAgentResult> {
  const schemaText = schemaToText(schema);
  const startedAt = Date.now();
  const raw = await llm.chatJson([
    { role: 'system', content: SQL_AGENT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `## 数据库 Schema\n${schemaText}\n\n## 用户问题\n${question}`,
    },
  ]);
  logger.info('LLM SQL generated', { costMs: Date.now() - startedAt });
  const parsed = parseLlmJson<SqlAgentResult>(raw);
  if (typeof parsed.sql !== 'string' && parsed.sql !== null) {
    throw new Error('LLM 返回的 SQL 字段格式非法');
  }
  return {
    sql: parsed.sql,
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
  };
}

/* ============================ Mock 模式 ============================ */

import type { RowDataPacket } from 'mysql2/promise';

interface DepartmentRow extends RowDataPacket {
  DEPARTMENT_NAME: string;
}

interface NameRow extends RowDataPacket {
  NAME: string;
}

/** 数据库中存在的中文部门名（来自真实数据，非编造） */
async function fetchDepartments(mainTable: string): Promise<string[]> {
  try {
    const { dbManager } = await import('../database/connection.js');
    const rows = await dbManager.query<DepartmentRow[]>(
      `SELECT DISTINCT DEPARTMENT_NAME FROM \`${mainTable}\``,
    );
    return rows.map((r) => r.DEPARTMENT_NAME).filter(Boolean);
  } catch {
    return [];
  }
}

/** 数据库中的员工姓名（来自真实数据，用于属性查询） */
async function fetchNames(mainTable: string): Promise<string[]> {
  try {
    const { dbManager } = await import('../database/connection.js');
    const rows = await dbManager.query<NameRow[]>(
      `SELECT DISTINCT NAME FROM \`${mainTable}\``,
    );
    return rows.map((r) => r.NAME).filter(Boolean);
  } catch {
    return [];
  }
}

/** 问题中出现的员工姓名（基于数据库真实存在的姓名） */
async function detectPerson(question: string, mainTable: string): Promise<string | null> {
  const names = await fetchNames(mainTable);
  return names.find((n) => n.length > 1 && question.includes(n)) ?? null;
}

/** 问题中出现的部门（基于数据库真实存在的部门名；返回存在性标记） */
async function detectDepartment(
  question: string,
  mainTable: string,
): Promise<{ name: string | null; exists: boolean }> {
  const depts = await fetchDepartments(mainTable);
  // 中文部门名形如「XX部」
  const match = question.match(/([\u4e00-\u9fa5]{1,6}部)/);
  if (!match) {
    return { name: null, exists: false };
  }
  const name = match[1];
  if (depts.includes(name)) {
    return { name, exists: true };
  }
  return { name, exists: false };
}

/**
 * 根据问题关键词挑选最相关的主表（多表库下不再盲目取 tables[0]）。
 * 按「问题提到的字段在本表中的覆盖率」打分。
 */
function pickMainTable(schema: SchemaInfo, question: string) {
  const keywordToColumn: Array<[RegExp, string]> = [
    [/工资|薪酬|salary/i, 'SALARY'],
    [/邮箱|email/i, 'EMAIL'],
    [/住址|地址|住在|家庭/i, 'ADDRESS'],
    [/绩效|考评/i, 'PERFORMANCE_LEVEL'],
    [/部门/i, 'DEPARTMENT_NAME'],
    [/性别/i, 'GENDER'],
    [/电话/i, 'PHONE'],
    [/姓名|谁|员工/i, 'NAME'],
  ];
  let best: SchemaInfo['tables'][number] | null = null;
  let bestScore = -1;
  for (const table of schema.tables) {
    const cols = new Set(table.columns.map((c) => c.name.toUpperCase()));
    let score = 0;
    for (const [re, col] of keywordToColumn) {
      if (re.test(question) && cols.has(col)) score += 2;
    }
    if (cols.has('NAME')) score += 1; // 姓名是基础字段，优先选择含 NAME 的表
    if (score > bestScore) {
      bestScore = score;
      best = table;
    }
  }
  return best ?? schema.tables[0] ?? null;
}

/**
 * Mock 生成 SQL。
 * 注意：这里只做"中文问题 → SQL"的规则映射，SQL 仍会真正在 MySQL 上执行，
 * 最终答案完全来自真实查询结果，不会编造数据。
 */
async function mockGenerateSql(question: string, schema: SchemaInfo): Promise<SqlAgentResult> {
  const mainTable = pickMainTable(schema, question);
  if (!mainTable) {
    return { sql: null, explanation: '当前数据库没有任何表' };
  }
  const table = mainTable.name;
  const columns = mainTable.columns.map((c) => c.name.toUpperCase());
  const dept = await detectDepartment(question, table);

  // 问题提到了部门，但数据库中没有该部门（或该部门暂无员工）→ 如实说明
  if (dept.name && !dept.exists) {
    return {
      sql: null,
      explanation: `数据库中没有「${dept.name}」部门或该部门暂无员工`,
    };
  }

  const where = dept.name ? ` WHERE DEPARTMENT_NAME = '${dept.name}'` : '';
  const topic = question.includes('平均工资')
    ? 'avg'
    : question.includes('工资最高') || question.includes('最高工资')
      ? 'max-person'
      : question.includes('总工资') || question.includes('工资总和')
        ? 'sum'
        : question.includes('多少员工') ||
            question.includes('多少人') ||
            question.includes('员工数量') ||
            question.includes('一共有多少') ||
            question.includes('数量')
          ? 'count'
          : null;

  if (topic === 'avg') {
    if (!columns.includes('SALARY')) {
      return { sql: null, explanation: '数据库中没有工资（SALARY）字段' };
    }
    return {
      sql: `SELECT AVG(SALARY) AS average_salary FROM ${table}${where};`,
      explanation: `${dept.name ? `计算${dept.name}` : '计算全部员工'}的平均工资`,
    };
  }
  if (topic === 'max-person') {
    if (!columns.includes('SALARY') || !columns.includes('NAME')) {
      return { sql: null, explanation: '数据库中没有工资或姓名字段' };
    }
    return {
      sql: `SELECT NAME, SALARY FROM ${table}${where} ORDER BY SALARY DESC LIMIT 1;`,
      explanation: `${dept.name ? `查询${dept.name}` : '查询全部员工'}中工资最高的人`,
    };
  }
  if (topic === 'sum') {
    if (!columns.includes('SALARY')) {
      return { sql: null, explanation: '数据库中没有工资（SALARY）字段' };
    }
    return {
      sql: `SELECT SUM(SALARY) AS total_salary FROM ${table}${where};`,
      explanation: `${dept.name ? `计算${dept.name}` : '计算全部员工'}的总工资`,
    };
  }
  if (topic === 'count') {
    return {
      sql: `SELECT COUNT(*) AS total_employees FROM ${table}${where};`,
      explanation: `${dept.name ? `统计${dept.name}` : '统计全部'}员工人数`,
    };
  }

  // 分析题：住址在哪个区的人最多（如「住址在哪个区的人比较多」）
  const isDistrictQuestion =
    question.includes('哪个区') ||
    ((question.includes('住址') || question.includes('地址')) &&
      (question.includes('最多') || question.includes('哪个') || question.includes('多')));
  if (isDistrictQuestion) {
    if (!columns.includes('ADDRESS')) {
      return { sql: null, explanation: '数据库中没有住址（ADDRESS）字段' };
    }
    return {
      sql: `SELECT SUBSTRING_INDEX(ADDRESS, '区', 1) AS district, COUNT(*) AS total_employees FROM ${table} GROUP BY district ORDER BY total_employees DESC LIMIT 5;`,
      explanation: '按家庭住址中的区名统计员工人数，取最多的前 5 个区',
    };
  }

  // 属性查询：如「张三的邮箱是什么」「李四住哪里」「王五的工资是多少」
  const person = await detectPerson(question, table);
  if (person) {
    let col: string | null = null;
    let label = '';
    if (question.includes('邮箱') || /email/i.test(question)) {
      col = 'EMAIL';
      label = '邮箱';
    } else if (question.includes('住址') || question.includes('地址') || question.includes('住在')) {
      col = 'ADDRESS';
      label = '家庭住址';
    } else if (question.includes('工资')) {
      col = 'SALARY';
      label = '工资';
    }
    if (col) {
      if (!columns.includes(col)) {
        return { sql: null, explanation: `数据库中没有${label}（${col}）字段` };
      }
      return {
        sql: `SELECT NAME, ${col} FROM ${table} WHERE NAME = '${person}';`,
        explanation: `查询${person}的${label}`,
      };
    }
  }

  // 无法回答：检查问题中是否提到了 Schema 中没有的字段主题
  const fieldTopics: Array<[string, string]> = [
    ['年龄', 'AGE'],
    ['性别', 'GENDER'],
    ['邮箱', 'EMAIL'],
    ['电话', 'PHONE'],
    ['出生', 'BIRTH'],
    ['绩效', 'PERFORMANCE'],
    ['考勤', 'ATTENDANCE'],
  ];
  for (const [keyword, field] of fieldTopics) {
    if (question.includes(keyword) && !columns.includes(field)) {
      return {
        sql: null,
        explanation: `当前数据库的表 ${table} 中没有员工${keyword}（${field}）字段，因此无法回答该问题`,
      };
    }
  }

  return { sql: null, explanation: '当前数据库的表结构无法回答这个问题' };
}
