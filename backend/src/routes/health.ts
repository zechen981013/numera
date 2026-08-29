import { Router } from 'express';

const router = Router();

/** 健康检查：服务存活 + 数据库连通性 */
router.get('/health', async (_req, res) => {
  try {
    const { dbManager } = await import('../database/connection.js');
    await dbManager.testConnection();
    res.json({
      status: 'ok',
      dbConnected: true,
      aiMockMode: (await import('../utils/config.js')).config.aiMockMode,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.json({
      status: 'degraded',
      dbConnected: false,
      dbError: err instanceof Error ? err.message : String(err),
      time: new Date().toISOString(),
    });
  }
});

export default router;
