import type { LucideIcon } from 'lucide-react';

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'red';
}) {
  const color =
    accent === 'red' ? 'text-red-500' : accent === 'green' ? 'text-emerald-500' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{label}</div>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className={`mt-1.5 text-3xl font-bold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
