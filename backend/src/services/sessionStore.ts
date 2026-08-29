import { logger } from '../utils/logger.js';

/** 会话中的一轮对话（只保留纯文本，不含 SQL/工具细节，控制 token 占用） */
export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 会话上下文存储（内存版，进程重启后丢失）。
 * 用 Map 实现简单的容量上限：每会话最多保留最近 MAX_TURNS_PER_SESSION 条，
 * 全局最多 MAX_SESSIONS 个会话（超限按最久未更新淘汰）。
 */
class SessionStore {
  private sessions = new Map<string, SessionTurn[]>();
  private readonly maxTurnsPerSession: number;
  private readonly maxSessions: number;

  constructor(maxTurnsPerSession = 10, maxSessions = 200) {
    this.maxTurnsPerSession = maxTurnsPerSession;
    this.maxSessions = maxSessions;
  }

  /** 追加一轮对话，并裁剪到容量上限 */
  push(sessionId: string, turn: SessionTurn): void {
    if (!sessionId) return;
    const content = turn.content.trim();
    if (!content) return;

    let turns = this.sessions.get(sessionId);
    if (!turns) {
      // 新会话：超限时淘汰最久未更新的会话（Map 按插入序迭代）
      if (this.sessions.size >= this.maxSessions) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey !== undefined) {
          this.sessions.delete(oldestKey);
          logger.info('Session evicted (capacity)', { sessionId: oldestKey });
        }
      }
      turns = [];
      this.sessions.set(sessionId, turns);
    }
    turns.push(turn);
    while (turns.length > this.maxTurnsPerSession) {
      turns.shift();
    }
  }

  /** 获取会话最近的历史（用于注入 LLM 上下文） */
  getRecent(sessionId: string): SessionTurn[] {
    return this.sessions.get(sessionId)?.slice() ?? [];
  }

  /** 清空指定会话 */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const sessionStore = new SessionStore();
