import { Router } from 'express';
import { historyService } from '../services/historyService.js';

const router = Router();

/** GET /api/history：查询历史列表 */
router.get('/history', async (_req, res) => {
  try {
    const entries = await historyService.list(100);
    res.json({ success: true, items: entries });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** GET /api/history/:id：单条历史详情 */
router.get('/history/:id', async (req, res) => {
  const entry = await historyService.getById(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, error: '历史记录不存在' });
  }
  res.json({ success: true, item: entry });
});

/** DELETE /api/history：清空历史 */
router.delete('/history', async (_req, res) => {
  await historyService.clear();
  res.json({ success: true });
});

export default router;
