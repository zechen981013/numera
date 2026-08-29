import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  CalendarCheck,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import type { HrDashboardResponse } from '../types';
import { StatCard } from '../components/StatCard';

/** HR（人才流失预测与干预）看板：仅管理员可见 */
export function HrDashboardPage() {
  const [data, setData] = useState<HrDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .getHrDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        <Loader2 size={18} className="mr-2 animate-spin" />
        正在计算人力指标…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-red-500">
        <span>看板加载失败：{error}</span>
        <button
          onClick={load}
          className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
        >
          <RefreshCw size={13} />
          重试
        </button>
      </div>
    );
  }

  const { hr } = data;
  const perfColors: Record<string, string> = { A: '#10b981', 'B+': '#84cc16', B: '#f59e0b', C: '#ef4444' };
  const actionColors: Record<string, string> = { 升: '#10b981', 育: '#f59e0b', 留: '#3b82f6', 裁: '#ef4444' };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-sky-50/60 to-transparent p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-700 to-indigo-500 text-white shadow-lg shadow-indigo-500/25">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">HR 看板 · 人才流失预测与干预</h1>
            <p className="text-sm text-slate-500">考勤 + 工资 + 考评 → 人才画像 → 升 / 育 / 留 / 裁建议</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Briefcase} label="员工总数" value={String(hr.totalEmployees)} sub="10 个部门 · 全司统一主数据" />
        <StatCard icon={CalendarCheck} label="整体在岗率" value={`${hr.attendanceRate}%`} accent={hr.attendanceRate < 90 ? 'red' : 'green'} sub="越高越稳定" />
        <StatCard icon={AlertCircle} label="整体请假率" value={`${hr.leaveRate}%`} accent={hr.leaveRate > 10 ? 'red' : 'green'} sub="异常升高 = 风险信号" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <BarChart3 size={13} className="text-indigo-500" />
            绩效等级分布
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hr.performanceDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="level" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => [`${v} 人`, '人数']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {hr.performanceDistribution.map((p) => (
                  <Cell key={p.level} fill={perfColors[p.level] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-slate-600">流失风险 Top5</div>
          <div className="space-y-2">
            {hr.riskTop.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-700">
                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                    {r.name}
                    <span className="ml-1.5 text-slate-400">{r.department}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{r.label}</div>
                </div>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                    r.riskScore >= 60
                      ? 'bg-red-100 text-red-600'
                      : r.riskScore >= 40
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {r.riskScore}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-slate-600">干预动作分布（升/育/留/裁）</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={hr.actionDistribution}
                dataKey="count"
                nameKey="action"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
              >
                {hr.actionDistribution.map((a) => (
                  <Cell key={a.action} fill={actionColors[a.action] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v: unknown, name: unknown) => [`${v} 人`, `${name}类`]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3">
            {hr.actionDistribution.map((a) => (
              <span key={a.action} className="flex items-center gap-1 text-[11px] text-slate-600">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: actionColors[a.action] }} />
                {a.action} {a.count} 人
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 部门对比 */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Users size={13} className="text-indigo-500" />
          部门对比（按请假率排序）
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="py-2 pr-3 font-medium">部门</th>
                <th className="py-2 pr-3 font-medium">人数</th>
                <th className="py-2 pr-3 font-medium">请假率</th>
                <th className="py-2 pr-3 font-medium">在岗率</th>
                <th className="py-2 font-medium">平均绩效分（A=4~C=1）</th>
              </tr>
            </thead>
            <tbody>
              {hr.departmentComparison.map((d) => (
                <tr key={d.department} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-700">{d.department}</td>
                  <td className="py-2 pr-3 text-slate-500">{d.employees}</td>
                  <td className={`py-2 pr-3 font-medium ${d.leaveRate > 5 ? 'text-red-500' : 'text-slate-600'}`}>
                    {d.leaveRate}%
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{d.attendanceRate}%</td>
                  <td className="py-2 text-slate-600">{d.avgPerfScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
