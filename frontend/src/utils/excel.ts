import * as XLSX from 'xlsx';

/** 偏好存储 key：用户选择「以后都别问」后写入 localStorage */
const SUGGEST_OFF_KEY = 'crm_suggest_export_off';

/** 是否已永久关闭「需要导出吗」建议 */
export function isSuggestExportDisabled(): boolean {
  return localStorage.getItem(SUGGEST_OFF_KEY) === '1';
}

/** 设置永久关闭开关 */
export function setSuggestExportDisabled(disabled: boolean): void {
  if (disabled) localStorage.setItem(SUGGEST_OFF_KEY, '1');
  else localStorage.removeItem(SUGGEST_OFF_KEY);
}

/** 分析/列表类意图词（命中才值得主动提议导出） */
const EXPORT_INTENT_WORDS = [
  '列表', '名单', '全部', '哪些', '分布', '统计', '排名', '最多', '最少',
  '比较', '有几个', '住在', '哪个', '多少', '员工', '部门', '所有', '明细',
];

/**
 * 是否值得主动提议导出（规则闸门，避免每个问题都打扰用户）：
 * 1. 结果 ≥ 5 行
 * 2. 列数 ≥ 2（排除单值聚合，如 average_salary）
 * 3. 问题包含分析/列表类意图词
 */
export function shouldSuggestExport(
  question: string,
  data: Record<string, unknown>[] | undefined,
): boolean {
  if (!data || data.length < 5) return false;
  if (Object.keys(data[0]).length <= 1) return false;
  return EXPORT_INTENT_WORDS.some((w) => question.includes(w));
}

/** 把行数据导出为 .xlsx 文件（浏览器自动下载） */
export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Sheet1',
): void {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, filename);
}

/** 解析上传的 Excel / CSV 文件，返回首张工作表的所有行 */
export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
}

/** 生成员工导入模板（含示例行） */
export function downloadEmployeeTemplate(): void {
  const template = [
    { 姓名: '陈八', 工资: 12000, 部门: '技术部', 邮箱: 'chenba@crmhk.com', 住址: '九龙油尖旺区弥敦道20号朗豪坊8楼808室' },
    { 姓名: '林九', 工资: 15000, 部门: '市场部', 邮箱: 'linjiu@crmhk.com', 住址: '香港岛湾仔区轩尼诗道288号英皇集团中心12楼1201室' },
  ];
  exportRowsToExcel(template as unknown as Record<string, unknown>[], '员工导入模板.xlsx', '员工导入');
}

/**
 * 把 Excel 行映射为后端导入接口需要的字段。
 * 兼容中英文列头：姓名/工资/部门/邮箱/住址 或 NAME/SALARY/DEPARTMENT_NAME/EMAIL/ADDRESS（可选 ID）
 */
export function mapImportRow(row: Record<string, unknown>): {
  id?: number;
  name: string;
  salary: number;
  departmentName: string;
  email?: string | null;
  address?: string | null;
} {
  const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  const num = (v: unknown): number => Number(str(v).replace(/,/g, ''));

  const idRaw = str(row['ID'] ?? row['id'] ?? row['编号']);
  const name = str(row['姓名'] ?? row['NAME'] ?? row['name']);
  const salary = num(row['工资'] ?? row['SALARY'] ?? row['salary']);
  const departmentName = str(row['部门'] ?? row['DEPARTMENT_NAME'] ?? row['departmentName'] ?? row['部门名称']);
  const email = str(row['邮箱'] ?? row['EMAIL'] ?? row['email']) || null;
  const address = str(row['住址'] ?? row['ADDRESS'] ?? row['address'] ?? row['地址']) || null;

  const result: {
    id?: number;
    name: string;
    salary: number;
    departmentName: string;
    email?: string | null;
    address?: string | null;
  } = {
    name,
    salary,
    departmentName,
    email,
    address,
  };
  const parsedId = Number(idRaw);
  if (idRaw && Number.isFinite(parsedId)) {
    result.id = parsedId;
  }
  return result;
}
