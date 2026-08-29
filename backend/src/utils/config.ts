import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * 加载环境变量：
 * 优先读取 backend/.env，其次读取项目根目录的 .env
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      dotenv.config({ path: file });
      break;
    }
  }
}

loadEnv();

function toNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined ? n : fallback;
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface OpenAiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
}

export const config = {
  port: toNumber(process.env.PORT, 4000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm',
  } satisfies DbConfig,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
    timeoutMs: toNumber(process.env.OPENAI_TIMEOUT_MS, 30_000),
  } satisfies OpenAiConfig,
  aiMockMode: process.env.AI_MOCK_MODE === 'true',
  dataDir: path.resolve(process.cwd(), '..', 'backend', '.data'),
  historyFile:
    process.env.HISTORY_FILE ||
    path.resolve(process.cwd(), '..', 'backend', '.data', 'history.json'),
  usersFile:
    process.env.USERS_FILE || path.resolve(process.cwd(), '..', 'backend', '.data', 'users.json'),
  // 初始账号（首次启动时写入 users.json；之后以后台文件为准）
  seedUsers: {
    admin: {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    },
    user: {
      username: process.env.USER_USERNAME || 'user',
      password: process.env.USER_PASSWORD || 'user123',
    },
  },
};

/** 运行时更新 OpenAI 配置（来自 Settings 页面，不重启生效） */
export function updateOpenAiConfig(partial: {
  apiKey?: string;
  model?: string;
  baseUrl?: string | null;
}): void {
  if (partial.apiKey !== undefined) {
    config.openai.apiKey = partial.apiKey.trim();
  }
  if (partial.model !== undefined) {
    config.openai.model = partial.model.trim() || config.openai.model;
  }
  if (partial.baseUrl !== undefined) {
    const url = partial.baseUrl === null ? '' : partial.baseUrl.trim();
    config.openai.baseUrl = url.length > 0 ? url : undefined;
  }
}
