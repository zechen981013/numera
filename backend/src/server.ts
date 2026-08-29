import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import chatRouter from './routes/chat.js';
import schemaRouter from './routes/schema.js';
import historyRouter from './routes/history.js';
import databaseRouter from './routes/database.js';
import configRouter from './routes/config.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import dashboardRouter from './routes/dashboard.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 基础请求日志
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

// API 路由
app.use('/api', healthRouter);
app.use('/api', schemaRouter);
app.use('/api', historyRouter);
app.use('/api', databaseRouter);
app.use('/api', configRouter);
app.use('/api', authRouter);
app.use('/api', adminRouter);
app.use('/api', dashboardRouter);
app.use('/api', chatRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// 统一错误处理
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: `服务器内部错误：${err.message}` });
});

app.listen(config.port, () => {
  logger.info(`Backend server started on http://localhost:${config.port}`);
  logger.info('AI mode', {
    aiMockMode: config.aiMockMode,
    model: config.openai.model,
  });
  if (!config.aiMockMode && !config.openai.apiKey) {
    logger.warn('OPENAI_API_KEY 未配置且未开启 AI_MOCK_MODE，请配置 .env 后重启，或调用 POST /api/config 切换 Mock 模式');
  }
});
