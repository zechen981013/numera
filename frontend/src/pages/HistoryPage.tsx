import { useEffect, useState } from 'react';
import { ChevronDown, History, RefreshCw, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '../types';
import { api } from '../services/api';

interface HistoryPageProps {
  onReask: (question: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryPage({ onReask }: HistoryPageProps) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getHistory()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  async function handleClear() {
    if (!window.confirm('确定要清空全部查询历史吗？')) return;
    await api.clearHistory();
    setItems([]);
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={20} className="text-indigo-500" />
            <h1 className="text-xl font-semibold text-slate-800">查询历史</h1>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {items.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              <RefreshCw size={13} /> 刷新
            </button>
            <button
              onClick={() => void handleClear()}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
            >
              <Trash2 size={13} /> 清空
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">加载中…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            暂无查询历史，去 Chat 页面提问吧
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{item.question}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{formatTime(item.timestamp)}</div>
                    </div>
                    {item.error ? (
                      <span className="shrink-0 text-xs text-red-500">失败</span>
                    ) : (
                      <span className="shrink-0 text-xs text-emerald-600">成功</span>
                    )}
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                      <div>
                        <div className="mb-1 text-xs font-medium text-slate-500">SQL</div>
                        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-emerald-300">
                          {item.sql ?? '（未生成 SQL）'}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-slate-500">回答</div>
                        <p className="text-sm text-slate-700">{item.answer}</p>
                      </div>
                      {item.executionTimeMs !== undefined && (
                        <div className="text-xs text-slate-400">
                          耗时 {item.executionTimeMs}ms
                        </div>
                      )}
                      <button
                        onClick={() => onReask(item.question)}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                      >
                        <RefreshCw size={12} /> 重新提问
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
