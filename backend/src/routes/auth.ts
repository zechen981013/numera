import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50),
  password: z.string().min(1, '密码不能为空').max(100),
});

/** POST /api/auth/login：登录，返回 token */
router.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '输入不合法',
    });
  }
  const result = await authService.login(parsed.data.username, parsed.data.password);
  if (!result) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  res.json({ success: true, ...result });
});

/** GET /api/auth/me：获取当前登录用户信息 */
router.get('/auth/me', requireAuth, (_req, res) => {
  const user = res.locals.user as { username: string; role: string };
  res.json({ success: true, username: user.username, role: user.role });
});

/** POST /api/auth/logout：登出 */
router.post('/auth/logout', requireAuth, async (req, res) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) await authService.logout(token);
  res.json({ success: true });
});

export default router;
