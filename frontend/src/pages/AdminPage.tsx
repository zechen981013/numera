import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Employee } from '../types';
import { api } from '../services/api';
import {
  downloadEmployeeTemplate,
  exportRowsToExcel,
  mapImportRow,
  parseExcelFile,
} from '../utils/excel';

interface EmployeeForm {
  id: string;
  name: string;
  salary: string;
  departmentName: string;
}

const EMPTY_FORM: EmployeeForm = { id: '', name: '', salary: '', departmentName: '' };

export function AdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .adminListEmployees()
      .then((res) => setEmployees(res.employees))
      .catch((err) => setMessage({ type: 'error', text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(emp: Employee) {
    setEditingId(emp.ID);
    setForm({
      id: String(emp.ID),
      name: emp.NAME,
      salary: String(emp.SALARY),
      departmentName: emp.DEPARTMENT_NAME,
    });
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const salary = Number(form.salary);
    const departmentName = form.departmentName.trim();
    if (!name || !departmentName || !Number.isFinite(salary) || salary <= 0) {
      setMessage({ type: 'error', text: '请填写有效的姓名、工资和部门' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      if (editingId === null) {
        const id = form.id.trim() ? Number(form.id) : undefined;
        await api.adminAddEmployee({ id, name, salary, departmentName });
        setMessage({ type: 'success', text: '已添加员工' });
      } else {
        await api.adminUpdateEmployee(editingId, { name, salary, departmentName });
        setMessage({ type: 'success', text: `已更新员工 ${editingId}` });
      }
      resetForm();
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(emp: Employee) {
    if (!window.confirm(`确定删除员工「${emp.NAME}」(ID=${emp.ID}) 吗？`)) return;
    try {
      await api.adminDeleteEmployee(emp.ID);
      setMessage({ type: 'success', text: `已删除员工 ${emp.NAME}` });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  function handleExport() {
    const rows = employees.map((e) => ({
      ID: e.ID,
      姓名: e.NAME,
      工资: e.SALARY,
      部门: e.DEPARTMENT_NAME,
      邮箱: e.EMAIL ?? '',
      住址: e.ADDRESS ?? '',
    }));
    exportRowsToExcel(rows as unknown as Record<string, unknown>[], '员工数据.xlsx', '员工');
    setMessage({ type: 'success', text: `已导出 ${rows.length} 名员工` });
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setMessage(null);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setMessage({ type: 'error', text: 'Excel 中没有数据' });
        return;
      }
      const employeesToImport = rows.map(mapImportRow);
      const valid = employeesToImport.filter((r) => r.name && r.departmentName && r.salary > 0);
      if (valid.length === 0) {
        setMessage({ type: 'error', text: '未识别到有效的员工数据，请参考「下载导入模板」的列头' });
        return;
      }
      const skipped = rows.length - valid.length;
      const confirmed = window.confirm(
        `解析到 ${rows.length} 行，其中有效 ${valid.length} 行${skipped > 0 ? `（跳过 ${skipped} 行无效数据）` : ''}。\n相同 ID 的员工会被覆盖更新。确定导入吗？`,
      );
      if (!confirmed) return;
      const res = await api.adminImportEmployees(valid);
      setMessage({
        type: 'success',
        text: `导入完成：新增 ${res.imported} 条，更新 ${res.updated} 条${res.failed > 0 ? `，失败 ${res.failed} 条` : ''}。`,
      });
      if (res.errors.length > 0) {
        setMessage({ type: 'error', text: res.errors.slice(0, 3).join('；') });
      }
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-amber-500" />
          <h1 className="text-lg font-semibold text-slate-800">Admin · 数据管理</h1>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            仅管理员
          </span>
        </div>
        <p className="text-sm text-slate-500">
          在这里直接增删改 <span className="font-mono">crm_employee_t</span> 的数据（使用参数化 SQL，防注入）。
          修改后 Chat 中的自然语言查询会立即读到最新数据。
        </p>

        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 新增 / 编辑表单 */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId === null ? '添加员工' : `编辑员工（ID=${editingId}）`}
            </h2>
            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
              >
                <X size={13} /> 取消编辑
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">ID（可选，留空自动）</span>
              <input
                value={form.id}
                disabled={editingId !== null}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">姓名 *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">工资 *</span>
              <input
                type="number"
                min="1"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">部门 *</span>
              <input
                value={form.departmentName}
                onChange={(e) => setForm({ ...form, departmentName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {editingId === null ? '添加' : '保存修改'}
          </button>
        </form>

        {/* 员工列表 */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-700">员工列表（{employees.length} 人）</h2>
            <div className="flex items-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
              <button
                onClick={handleExport}
                disabled={employees.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                <FileSpreadsheet size={13} /> 导出 Excel
              </button>
              <button
                onClick={downloadEmployeeTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
              >
                <FileDown size={13} /> 导入模板
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
              >
                {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {importing ? '导入中…' : '导入 Excel'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                }}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                  <th className="px-5 py-2.5 font-medium">ID</th>
                  <th className="px-5 py-2.5 font-medium">姓名</th>
                  <th className="px-5 py-2.5 font-medium">工资</th>
                  <th className="px-5 py-2.5 font-medium">部门</th>
                  <th className="px-5 py-2.5 font-medium">邮箱</th>
                  <th className="px-5 py-2.5 font-medium">住址</th>
                  <th className="px-5 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.ID} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-mono text-slate-500">{emp.ID}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{emp.NAME}</td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {emp.SALARY.toLocaleString('en-US')} 元
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{emp.DEPARTMENT_NAME}</td>
                    <td className="px-5 py-2.5 text-slate-500">{emp.EMAIL ?? '—'}</td>
                    <td className="max-w-[220px] truncate px-5 py-2.5 text-slate-500" title={emp.ADDRESS ?? ''}>
                      {emp.ADDRESS ?? '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => startEdit(emp)}
                        className="mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                      >
                        <Pencil size={12} /> 编辑
                      </button>
                      <button
                        onClick={() => void handleDelete(emp)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                      暂无员工数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
