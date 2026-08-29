import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export type Role = 'admin' | 'user';

export interface AuthSession {
  username: string;
  role: Role;
}

interface StoredUser {
  username: string;
  passwordHash: string;
  role: Role;
}

interface UsersFile {
  users: StoredUser[];
}

/**
 * 简单 RBAC 认证服务：
 * - 账号保存在 backend/.data/users.json（密码为 sha256 哈希，不存明文）
 * - 首次启动时用 .env 的初始账号种子写入（默认 admin/admin123、user/user123）
 * - 登录成功发放随机 token，保存在内存中；后端重启后需重新登录
 */
class AuthService {
  private users: StoredUser[] = [];
  private sessions = new Map<string, AuthSession>();
  private loaded = false;

  private hash(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await readFile(config.usersFile, 'utf-8');
      const parsed = JSON.parse(raw) as UsersFile;
      if (Array.isArray(parsed.users)) this.users = parsed.users;
    } catch {
      // 文件不存在或损坏，从种子账号开始
      logger.info('users.json not found, seeding default accounts');
    }

    // 用 .env 中的种子账号补齐缺失的默认账号
    const seeds: Array<{ username: string; password: string; role: Role }> = [
      { ...config.seedUsers.admin, role: 'admin' },
      { ...config.seedUsers.user, role: 'user' },
    ];
    let changed = false;
    for (const seed of seeds) {
      if (!this.users.some((u) => u.username === seed.username)) {
        this.users.push({
          username: seed.username,
          passwordHash: this.hash(seed.password),
          role: seed.role,
        });
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(config.usersFile), { recursive: true });
    const payload: UsersFile = { users: this.users };
    await writeFile(config.usersFile, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /** 登录：成功返回 token，失败返回 null */
  async login(username: string, password: string): Promise<AuthSession & { token: string } | null> {
    await this.ensureLoaded();
    const user = this.users.find((u) => u.username === username);
    if (!user || user.passwordHash !== this.hash(password)) {
      return null;
    }
    const token = randomUUID();
    this.sessions.set(token, { username: user.username, role: user.role });
    logger.info('User logged in', { username: user.username, role: user.role });
    return { token, username: user.username, role: user.role };
  }

  /** 根据 token 获取会话 */
  getUserByToken(token: string): AuthSession | null {
    return this.sessions.get(token) ?? null;
  }

  /** 登出 */
  async logout(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

export const authService = new AuthService();
