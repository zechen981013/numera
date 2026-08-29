/**
 * 基础日志工具。
 * 约定：绝不允许打印 OPENAI_API_KEY / DB_PASSWORD 等敏感信息。
 */
const LEVEL_COLORS: Record<string, string> = {
  DEBUG: '\x1b[90m',
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
};
const RESET = '\x1b[0m';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  const time = new Date().toISOString();
  const color = LEVEL_COLORS[level] ?? '';
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  // eslint-disable-next-line no-console
  console.log(`${color}[${time}] [${level}]${RESET} ${message}${metaStr}`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('DEBUG', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('ERROR', message, meta),
};
