/** 与后端 /types/index.ts 保持一致 */

export interface ChatResponse {
  success: boolean;
  question: string;
  sql: string | null;
  data: Record<string, unknown>[];
  answer: string;
  executionTimeMs: number;
  error?: string | null;
  /** 业务建议（打折建议 / 升育留裁），可能为空 */
  suggestion?: Suggestion | null;
}

/** 人才干预建议（升/育/留/裁） */
export interface EmployeeActionSuggestion {
  type: 'employee';
  name: string;
  action: '升' | '育' | '留' | '裁';
  actionLabel: string;
  description: string;
  basis: string[];
}

/** 航空打折建议 */
export interface AirlineSuggestion {
  type: 'airline';
  title: string;
  description: string;
  basis: string[];
  expectedEffect: string;
  risk: string;
}

export type Suggestion = EmployeeActionSuggestion | AirlineSuggestion;

/** 人力看板数据 */
export interface HrDashboard {
  totalEmployees: number;
  attendanceRate: number;
  leaveRate: number;
  performanceDistribution: Array<{ level: string; count: number }>;
  riskTop: Array<{ name: string; department: string; riskScore: number; label: string }>;
  actionDistribution: Array<{ action: string; count: number }>;
  departmentComparison: Array<{
    department: string;
    employees: number;
    leaveRate: number;
    attendanceRate: number;
    avgPerfScore: number;
  }>;
}

export interface HrDashboardResponse {
  success: boolean;
  hr: HrDashboard;
}

/** 业务（航空）看板数据 */
export interface AirlineDashboard {
  totalFlights: number;
  loadFactor: number;
  revenue: number;
  grossMargin: number;
  monthlyLoadFactor: Array<{ month: string; loadFactor: number; avgPrice: number }>;
  lowestLoadRoutes: Array<{ route: string; loadFactor: number }>;
}

export interface AirlineDashboardResponse {
  success: boolean;
  airline: AirlineDashboard;
  airlineSuggestion: AirlineSuggestion;
}

export interface HistoryEntry {
  id: string;
  question: string;
  sql: string | null;
  answer: string;
  timestamp: string;
  executionTimeMs?: number;
  error?: string | null;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
  preview?: Record<string, unknown>[];
}

export interface SchemaResponse {
  database: string;
  connected: boolean;
  tables: TableInfo[];
  connection?: { host: string; port: number; user: string; database: string };
  error?: string;
}

export interface DbConnectRequest {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface AppConfig {
  aiMockMode: boolean;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  historyFile: string;
}

export type Role = 'admin' | 'user';

export interface AuthUser {
  username: string;
  role: Role;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  username: string;
  role: Role;
}

/** 管理员数据管理中的员工 */
export interface Employee {
  ID: number;
  NAME: string;
  SALARY: number;
  DEPARTMENT_NAME: string;
  EMAIL?: string | null;
  ADDRESS?: string | null;
}

export interface HealthResponse {
  status: string;
  dbConnected: boolean;
  aiMockMode: boolean;
  time: string;
}

export type PageKey = 'chat' | 'dashboard' | 'hr' | 'database' | 'history' | 'settings' | 'admin';
