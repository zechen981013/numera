import { Router } from 'express';
import { z } from 'zod';
import { config, updateOpenAiConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** GET /api/config：返回当前 AI 运行配置（绝不包含 API Key 明文） */
router.get('/config', (_req, res) => {
  res.json({
    aiMockMode: config.aiMockMode,
    model: config.openai.model,
    baseUrl: config.openai.baseUrl ?? null,
    hasApiKey: config.openai.apiKey.length > 0,
    historyFile: config.historyFile,
  });
});

/** POST /api/config：运行时更新配置（AI 模式切换 / API Key / Base URL / 模型） */
router.post('/config', (req, res) => {
  const schema = z.object({
    aiMockMode: z.boolean().optional(),
    openaiApiKey: z.string().max(300).optional(),
    openaiBaseUrl: z.string().max(500).nullable().optional(),
    openaiModel: z.string().max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: '参数不合法' });
  }
  const body = parsed.data;

  if (body.aiMockMode !== undefined) {
    config.aiMockMode = body.aiMockMode;
    logger.info('AI mode changed at runtime', { aiMockMode: config.aiMockMode });
  }
  const changedOpenAi =
    body.openaiApiKey !== undefined ||
    body.openaiBaseUrl !== undefined ||
    body.openaiModel !== undefined;
  if (changedOpenAi) {
    updateOpenAiConfig({
      apiKey: body.openaiApiKey,
      baseUrl: body.openaiBaseUrl,
      model: body.openaiModel,
    });
    logger.info('OpenAI config updated at runtime', {
      model: config.openai.model,
      baseUrl: config.openai.baseUrl ?? null,
      hasApiKey: config.openai.apiKey.length > 0,
    });
  }

  res.json({
    success: true,
    aiMockMode: config.aiMockMode,
    model: config.openai.model,
    hasApiKey: config.openai.apiKey.length > 0,
  });
});

export default router;
