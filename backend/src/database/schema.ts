import type { RowDataPacket } from 'mysql2/promise';
import { dbManager } from './connection.js';
import type { SchemaInfo, TableInfo } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 校验表名/字段名是否为合法标识符，防止 SQL 注入 */
export function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

interface SchemaColumnRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

/**
 * 获取数据库完整 Schema：表、字段、行数、预览数据。
 * 该信息会提供给 LLM 用于生成 SQL。
 */
export async function getSchema(): Promise<SchemaInfo> {
  const database = dbManager.getConfig().database;

  const columnRows = await dbManager.query<SchemaColumnRow[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [database],
  );

  const tablesByName = new Map<string, TableInfo>();
  for (const row of columnRows) {
    let table = tablesByName.get(row.TABLE_NAME);
    if (!table) {
      table = { name: row.TABLE_NAME, columns: [] };
      tablesByName.set(row.TABLE_NAME, table);
    }
    table.columns.push({ name: row.COLUMN_NAME, dataType: row.DATA_TYPE });
  }

  const tables: TableInfo[] = [];
  for (const table of tablesByName.values()) {
    if (!isValidIdentifier(table.name)) {
      logger.warn('Skip table with invalid identifier', { table: table.name });
      continue;
    }
    const tableName = table.name;
    try {
      const countRows = await dbManager.query<CountRow[]>(
        `SELECT COUNT(*) AS cnt FROM \`${tableName}\``,
        undefined,
        15_000,
      );
      table.rowCount = countRows[0]?.cnt ?? 0;
    } catch (err) {
      logger.warn('Failed to count table rows', { table: tableName, error: String(err) });
    }
    try {
      const preview = await dbManager.query<RowDataPacket[]>(
        `SELECT * FROM \`${tableName}\` LIMIT 5`,
        undefined,
        15_000,
      );
      table.preview = preview.map((r) => ({ ...r }));
    } catch (err) {
      logger.warn('Failed to preview table', { table: tableName, error: String(err) });
    }
    tables.push(table);
  }

  return { database, connected: true, tables };
}

/** 把 Schema 格式化成适合作为 System Prompt 的文本 */
export function schemaToText(schema: SchemaInfo): string {
  const lines: string[] = [`Database: ${schema.database}`];
  for (const table of schema.tables) {
    lines.push(`\nTable: ${table.name}`);
    lines.push(`Columns:`);
    for (const col of table.columns) {
      lines.push(`  - ${col.name} (${col.dataType})`);
    }
    if (table.rowCount !== undefined) {
      lines.push(`Rows: ${table.rowCount}`);
    }
  }
  return lines.join('\n');
}
