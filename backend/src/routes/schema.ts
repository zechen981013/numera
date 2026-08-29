import { Router } from 'express';
import { getSchema } from '../database/schema.js';
import { dbManager } from '../database/connection.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** GET /api/schema：返回数据库 Schema（表、字段、行数、预览），同时返回当前连接信息（不含密码） */
router.get('/schema', async (_req, res) => {
  try {
    const schema = await getSchema();
    res.json({
      ...schema,
      connection: dbManager.getPublicConfig(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('GET /api/schema failed', { error: message });
    res.status(500).json({
      connected: false,
      database: dbManager.getConfig().database,
      error: `数据库连接失败：${message}`,
      connection: dbManager.getPublicConfig(),
    });
  }
});

export default router;
