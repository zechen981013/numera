import { Router } from 'express';
import { z } from 'zod';
import { dbManager } from '../database/connection.js';
import { logger } from '../utils/logger.js';

const router = Router();

const connectBodySchema = z.object({
  host: z.string().trim().min(1).default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  user: z.string().trim().min(1).default('root'),
  // 密码可选：不传则沿用当前运行配置的密码
  password: z.string().optional(),
  database: z.string().trim().min(1).default('crm'),
});

/**
 * POST /api/database/connect
 * 运行时更新数据库连接配置并测试连接。
 * 注意：配置只保存在内存中，密码不会返回给前端，也不会写入任何文件。
 */
router.post('/database/connect', async (req, res) => {
  const parsed = connectBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '连接配置不合法',
    });
  }

  const current = dbManager.getConfig();
  const password = parsed.data.password !== undefined ? parsed.data.password : current.password;

  dbManager.setConfig({
    host: parsed.data.host,
    port: parsed.data.port,
    user: parsed.data.user,
    password,
    database: parsed.data.database,
  });

  try {
    await dbManager.testConnection();
    logger.info('Database connected', {
      host: parsed.data.host,
      port: parsed.data.port,
      database: parsed.data.database,
    });
    res.json({ success: true, connection: dbManager.getPublicConfig() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Database connection failed', { error: message });
    res.status(400).json({ success: false, error: `数据库连接失败：${message}` });
  }
});

export default router;
