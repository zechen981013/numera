import sqlParser from 'node-sql-parser';

const { Parser } = sqlParser;
const parser = new Parser();

/**
 * SQL 校验结果。
 * valid = true 时，sql 是去除末尾分号后的规范化 SQL，可直接执行。
 */
export interface SqlValidationResult {
  valid: boolean;
  sql?: string;
  reason?: string;
}

/** 禁止出现的 SQL 关键字（纵深防御，与 parser 双重校验） */
const BLOCKED_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|REPLACE|RENAME|SHOW|EXPLAIN|LOAD|LOCK|UNLOCK|KILL|RESET|MERGE|CALL|EXEC|EXECUTE|SET)\b/i;

/** 禁止访问的系统库 / 系统表 */
const BLOCKED_DATABASES = new Set(['mysql', 'information_schema', 'performance_schema', 'sys']);

/**
 * SQL 安全校验：
 * 1. 只允许单条 SELECT（使用 SQL Parser 解析 AST，避免纯字符串判断被绕过）
 * 2. 黑名单关键字纵深防御
 * 3. 禁止多语句（内部出现分号即拒绝）
 * 4. 禁止访问系统表；FROM 中引用的表必须是 Schema 中存在的表
 */
export function validateSql(
  rawSql: string,
  allowedTables: string[],
): SqlValidationResult {
  if (!rawSql || rawSql.trim().length === 0) {
    return { valid: false, reason: 'SQL 为空' };
  }

  const trimmed = rawSql.trim().replace(/;+\s*$/, '');
  if (!trimmed) {
    return { valid: false, reason: 'SQL 为空' };
  }

  // 禁止多语句
  if (trimmed.includes(';')) {
    return { valid: false, reason: '不允许执行多条 SQL 语句' };
  }

  // 黑名单关键字（跳过首条语句的第一个关键字，避免误伤 SELECT）
  const firstKeyword = trimmed.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  const restSql = trimmed.slice(firstKeyword?.length ?? 0);
  if (BLOCKED_KEYWORDS.test(restSql)) {
    return { valid: false, reason: 'SQL 中包含被禁止的关键字（仅允许 SELECT）' };
  }

  // 使用 SQL Parser 解析并检查 AST 类型
  let parsed: ReturnType<InstanceType<typeof Parser>['parse']>;
  try {
    parsed = parser.parse(trimmed, { database: 'MySQL' });
  } catch (err) {
    return {
      valid: false,
      reason: `SQL 解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const astList = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast];
  if (astList.length !== 1) {
    return { valid: false, reason: '不允许执行多条 SQL 语句' };
  }
  const root = astList[0] as { type?: string };
  if (root.type !== 'select') {
    return {
      valid: false,
      reason: `仅允许 SELECT 查询，当前语句类型：${root.type ?? 'unknown'}`,
    };
  }

  // 校验 FROM 中引用的表：必须属于 Schema，且禁止系统库表
  // tableList 格式："select::<db>::<table>"（无库时为 "select::null::<table>"）
  for (const ref of parsed.tableList) {
    const parts = ref.split('::');
    const db = parts[1] === 'null' ? '' : parts[1];
    const table = parts[2];
    if (!table) continue;

    if (db) {
      if (BLOCKED_DATABASES.has(db)) {
        return { valid: false, reason: `禁止访问系统表：${db}.${table}` };
      }
      // 跨库访问未授权表
      if (!allowedTables.includes(`${db}.${table}`)) {
        return { valid: false, reason: `引用了未授权的表：${db}.${table}` };
      }
    } else if (!allowedTables.includes(table)) {
      return { valid: false, reason: `引用了数据库中不存在的表：${table}` };
    }
  }

  return { valid: true, sql: trimmed };
}
