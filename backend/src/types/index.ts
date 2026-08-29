/** 数据库连接配置（不含密码回传给前端） */
export interface DbConnectionInfo {
  host: string;
  port: number;
  user: string;
  database: string;
}

/** 数据库列信息 */
export interface ColumnInfo {
  name: string;
  dataType: string;
}

/** 数据库表信息 */
export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
  /** 前 5 行预览数据 */
  preview?: Record<string, unknown>[];
}

/** 数据库 Schema（提供给 LLM 与前端） */
export interface SchemaInfo {
  database: string;
  connected: boolean;
  tables: TableInfo[];
}

/** SQL Agent 的结构化输出 */
export interface SqlAgentResult {
  sql: string | null;
  explanation: string;
}

/** 单条查询历史 */
export interface HistoryEntry {
  id: string;
  question: string;
  sql: string | null;
  answer: string;
  timestamp: string;
  executionTimeMs?: number;
  error?: string | null;
}

/** /api/chat 的完整响应 */
export interface ChatResponse {
  success: boolean;
  question: string;
  sql: string | null;
  data: Record<string, unknown>[];
  answer: string;
  executionTimeMs: number;
  error?: string | null;
  /** 业务建议（打折建议 / 升育留裁），可能为空 */
  suggestion?: unknown | null;
}
