import mysql from 'mysql2/promise';
import { config, type DbConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * 数据库连接管理器。
 * 支持运行时通过 /api/database/connect 覆盖连接配置（内存中，不落盘），
 * 默认配置来自环境变量。
 */
class ConnectionManager {
  private runtimeConfig: DbConfig | null = null;
  private pool: mysql.Pool | null = null;

  /** 当前生效的连接配置（不包含任何敏感信息判断，password 仅后端使用） */
  getConfig(): DbConfig {
    return this.runtimeConfig ?? { ...config.db };
  }

  /** 返回可安全暴露给前端的连接信息（不含密码） */
  getPublicConfig(): { host: string; port: number; user: string; database: string } {
    const { host, port, user, database } = this.getConfig();
    return { host, port, user, database };
  }

  /** 运行时覆盖连接配置（用于前端 Database 页面） */
  setConfig(cfg: DbConfig): void {
    this.runtimeConfig = cfg;
    this.closePool();
    logger.info('Database runtime config updated');
  }

  private createPool(): mysql.Pool {
    const c = this.getConfig();
    return mysql.createPool({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      decimalNumbers: true, // DECIMAL 以 number 返回，便于展示
    });
  }

  getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = this.createPool();
    }
    return this.pool;
  }

  /** 测试当前配置是否可连接 */
  async testConnection(): Promise<void> {
    const conn = await this.getPool().getConnection();
    try {
      await conn.ping();
    } finally {
      conn.release();
    }
  }

  /** 执行查询，返回行数组（只允许 SELECT，由上层 validator 保证） */
  async query<T extends unknown[] = mysql.RowDataPacket[]>(
    sql: string,
    values?: unknown[],
    timeoutMs = 15_000,
  ): Promise<T> {
    const [rows] = await this.getPool().query<mysql.RowDataPacket[]>(
      { sql, timeout: timeoutMs },
      values,
    );
    return rows as T;
  }

  /**
   * 执行写操作（INSERT / UPDATE / DELETE），使用预编译参数化 SQL，防止注入。
   * 仅供管理员数据管理接口使用；聊天查询仍走 query + SELECT-only 校验。
   */
  async execute(
    sql: string,
    values: Array<string | number | null>,
  ): Promise<{ rows: mysql.RowDataPacket[]; affectedRows: number }> {
    const [result] = await this.getPool().execute<mysql.RowDataPacket[] | mysql.ResultSetHeader>(
      sql,
      values,
    );
    if (Array.isArray(result)) {
      return { rows: result, affectedRows: 0 };
    }
    return { rows: [], affectedRows: result.affectedRows };
  }

  closePool(): void {
    if (this.pool) {
      void this.pool.end().catch((err) => logger.warn('Failed to close db pool', { error: String(err) }));
      this.pool = null;
    }
  }
}

export const dbManager = new ConnectionManager();
