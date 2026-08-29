import { useState } from 'react';
import { Loader2, Lock, Plane, User } from 'lucide-react';
import { api, setToken } from '../services/api';

interface LoginPageProps {
  onLogin: (username: string, role: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      setToken(res.token);
      onLogin(res.username, res.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950">
      {/* 背景装饰：航迹线 */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute left-[-10%] top-[18%] h-px w-[70%] rotate-[-18deg] bg-gradient-to-r from-transparent via-sky-300 to-transparent" />
        <div className="absolute left-[-5%] top-[40%] h-px w-[80%] rotate-[6deg] bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
        <div className="absolute left-[15%] top-[62%] h-px w-[65%] rotate-[-8deg] bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
        <div className="absolute right-[-8%] top-[26%] h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[10%] h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/40">
            <Plane size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">大湾区航空</h1>
          <p className="mt-0.5 text-sm text-slate-400">Greater Bay Airline · 企业智能分析平台</p>
          <p className="mt-3 text-sm text-slate-500">请登录后使用自然语言查询数据库</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">用户名</span>
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
              <User size={17} className="text-slate-400" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-300"
                placeholder="admin / user"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">密码</span>
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
              <Lock size={17} className="text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-300"
                placeholder="••••••"
              />
            </div>
          </label>
          {error && (
            <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-3 text-[15px] font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
          >
            {loading && <Loader2 size={17} className="animate-spin" />}
            登录
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          默认账号：管理员 <span className="font-mono text-slate-700">admin / admin123</span>
          <br />
          普通用户 <span className="font-mono text-slate-700">user / user123</span>
          <br />
          （可在 .env 中修改初始账号）
        </div>
      </div>
    </div>
  );
}
