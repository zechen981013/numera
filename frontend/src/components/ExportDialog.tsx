import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { exportRowsToExcel } from '../utils/excel';

interface ExportDialogProps {
  rows: Record<string, unknown>[];
  defaultFileName: string;
  onClose: () => void;
}

/**
 * 导出 Excel 弹窗：导出前支持过滤（部门多选、姓名搜索）与列选择。
 * 所有登录用户可用（导出的是当前查询结果，不涉及后端权限）。
 */
export function ExportDialog({ rows, defaultFileName, onClose }: ExportDialogProps) {
  const columns = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]) : []), [rows]);

  const deptColumn = columns.find((c) => c.toUpperCase().includes('DEPARTMENT') || c.includes('部门'));
  const nameColumn = columns.find((c) => c.toUpperCase() === 'NAME' || c.includes('姓名'));

  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(columns));
  const [exported, setExported] = useState(false);

  const departments = useMemo(() => {
    if (!deptColumn) return [];
    return Array.from(new Set(rows.map((r) => String(r[deptColumn]).trim()).filter(Boolean)));
  }, [deptColumn, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (deptColumn && selectedDepts.size > 0) {
        const dept = String(row[deptColumn]).trim();
        if (!selectedDepts.has(dept)) return false;
      }
      if (nameColumn && nameFilter.trim()) {
        const name = String(row[nameColumn]);
        if (!name.includes(nameFilter.trim())) return false;
      }
      return true;
    });
  }, [rows, deptColumn, nameColumn, selectedDepts, nameFilter]);

  function toggleDept(dept: string) {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function handleExport() {
    const projected = filteredRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        if (selectedColumns.has(col)) out[col] = row[col];
      }
      return out;
    });
    exportRowsToExcel(projected, defaultFileName, 'Sheet1');
    setExported(true);
    window.setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800">导出 Excel</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* 部门过滤 */}
        {deptColumn && departments.length > 1 && (
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-medium text-slate-500">
              按部门过滤（{selectedDepts.size === 0 ? '全部' : `已选 ${selectedDepts.size} 个`}）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {departments.map((dept) => {
                const active = selectedDepts.has(dept);
                return (
                  <button
                    key={dept}
                    onClick={() => toggleDept(dept)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'bg-indigo-500 text-white'
                        : 'border border-slate-300 text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 姓名搜索 */}
        {nameColumn && (
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-medium text-slate-500">按姓名搜索</div>
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={`输入${nameColumn}过滤，例如「张」`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        )}

        {/* 列选择 */}
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-slate-500">选择导出的列</div>
          <div className="flex flex-wrap gap-2">
            {columns.map((col) => {
              const active = selectedColumns.has(col);
              return (
                <label
                  key={col}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                    active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleColumn(col)}
                    className="h-3.5 w-3.5 accent-indigo-500"
                  />
                  {col}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-400">
            共 {rows.length} 行，过滤后 <span className="font-medium text-slate-600">{filteredRows.length} 行</span>
            {selectedColumns.size !== columns.length && `，${selectedColumns.size} 列`}
          </span>
          <button
            onClick={handleExport}
            disabled={filteredRows.length === 0 || selectedColumns.size === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {exported ? <FileSpreadsheet size={15} /> : <Download size={15} />}
            {exported ? '已导出' : '导出 Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
