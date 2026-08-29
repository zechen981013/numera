import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Plane,
  RefreshCw,
  Ticket,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import type { AirlineDashboardResponse } from '../types';
import { StatCard } from '../components/StatCard';

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString()} 元`;
}

/** 业务运营看板（航空）· 大湾区航空，仅管理员可见 */
export function AirlineDashboardPage() {
  const [data, setData] = useState<AirlineDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .getAirlineDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        <Loader2 size={18} className="mr-2 animate-spin" />
        正在计算业务指标…
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

  const { airline, airlineSuggestion } = data;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-sky-50/60 to-transparent p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-500/25">
            <Plane size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">业务运营看板 · 航空</h1>
            <p className="text-sm text-slate-500">近 3 个月多表实时聚合：客座率 / 毛利率 / 打折建议</p>
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

      {/* 核心指标卡 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Plane} label="航班总数" value={String(airline.totalFlights)} sub="近 3 个月 · 4 条航线" />
        <StatCard icon={TrendingUp} label="整体客座率" value={`${airline.loadFactor}%`} accent={airline.loadFactor < 60 ? 'red' : 'green'} sub="目标 ≥ 75%" />
        <StatCard icon={Wallet} label="总收入" value={fmtMoney(airline.revenue)} />
        <StatCard icon={Ticket} label="毛利率" value={`${airline.grossMargin}%`} accent={airline.grossMargin < 20 ? 'red' : 'green'} sub="盈亏平衡参考" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 双 Y 轴：客座率（左轴 0-100%）/ 平均票价（右轴） */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.05)]">
          <div className="mb-1 text-base font-semibold text-slate-800">月度客座率 vs 平均票价</div>
          <p className="mb-4 text-sm text-slate-400">左轴为客座率（%），右轴为平均票价（元）；8 月为促销月</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={airline.monthlyLoadFactor} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f8" />
              <XAxis dataKey="month" tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(v: number) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: '#d97706' }}
                tickFormatter={(v: number) => `¥${v}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: unknown, name: unknown) => [
                  name === 'loadFactor' ? `${v}%` : `¥${Number(v).toLocaleString()}`,
                  name === 'loadFactor' ? '客座率（左轴）' : '平均票价（右轴）',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'loadFactor' ? '客座率 %' : '平均票价 元'
                }
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="loadFactor"
                stroke="#2b93ea"
                strokeWidth={3}
                dot={{ r: 5, fill: '#2b93ea' }}
                activeDot={{ r: 7 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgPrice"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 5, fill: '#f59e0b' }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 低客座率航线 + 打折建议 */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.05)]">
            <div className="mb-4 text-base font-semibold text-slate-800">低客座率航线 Top4</div>
            <div className="space-y-3">
              {airline.lowestLoadRoutes.map((r) => (
                <div key={r.route} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-slate-600">{r.route}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-400"
                      style={{ width: `${Math.min(100, r.loadFactor)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-sm font-semibold text-slate-700">
                    {r.loadFactor}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-5 shadow-[0_8px_30px_rgb(16,185,129,0.08)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <TrendingUp size={16} />
              运营决策建议
            </div>
            <div className="mt-2 text-lg font-bold text-emerald-900">{airlineSuggestion.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{airlineSuggestion.description}</p>
            <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-white/70 px-3 py-2.5 text-xs leading-relaxed text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{airlineSuggestion.risk}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
