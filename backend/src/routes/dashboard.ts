import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  airlineSuggestion,
  computeAirlineDashboard,
  computeHrDashboard,
} from '../services/businessRules.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** 看板仅管理员（老板/管理层）可见 */
const dashboardGuard = [requireAuth, requireRole('admin')];

/**
 * GET /api/dashboard/hr
 * 人力看板：员工总数 / 在岗率 / 请假率 / 绩效分布 / 流失风险Top5 / 干预动作分布 / 部门对比。
 */
router.get('/dashboard/hr', dashboardGuard, async (_req: Request, res: Response) => {
  try {
    const startedAt = Date.now();
    const hr = await computeHrDashboard();
    logger.info('HR dashboard computed', { costMs: Date.now() - startedAt });
    res.json({ success: true, hr });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('HR dashboard failed', { error: message });
    res.status(500).json({ success: false, error: `人力看板计算失败：${message}` });
  }
});

/**
 * GET /api/dashboard/airline
 * 业务（航空）看板：航班数 / 客座率 / 收入 / 毛利率 / 月度趋势 / 低客座率航线 + 打折建议。
 */
router.get('/dashboard/airline', dashboardGuard, async (_req: Request, res: Response) => {
  try {
    const startedAt = Date.now();
    const [airline, suggestion] = await Promise.all([
      computeAirlineDashboard(),
      airlineSuggestion(),
    ]);
    logger.info('Airline dashboard computed', { costMs: Date.now() - startedAt });
    res.json({ success: true, airline, airlineSuggestion: suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Airline dashboard failed', { error: message });
    res.status(500).json({ success: false, error: `业务看板计算失败：${message}` });
  }
});

export default router;
