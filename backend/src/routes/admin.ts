import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { dbManager } from '../database/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** 项目演示表（固定常量，非用户输入，安全） */
const EMPLOYEE_TABLE = 'crm_employee_t';

interface EmployeeRow {
  ID: number;
  NAME: string;
  SALARY: number;
  DEPARTMENT_NAME: string;
  EMAIL: string | null;
  ADDRESS: string | null;
}

const createEmployeeSchema = z.object({
  // 不传 ID 时自动取 MAX(ID)+1
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  salary: z.number().positive('工资必须大于 0').max(10_000_000),
  departmentName: z.string().trim().min(1, '部门不能为空').max(100),
});

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  salary: z.number().positive().max(10_000_000).optional(),
  departmentName: z.string().trim().min(1).max(100).optional(),
});

/** 所有管理接口都需要登录 + 管理员角色（按路由挂载，避免误拦截其他 /api 路由） */
const adminGuard = [requireAuth, requireRole('admin')];

/** GET /api/admin/employees：员工列表 */
router.get('/admin/employees', adminGuard, async (_req: Request, res: Response) => {
  try {
    const rows = await dbManager.query<EmployeeRow[]>(
      `SELECT ID, NAME, SALARY, DEPARTMENT_NAME, EMAIL, ADDRESS
       FROM \`${EMPLOYEE_TABLE}\` ORDER BY ID`,
    );
    res.json({ success: true, employees: rows });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** POST /api/admin/employees：新增员工（管理员） */
router.post('/admin/employees', adminGuard, async (req: Request, res: Response) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '输入不合法',
    });
  }
  const { name, salary, departmentName, id } = parsed.data;
  let finalId = 0;
  try {
    finalId = id ?? 0;
    if (finalId === 0) {
      const rows = await dbManager.query<Array<{ next_id: number }>>(
        `SELECT COALESCE(MAX(ID), 0) + 1 AS next_id FROM \`${EMPLOYEE_TABLE}\``,
      );
      finalId = rows[0]?.next_id ?? 1;
    }
    await dbManager.execute(
      `INSERT INTO \`${EMPLOYEE_TABLE}\` (ID, NAME, SALARY, DEPARTMENT_NAME) VALUES (?, ?, ?, ?)`,
      [finalId, name, salary, departmentName],
    );
    const user = res.locals.user as { username: string };
    logger.info('Admin created employee', { id: finalId, by: user.username });
    res.json({ success: true, employee: { ID: finalId, NAME: name, SALARY: salary, DEPARTMENT_NAME: departmentName } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDuplicate = message.toLowerCase().includes('duplicate');
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: isDuplicate ? `员工 ID ${finalId} 已存在` : message,
    });
  }
});

/** PUT /api/admin/employees/:id：修改员工（管理员） */
router.put('/admin/employees/:id', adminGuard, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: '无效的员工 ID' });
  }
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '输入不合法',
    });
  }
  const fields: string[] = [];
  const values: Array<string | number> = [];
  if (parsed.data.name !== undefined) {
    fields.push('NAME = ?');
    values.push(parsed.data.name);
  }
  if (parsed.data.salary !== undefined) {
    fields.push('SALARY = ?');
    values.push(parsed.data.salary);
  }
  if (parsed.data.departmentName !== undefined) {
    fields.push('DEPARTMENT_NAME = ?');
    values.push(parsed.data.departmentName);
  }
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: '没有需要修改的字段' });
  }
  try {
    const { affectedRows } = await dbManager.execute(
      `UPDATE \`${EMPLOYEE_TABLE}\` SET ${fields.join(', ')} WHERE ID = ?`,
      [...values, id],
    );
    if (affectedRows === 0) {
      return res.status(404).json({ success: false, error: '员工不存在' });
    }
    const user = res.locals.user as { username: string };
    logger.info('Admin updated employee', { id, by: user.username });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** DELETE /api/admin/employees/:id：删除员工（管理员） */
router.delete('/admin/employees/:id', adminGuard, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: '无效的员工 ID' });
  }
  try {
    const { affectedRows } = await dbManager.execute(
      `DELETE FROM \`${EMPLOYEE_TABLE}\` WHERE ID = ?`,
      [id],
    );
    if (affectedRows === 0) {
      return res.status(404).json({ success: false, error: '员工不存在' });
    }
    const user = res.locals.user as { username: string };
    logger.info('Admin deleted employee', { id, by: user.username });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** 批量导入的单条员工（Excel 行） */
const importEmployeeSchema = z.object({
  // 不传 ID 时自动取 MAX(ID)+1
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  salary: z.coerce.number().positive('工资必须大于 0').max(10_000_000),
  departmentName: z.string().trim().min(1, '部门不能为空').max(100),
  email: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
});

const importBodySchema = z.object({
  employees: z.array(importEmployeeSchema).min(1, '没有可导入的数据').max(1000),
});

/**
 * POST /api/admin/employees/import
 * 批量导入员工（Excel 上传解析后由前端调用）。
 * 存在相同 ID 时按「覆盖更新」处理（upsert，幂等，可重复导入）。
 */
router.post('/admin/employees/import', adminGuard, async (req: Request, res: Response) => {
  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? '导入数据不合法',
      errors: parsed.error.issues,
    });
  }
  const rows = parsed.data.employees;
  const user = res.locals.user as { username: string };

  try {
    // 预取当前最大 ID（为未提供 ID 的行自动编号）
    const maxRows = await dbManager.query<Array<{ next_id: number }>>(
      `SELECT COALESCE(MAX(ID), 0) + 1 AS next_id FROM \`${EMPLOYEE_TABLE}\``,
    );
    let nextId = maxRows[0]?.next_id ?? 1;

    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      let id = row.id;
      if (id === undefined) {
        id = nextId++;
      }
      try {
        const { affectedRows } = await dbManager.execute(
          `INSERT INTO \`${EMPLOYEE_TABLE}\`
             (ID, NAME, SALARY, DEPARTMENT_NAME, EMAIL, ADDRESS)
           VALUES (?, ?, ?, ?, ?, ?) AS new
           ON DUPLICATE KEY UPDATE
             NAME = new.NAME,
             SALARY = new.SALARY,
             DEPARTMENT_NAME = new.DEPARTMENT_NAME,
             EMAIL = new.EMAIL,
             ADDRESS = new.ADDRESS`,
          [id, row.name, row.salary, row.departmentName, row.email ?? null, row.address ?? null],
        );
        if (affectedRows === 1) imported += 1;
        else if (affectedRows === 2) updated += 1;
        else if (affectedRows === 0) updated += 1; // 值完全相同的 upsert 也可能返回 0
      } catch (err) {
        errors.push(`行「${row.name}」(ID=${id})：${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info('Admin imported employees', {
      by: user.username,
      total: rows.length,
      imported,
      updated,
      failed: errors.length,
    });
    res.json({ success: true, total: rows.length, imported, updated, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
