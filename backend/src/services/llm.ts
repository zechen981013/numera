import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/** 模型发起的工具调用 */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type LlmChatResult =
  | { kind: 'tool'; calls: LlmToolCall[]; assistantMessage: ChatMessage }
  | { kind: 'answer'; content: string };

/**
 * LLM 服务封装（OpenAI 兼容接口）。
 * 使用 JSON 结构化输出（response_format: json_object），
 * 保证返回内容可直接解析为 JSON。
 */
class LlmService {
  private client: OpenAI | null = null;
  private clientApiKey = '';
  private clientBaseUrl: string | undefined;

  /** API Key / Base URL 变更时自动重建客户端（支持运行时修改，无需重启） */
  private getClient(): OpenAI {
    const { apiKey, baseUrl } = config.openai;
    if (!this.client || this.clientApiKey !== apiKey || this.clientBaseUrl !== baseUrl) {
      this.client = new OpenAI({ apiKey, baseURL: baseUrl || undefined });
      this.clientApiKey = apiKey;
      this.clientBaseUrl = baseUrl;
      logger.info('OpenAI client (re)created', { baseUrl: baseUrl ?? 'api.openai.com' });
    }
    return this.client;
  }

  /** 判断是否已配置可用的 API Key */
  isConfigured(): boolean {
    return config.openai.apiKey.length > 0;
  }

  /**
   * 调用 Chat Completions。
   * jsonMode=true 时要求返回 JSON 对象（用于 SQL Agent 的结构化输出）；
   * jsonMode=false 时返回自由文本（用于 Answer Agent 的自然语言回答）。
   * 失败或超时抛出错误，由上层捕获处理。
   */
  async chatJson(
    messages: ChatMessage[],
    temperature = 0,
    options?: { jsonMode?: boolean },
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('未配置 OPENAI_API_KEY，无法调用真实 LLM。请配置 API Key 或开启 AI_MOCK_MODE=true');
    }

    const jsonMode = options?.jsonMode ?? true;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.openai.timeoutMs);

    try {
      const response = await this.getClient().chat.completions.create(
        {
          model: config.openai.model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          temperature,
          ...(jsonMode ? { response_format: { type: 'json_object' } as const } : {}),
        },
        { signal: controller.signal },
      );
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('LLM 返回内容为空');
      }
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error('LLM request timeout', { timeoutMs: config.openai.timeoutMs });
        throw new Error(`LLM 请求超时（${config.openai.timeoutMs}ms）`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      logger.info('LLM call finished', { costMs: Date.now() - startedAt, model: config.openai.model });
    }
  }

  /**
   * 工具调用（Function Calling）：返回模型发起的工具调用列表，或最终回答。
   * 用于数据库 Agent 的多步分析（探查数据 → 执行 SQL → 得出结论）。
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: ChatCompletionTool[],
    temperature = 0,
  ): Promise<LlmChatResult> {
    if (!this.isConfigured()) {
      throw new Error('未配置 OPENAI_API_KEY，无法调用真实 LLM。请配置 API Key 或开启 AI_MOCK_MODE=true');
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.openai.timeoutMs);

    try {
      const response = await this.getClient().chat.completions.create(
        {
          model: config.openai.model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools,
          tool_choice: 'auto',
          temperature,
        },
        { signal: controller.signal },
      );
      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('LLM 返回内容为空');
      }
      if (message.tool_calls && message.tool_calls.length > 0) {
        const calls: LlmToolCall[] = message.tool_calls
          .filter((tc) => tc.type === 'function')
          .map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }));
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls
            .filter((tc) => tc.type === 'function')
            .map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
        };
        return { kind: 'tool', calls, assistantMessage };
      }
      return { kind: 'answer', content: message.content ?? '' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error('LLM tools request timeout', { timeoutMs: config.openai.timeoutMs });
        throw new Error(`LLM 请求超时（${config.openai.timeoutMs}ms）`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      logger.info('LLM tools call finished', {
        costMs: Date.now() - startedAt,
        model: config.openai.model,
      });
    }
  }

  /** 从 LLM 返回的文本中稳健地提取 JSON 对象 */
  static parseJson<T>(raw: string): T {
    return parseLlmJson<T>(raw);
  }
}

/** 从 LLM 返回的文本中稳健地提取 JSON 对象（独立函数，便于各处复用） */
export function parseLlmJson<T>(raw: string): T {
  const trimmed = raw.trim();
  // 直接解析
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // 忽略：尝试提取第一个 { ... } 片段
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 忽略：继续兜底处理
    }
  }
  throw new Error(`无法解析 LLM 返回的 JSON：${raw.slice(0, 200)}`);
}

export const llm = new LlmService();
