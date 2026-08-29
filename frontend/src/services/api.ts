import type {
  AppConfig,
  AuthUser,
  AirlineDashboardResponse,
  ChatResponse,
  DbConnectRequest,
  Employee,
  HealthResponse,
  HistoryEntry,
  HrDashboardResponse,
  LoginResponse,
  SchemaResponse,
} from '../types';

const API_BASE = '/api';
const TOKEN_KEY = 'crm_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

/** 401 时清空登录态，方便上层跳回登录页 */
function clearSessionOn401(res: Response): void {
  if (res.status === 401) {
    clearToken();
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    clearSessionOn401(res);
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  // ---------- 认证 / RBAC ----------
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<AuthUser>('/auth/me'),
  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }).catch(() => ({ success: false })),

  // ---------- 聊天 ----------
  sendQuestion: (question: string, sessionId?: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ question, ...(sessionId ? { sessionId } : {}) }),
    }),

  // ---------- 数据库 ----------
  getSchema: () => request<SchemaResponse>('/schema'),

  // ---------- 看板（仅管理员） ----------
  getHrDashboard: () => request<HrDashboardResponse>('/dashboard/hr'),
  getAirlineDashboard: () => request<AirlineDashboardResponse>('/dashboard/airline'),
  connectDatabase: (payload: DbConnectRequest) =>
    request<{ success: boolean; connection: SchemaResponse['connection'] }>('/database/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ---------- 历史 ----------
  getHistory: () => request<{ success: boolean; items: HistoryEntry[] }>('/history'),
  clearHistory: () => request<{ success: boolean }>('/history', { method: 'DELETE' }),

  // ---------- 配置 ----------
  getConfig: () => request<AppConfig>('/config'),
  setMockMode: (aiMockMode: boolean) =>
    request<{ success: boolean; aiMockMode: boolean }>('/config', {
      method: 'POST',
      body: JSON.stringify({ aiMockMode }),
    }),
  saveAiConfig: (payload: { openaiApiKey?: string; openaiBaseUrl?: string; openaiModel?: string }) =>
    request<{ success: boolean; model: string; hasApiKey: boolean; aiMockMode: boolean }>('/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ---------- 管理员数据管理 ----------
  adminListEmployees: () => request<{ success: boolean; employees: Employee[] }>('/admin/employees'),
  adminAddEmployee: (payload: {
    id?: number;
    name: string;
    salary: number;
    departmentName: string;
  }) =>
    request<{ success: boolean; employee: Employee }>('/admin/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminUpdateEmployee: (id: number, payload: { name?: string; salary?: number; departmentName?: string }) =>
    request<{ success: boolean }>(`/admin/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  adminDeleteEmployee: (id: number) =>
    request<{ success: boolean }>(`/admin/employees/${id}`, { method: 'DELETE' }),
  adminImportEmployees: (employees: Array<{
    id?: number;
    name: string;
    salary: number;
    departmentName: string;
    email?: string | null;
    address?: string | null;
  }>) =>
    request<{ success: boolean; total: number; imported: number; updated: number; failed: number; errors: string[] }>(
      '/admin/employees/import',
      { method: 'POST', body: JSON.stringify({ employees }) },
    ),
};
