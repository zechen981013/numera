import {
  Database,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plane,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { AuthUser, PageKey } from '../types';

interface SidebarProps {
  current: PageKey;
  onChange: (page: PageKey) => void;
  connected: boolean | null;
  user: AuthUser;
  onLogout: () => void;
}

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof Database;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'chat', label: '智能问答', icon: MessageSquare },
  { key: 'dashboard', label: '业务看板 · 航空', icon: LayoutDashboard, adminOnly: true },
  { key: 'hr', label: 'HR 看板 · 人才', icon: Users, adminOnly: true },
  { key: 'database', label: '数据库', icon: Database },
  { key: 'history', label: '查询历史', icon: History },
  { key: 'admin', label: '数据管理', icon: ShieldCheck, adminOnly: true },
  { key: 'settings', label: '设置', icon: Settings },
];

export function Sidebar({ current, onChange, connected, user, onLogout }: SidebarProps) {
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin');

  return (
    <aside className="flex w-60 flex-col bg-gradient-to-b from-navy-700 via-navy-800 to-navy-950 text-slate-300">
      {/* 品牌区 */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-sky-500/30">
          <Plane size={22} />
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-bold leading-tight text-white">大湾区航空</div>
          <div className="truncate text-xs text-slate-400">Greater Bay Airline</div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1.5 px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-all ${
                active
                  ? 'bg-white/10 font-medium text-white shadow-inner ring-1 ring-white/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} className={active ? 'text-sky-300' : ''} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* 用户区 */}
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
        <div className="mb-2.5 flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {connected ? '数据库已连接' : '数据库未连接'}
        </div>
        <div className="flex items-center justify-between">
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">
              {user.username}
              <span
                className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  user.role === 'admin'
                    ? 'bg-sky-400/20 text-sky-300'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {user.role === 'admin' ? '管理员' : '用户'}
              </span>
            </span>
          </span>
          <button
            onClick={onLogout}
            title="退出登录"
            className="flex items-center gap-1 text-slate-400 transition-colors hover:text-red-400"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
