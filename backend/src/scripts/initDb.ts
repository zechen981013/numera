/**
 * 数据库初始化脚本：根据 .env 配置创建数据库、数据表并导入演示数据。
 * 用法：npm run db:init （幂等，可重复执行；会重置 crm_employee_t 的演示数据）
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '..', '..', '..', 'database', 'init.sql');
  const sql = await readFile(sqlPath, 'utf-8');

  const { host, port, user, password } = config.db;
  logger.info('Initializing database', { host, port, user, database: config.db.database });

  const conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try {
    await conn.query(sql);
    logger.info('Database initialized successfully');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  logger.error('Database init failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
