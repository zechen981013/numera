import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Plane } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ChatPage } from './pages/ChatPage';
import { AirlineDashboardPage } from './pages/AirlineDashboardPage';
import { HrDashboardPage } from './pages/HrDashboardPage';
import { DatabasePage } from './pages/DatabasePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { api, clearToken } from './services/api';
import type { AuthUser, PageKey } from './types';

export default function App() {
  const [page, setPage] = useState<PageKey>('chat');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // 恢复登录态：有 token 则拉取用户信息
  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) return;
    api
      .me()
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      });
  }, []);

  const refreshHealth = useCallback(() => {
    api
      .health()
      .then((h) => setConnected(h.dbConnected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const handleLogin = useCallback((_username: string, _role: string) => {
    api
      .me()
      .then((u) => {
        setUser(u);
        refreshHealth();
      })
      .catch(() => setUser(null));
  }, [refreshHealth]);

  const handleLogout = useCallback(() => {
    void api.logout();
    clearToken();
    setUser(null);
    setPage('chat');
  }, []);

  const goToChatAndAsk = useCallback((question: string) => {
    setPendingQuestion(question);
    setPage('chat');
  }, []);

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const pages: Record<PageKey, ReactElement> = {
    chat: (
      <ChatPage
        key="chat"
        pendingQuestion={pendingQuestion}
        onPendingQuestionConsumed={() => setPendingQuestion(null)}
      />
    ),
    dashboard: <AirlineDashboardPage key="dashboard" />,
    hr: <HrDashboardPage key="hr" />,
    database: <DatabasePage key="database" onConnected={refreshHealth} />,
    history: <HistoryPage key="history" onReask={goToChatAndAsk} />,
    settings: <SettingsPage key="settings" />,
    admin: <AdminPage key="admin" />,
  };

  return (
    <div className="flex h-screen bg-[#f3f6fb] text-slate-800">
      <Sidebar
        current={page}
        onChange={setPage}
        connected={connected}
        user={user}
        onLogout={handleLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-500/25">
              <Plane size={20} />
            </div>
            <div>
              <div className="text-[17px] font-bold leading-tight text-slate-900">
                大湾区航空
              </div>
              <div className="text-xs text-slate-500">
                Greater Bay Airline · 企业智能分析平台
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              {user.username}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  user.role === 'admin'
                    ? 'bg-indigo-500/10 text-indigo-600'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {user.role === 'admin' ? '管理员' : '用户'}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  connected ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              <span className={connected ? 'text-emerald-600' : 'text-red-500'}>
                {connected === null ? '检测中…' : connected ? '已连接' : '未连接'}
              </span>
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{pages[page]}</main>
      </div>
    </div>
  );
}
