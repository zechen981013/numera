import type { NextFunction, Request, Response } from 'express';
import { authService, type AuthSession, type Role } from '../services/authService.js';

/** 从请求头中解析 Bearer token */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** 读取当前登录用户（requireAuth 之后调用） */
export function getCurrentUser(res: Response): AuthSession {
  return res.locals.user as AuthSession;
}

/**
 * 登录校验中间件：未登录 / token 无效 / 过期 → 401
 * 校验通过后挂载 res.locals.user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: '未登录，请先登录' });
    return;
  }
  const session = authService.getUserByToken(token);
  if (!session) {
    res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
    return;
  }
  res.locals.user = session;
  next();
}

/** 角色校验：仅允许指定角色访问（需先经过 requireAuth） */
export function requireRole(role: Role): (req: Request, res: Response, next: NextFunction) => void {
  return (_req, res, next) => {
    const user = res.locals.user as AuthSession | undefined;
    if (!user || user.role !== role) {
      res.status(403).json({ success: false, error: '没有权限执行该操作（仅管理员可用）' });
      return;
    }
    next();
  };
}
