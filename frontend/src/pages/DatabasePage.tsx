import { useEffect, useState } from 'react';
import { Database, Loader2, Plug, Table2, AlertCircle } from 'lucide-react';
import type { SchemaResponse } from '../types';
import { api } from '../services/api';
import { ResultTable } from '../components/ResultTable';

interface DatabasePageProps {
  onConnected: () => void;
}

export function DatabasePage({ onConnected }: DatabasePageProps) {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState({ host: '', port: 3306, user: '', password: '', database: 'crm' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSchema = () => {
    setLoading(true);
    api
      .getSchema()
      .then((s) => {
        setSchema(s);
        if (s.connection) {
          setForm({
            host: s.connection.host,
            port: s.connection.port,
            user: s.connection.user,
            password: '',
            database: s.connection.database,
          });
        }
      })
      .catch((err) => setMessage({ type: 'error', text: err.message }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setMessage(null);
    try {
      await api.connectDatabase({
        host: form.host,
        port: Number(form.port),
        user: form.user,
        password: form.password || undefined,
        database: form.database,
      });
      setMessage({ type: 'success', text: '连接成功' });
      onConnected();
      loadSchema();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-indigo-500" />
          <h1 className="text-xl font-semibold text-slate-800">数据库连接与 Schema</h1>
        </div>

        <form
          onSubmit={handleConnect}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Host</span>
              <input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Port</span>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Username</span>
              <input
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">
                Password <span className="text-xs text-slate-400">（留空则沿用当前配置）</span>
              </span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-500">Database</span>
              <input
                value={form.database}
                onChange={(e) => setForm({ ...form, database: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
            {connecting ? '连接中…' : 'Connect'}
          </button>
          {message && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-red-50 text-red-600'
              }`}
            >
              {message.type === 'error' && <AlertCircle size={14} />}
              {message.text}
            </div>
          )}
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={16} className="text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Schema{loading && <Loader2 size={14} className="ml-2 inline animate-spin" />}
              </h2>
            </div>
            {schema?.connected && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
            )}
          </div>

          {!schema?.connected ? (
            <p className="text-sm text-red-500">{schema?.error ?? '未连接数据库'}</p>
          ) : (
            <div className="space-y-6">
              {schema.tables.map((table) => (
                <div key={table.name} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-800">
                      {table.name}
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {table.rowCount ?? 0} rows
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {table.columns.map((col) => (
                      <span
                        key={col.name}
                        className="rounded-md bg-white px-2 py-1 font-mono text-xs text-slate-600 shadow-sm"
                      >
                        {col.name}{' '}
                        <span className="text-slate-400">({col.dataType})</span>
                      </span>
                    ))}
                  </div>
                  {table.preview && table.preview.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <div className="mb-1">数据预览</div>
                      <ResultTable rows={table.preview} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
