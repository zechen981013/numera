import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { HistoryEntry } from '../types/index.js';

const MAX_HISTORY = 200;

/**
 * 查询历史服务：以 JSON 文件持久化，避免引入额外依赖。
 * 记录 Question / SQL / Answer / Timestamp。
 */
class HistoryService {
  private entries: HistoryEntry[] = [];
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(config.historyFile, 'utf-8');
      const parsed = JSON.parse(raw) as HistoryEntry[];
      if (Array.isArray(parsed)) this.entries = parsed;
    } catch (err) {
      // 文件不存在或损坏时从空历史开始
      logger.warn('History file not loaded, starting empty', {
        file: config.historyFile,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async persist(): Promise<void> {
    try {
      await mkdir(path.dirname(config.historyFile), { recursive: true });
      await writeFile(config.historyFile, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to persist history', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry> {
    await this.ensureLoaded();
    const full: HistoryEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.entries.unshift(full);
    if (this.entries.length > MAX_HISTORY) {
      this.entries = this.entries.slice(0, MAX_HISTORY);
    }
    await this.persist();
    return full;
  }

  async list(limit = 50): Promise<HistoryEntry[]> {
    await this.ensureLoaded();
    return this.entries.slice(0, limit);
  }

  async getById(id: string): Promise<HistoryEntry | undefined> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.id === id);
  }

  async clear(): Promise<void> {
    this.entries = [];
    await this.persist();
  }
}

export const historyService = new HistoryService();
