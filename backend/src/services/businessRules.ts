import { dbManager } from '../database/connection.js';

/* ============================================================
 * 业务规则引擎：航空运营指标 / 打折建议 / 人才画像 / 风险分 / 干预建议 / 看板聚合
 * 所有结果都来自数据库真实数据，规则可解释、可演示。
 * ============================================================ */

interface Row extends Record<string, unknown> {}

/* ---------------- 航空：运营指标 ---------------- */

export interface AirlineMetrics {
  totalFlights: number;
  totalBookings: number;
  loadFactor: number; // 客座率 %
  revenue: number;
  cost: number;
  grossMargin: number; // 毛利率 %
  avgTicketPrice: number;
  monthlyLoadFactor: Array<{ month: string; loadFactor: number; avgPrice: number }>;
  promoVsNormal: { normalLoadFactor: number; promoLoadFactor: number; promoPriceDrop: number };
}

export async function computeAirlineMetrics(): Promise<AirlineMetrics> {
  // 航班侧与订单侧分别聚合，避免 JOIN 后 SUM 被重复放大
  const flightOverview = await dbManager.query<Row[]>(
    `SELECT COUNT(*) AS total_flights,
            SUM(TOTAL_SEATS) AS total_seats,
            SUM(OPERATING_COST) AS cost
     FROM airline_flight_t`,
  );
  const bookingOverview = await dbManager.query<Row[]>(
    `SELECT COUNT(*) AS total_bookings,
            COALESCE(SUM(TICKET_PRICE), 0) AS revenue
     FROM airline_booking_t`,
  );
  const fo = flightOverview[0];
  const bo = bookingOverview[0];
  const totalSeats = Number(fo?.total_seats ?? 0);
  const totalBookings = Number(bo?.total_bookings ?? 0);
  const revenue = Number(bo?.revenue ?? 0);
  const cost = Number(fo?.cost ?? 0);
  const loadFactor = totalSeats > 0 ? (totalBookings / totalSeats) * 100 : 0;
  const grossMargin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
  const avgTicketPrice = totalBookings > 0 ? revenue / totalBookings : 0;

  const flightMonthly = await dbManager.query<Row[]>(
    `SELECT DATE_FORMAT(FLIGHT_DATE, '%Y-%m') AS month, SUM(TOTAL_SEATS) AS seats
     FROM airline_flight_t GROUP BY month ORDER BY month`,
  );
  const bookingMonthly = await dbManager.query<Row[]>(
    `SELECT DATE_FORMAT(f.FLIGHT_DATE, '%Y-%m') AS month,
            COUNT(*) AS bookings,
            COALESCE(SUM(b.TICKET_PRICE), 0) AS revenue
     FROM airline_booking_t b
     JOIN airline_flight_t f ON b.FLIGHT_ID = f.FLIGHT_ID
     GROUP BY month ORDER BY month`,
  );
  const bmMap = new Map<string, { bookings: number; revenue: number }>();
  for (const bm of bookingMonthly) {
    bmMap.set(String(bm.month), {
      bookings: Number(bm.bookings),
      revenue: Number(bm.revenue),
    });
  }
  const monthlyLoadFactor = flightMonthly.map((fm) => {
    const month = String(fm.month);
    const s = Number(fm.seats);
    const bk = bmMap.get(month);
    const bookings = bk?.bookings ?? 0;
    return {
      month,
      loadFactor: s > 0 ? Math.round((bookings / s) * 1000) / 10 : 0,
      avgPrice: bookings > 0 ? Math.round(((bk?.revenue ?? 0) / bookings) * 100) / 100 : 0,
    };
  });

  // 促销（8月）vs 平时（6-7月）
  const promoFlights = await dbManager.query<Row[]>(
    `SELECT SUM(CASE WHEN FLIGHT_DATE >= '2026-08-01' THEN TOTAL_SEATS ELSE 0 END) AS promo_seats,
            SUM(CASE WHEN FLIGHT_DATE < '2026-08-01' THEN TOTAL_SEATS ELSE 0 END) AS normal_seats
     FROM airline_flight_t`,
  );
  const promoBookings = await dbManager.query<Row[]>(
    `SELECT SUM(CASE WHEN f.FLIGHT_DATE >= '2026-08-01' THEN 1 ELSE 0 END) AS promo_bookings,
            SUM(CASE WHEN f.FLIGHT_DATE < '2026-08-01' THEN 1 ELSE 0 END) AS normal_bookings,
            COALESCE(AVG(CASE WHEN f.FLIGHT_DATE >= '2026-08-01' THEN b.TICKET_PRICE END), 0) AS promo_price,
            COALESCE(AVG(CASE WHEN f.FLIGHT_DATE < '2026-08-01' THEN b.TICKET_PRICE END), 0) AS normal_price
     FROM airline_booking_t b
     JOIN airline_flight_t f ON b.FLIGHT_ID = f.FLIGHT_ID`,
  );
  const pf = promoFlights[0];
  const pb = promoBookings[0];
  const normalSeats = Number(pf?.normal_seats ?? 0);
  const normalBookings = Number(pb?.normal_bookings ?? 0);
  const promoSeats = Number(pf?.promo_seats ?? 0);
  const promoBookingsN = Number(pb?.promo_bookings ?? 0);
  const normalPrice = Number(pb?.normal_price ?? 0);
  const promoPrice = Number(pb?.promo_price ?? 0);
  const promoVsNormal = {
    normalLoadFactor: normalSeats > 0 ? Math.round((normalBookings / normalSeats) * 1000) / 10 : 0,
    promoLoadFactor: promoSeats > 0 ? Math.round((promoBookingsN / promoSeats) * 1000) / 10 : 0,
    promoPriceDrop: normalPrice > 0 ? Math.round((1 - promoPrice / normalPrice) * 1000) / 10 : 0,
  };

  return {
    totalFlights: Number(fo?.total_flights ?? 0),
    totalBookings,
    loadFactor: Math.round(loadFactor * 10) / 10,
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    grossMargin: Math.round(grossMargin * 10) / 10,
    avgTicketPrice: Math.round(avgTicketPrice * 100) / 100,
    monthlyLoadFactor,
    promoVsNormal,
  };
}

export interface AirlineSuggestion {
  type: 'airline';
  title: string;
  description: string;
  basis: string[];
  expectedEffect: string;
  risk: string;
}

/** 打折建议：基于近 3 个月真实运营数据 */
export async function airlineSuggestion(): Promise<AirlineSuggestion> {
  const m = await computeAirlineMetrics();
  const target = 75; // 目标客座率
  const gap = target - m.loadFactor;
  const basis = [
    `近 3 个月整体客座率 ${m.loadFactor}%，低于目标 ${target}%。`,
    `促销月（8月）客座率 ${m.promoVsNormal.promoLoadFactor}%，平时 ${m.promoVsNormal.normalLoadFactor}%；促销月票价平均下调 ${m.promoVsNormal.promoPriceDrop}%，客座率提升 ${Math.round((m.promoVsNormal.promoLoadFactor - m.promoVsNormal.normalLoadFactor) * 10) / 10} 个百分点。`,
    `当前平均票价 ${m.avgTicketPrice} 元，毛利率 ${m.grossMargin}%。`,
  ];
  // 弹性估算：每降 10% 价，客座率提升的百分点
  const liftPer10 = m.promoVsNormal.promoPriceDrop > 0
    ? Math.max(0, (m.promoVsNormal.promoLoadFactor - m.promoVsNormal.normalLoadFactor) / (m.promoVsNormal.promoPriceDrop / 10))
    : 5;
  const discountNeeded = gap > 0 ? (gap / (liftPer10 / 10)) : 0;
  const discount = Math.min(50, Math.round(discountNeeded / 5) * 5); // 取整到 5%
  const expected = m.loadFactor + (discount / 10) * liftPer10;

  return {
    type: 'airline',
    title: `建议票价下调约 ${discount}%（约 ${((100 - discount) / 10).toFixed(1)} 折）`,
    description: `基于最近 3 个月运营数据，当前客座率仅 ${m.loadFactor}%，建议通过打折吸引客流，预计客座率提升至约 ${Math.round(expected)}%。`,
    basis,
    expectedEffect: `按促销数据弹性推算，票价下调 ${discount}% 后客座率预计从 ${m.loadFactor}% 升至约 ${Math.round(expected)}%（若需求疲软则幅度不足）。`,
    risk: '淡季需求弹性可能低于促销月数据，建议先小范围试销 2 周再全量铺开。',
  };
}

/* ---------------- 人力：人才画像 / 风险 / 建议 ---------------- */

export interface EmployeeProfile {
  employeeId: number;
  name: string;
  department: string;
  position: string;
  performanceLevel: string;
  hireDate: string;
  attendanceRate: number; // 在岗率 %
  leaveRate: number; // 请假率 %
  lateCount: number;
  absentCount: number;
  avgSalary: number;
  deptAvgSalary: number;
  salaryBelowDept: boolean;
  reviewTrend: string[];
  riskScore: number;
  label: string; // 力争上游 / 稳步成长 / 有待观察 / 流失风险 / 边缘化
  reasons: string[];
}

const LEVEL_SCORE: Record<string, number> = { A: 4, 'B+': 3, B: 2, C: 1 };

/** 把 DATE 列（JS Date / 字符串）统一格式化为 YYYY-MM-DD */
function fmtDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return String(v ?? '').slice(0, 10);
}

export async function computeEmployeeProfile(name: string): Promise<EmployeeProfile | null> {
  // 员工主数据统一在 crm_employee_t（含工资/邮箱/住址 + HR 属性）
  const empRows = await dbManager.query<Row[]>(
    `SELECT * FROM crm_employee_t WHERE NAME = ? LIMIT 1`,
    [name],
  );
  const emp = empRows[0];
  if (!emp) return null;
  const empId = Number(emp.ID);

  // 考勤（近 3 个月）
  const att = await dbManager.query<Row[]>(
    `SELECT STATUS, COUNT(*) AS cnt FROM hr_attendance_t
     WHERE EMPLOYEE_ID = ? AND ATTEND_DATE >= '2026-06-01' GROUP BY STATUS`,
    [empId],
  );
  const attMap: Record<string, number> = {};
  for (const a of att) attMap[String(a.STATUS)] = Number(a.cnt);
  const totalDays = Object.values(attMap).reduce((s, n) => s + n, 0);
  const present = attMap.present ?? 0;
  const leave = attMap.leave ?? 0;
  const late = attMap.late ?? 0;
  const absent = attMap.absent ?? 0;
  const attendanceRate = totalDays > 0 ? (present / totalDays) * 100 : 100;
  const leaveRate = totalDays > 0 ? (leave / totalDays) * 100 : 0;

  // 工资：本人近 3 月均值 + 部门均值
  const mySalary = await dbManager.query<Row[]>(
    `SELECT AVG(BASE_SALARY + BONUS) AS avg_salary FROM hr_salary_t WHERE EMPLOYEE_ID = ?`,
    [empId],
  );
  const deptSalary = await dbManager.query<Row[]>(
    `SELECT AVG(s.BASE_SALARY + s.BONUS) AS avg_salary
     FROM hr_salary_t s JOIN crm_employee_t e ON s.EMPLOYEE_ID = e.ID
     WHERE e.DEPARTMENT_NAME = (SELECT DEPARTMENT_NAME FROM crm_employee_t WHERE ID = ?)`,
    [empId],
  );
  const avgSalary = Number(mySalary[0]?.avg_salary ?? 0);
  const deptAvgSalary = Number(deptSalary[0]?.avg_salary ?? 0);
  const salaryBelowDept = deptAvgSalary > 0 && avgSalary < deptAvgSalary * 0.8;

  // 考评趋势
  const reviews = await dbManager.query<Row[]>(
    `SELECT SCORE_LEVEL, SCORE, REVIEW_DATE FROM hr_review_t WHERE EMPLOYEE_ID = ? ORDER BY REVIEW_DATE`,
    [empId],
  );
  const reviewTrend = reviews.map((r) => String(r.SCORE_LEVEL));
  const lastTwo = reviewTrend.slice(-2);
  const declined = lastTwo.length === 2 && (LEVEL_SCORE[lastTwo[1]] ?? 0) < (LEVEL_SCORE[lastTwo[0]] ?? 0);

  // 风险分（加分制）
  const reasons: string[] = [];
  let risk = 0;
  if (declined) { risk += 20; reasons.push('绩效连续下滑（最近两次考评降级）'); }
  if (leaveRate > 10) { risk += 15; reasons.push(`请假率偏高（${leaveRate.toFixed(1)}%）`); }
  if (absent >= 2) { risk += 25; reasons.push(`近 3 个月旷工 ${absent} 次`); }
  if (salaryBelowDept) { risk += 20; reasons.push('工资低于部门均值 20% 以上'); }
  const hireYear = Number(fmtDate(emp.HIRE_DATE).slice(0, 4));
  const currentPerf = String(emp.PERFORMANCE_LEVEL);
  if (hireYear <= 2021 && (currentPerf === 'B' || currentPerf === 'C')) { risk += 10; reasons.push('入职超过 5 年绩效一般（长期未兑现潜力）'); }
  if ((currentPerf === 'A' || currentPerf === 'B+') && salaryBelowDept) { risk += 15; reasons.push('绩效优秀但薪酬偏低（激励不足）'); }

  // 标签
  let label = '有待观察';
  const isStar = (currentPerf === 'A' || currentPerf === 'B+') && attendanceRate >= 95 && leaveRate <= 3 && absent === 0;
  const isEdge = currentPerf === 'C' && (absent >= 2 || leaveRate > 12);
  if (isEdge) label = '边缘化';
  else if (risk >= 40) label = '流失风险';
  else if (isStar) label = '力争上游';
  else if (currentPerf === 'B+' || currentPerf === 'B') label = '稳步成长';

  return {
    employeeId: empId,
    name,
    department: String(emp.DEPARTMENT_NAME),
    position: String(emp.POSITION),
    performanceLevel: currentPerf,
    hireDate: fmtDate(emp.HIRE_DATE),
    attendanceRate: Math.round(attendanceRate * 10) / 10,
    leaveRate: Math.round(leaveRate * 10) / 10,
    lateCount: late,
    absentCount: absent,
    avgSalary: Math.round(avgSalary),
    deptAvgSalary: Math.round(deptAvgSalary),
    salaryBelowDept,
    reviewTrend,
    riskScore: risk,
    label,
    reasons,
  };
}

export interface EmployeeAction {
  type: 'employee';
  name: string;
  action: '升' | '育' | '留' | '裁';
  actionLabel: string;
  description: string;
  basis: string[];
}

/** 干预动作建议：升（升职加薪20%）/ 育（加薪+放权）/ 留 / 裁 */
export async function employeeActionSuggestion(name: string): Promise<EmployeeAction | null> {
  const p = await computeEmployeeProfile(name);
  if (!p) return null;
  const basis = [
    `人才标签：${p.label}；绩效：${p.performanceLevel}；在岗率 ${p.attendanceRate}%、请假率 ${p.leaveRate}%；流失风险分 ${p.riskScore}。`,
    ...p.reasons,
  ];
  let action: EmployeeAction['action'];
  let actionLabel: string;
  let description: string;

  if (p.label === '边缘化' || (p.riskScore >= 60 && p.performanceLevel === 'C')) {
    action = '裁';
    actionLabel = '裁（进入淘汰名单）';
    description = '长期低绩效且纪律/出勤问题突出，建议列入黑名单，有计划地淘汰，避免持续损耗。';
  } else if (p.label === '流失风险') {
    action = '育';
    actionLabel = '育（加薪 + 更大权力，不升职）';
    description = '有流失风险但仍有价值，通过加薪、授权、明确发展路径来挽留和激活。';
  } else if (p.label === '力争上游') {
    action = '升';
    actionLabel = '升（升职加薪 20%）';
    description = '高绩效、高在岗、潜力大，建议立即升职并加薪 20%，防止被挖角。';
  } else {
    action = '留';
    actionLabel = '留（维持现状留任）';
    description = '绩效稳定、出勤正常，是团队中坚力量，维持留任即可。';
  }

  return { type: 'employee', name, action, actionLabel, description, basis };
}

/* ---------------- 看板聚合（HR 与 航空 分开） ---------------- */

export interface HrDashboard {
  totalEmployees: number;
  attendanceRate: number;
  leaveRate: number;
  performanceDistribution: Array<{ level: string; count: number }>;
  riskTop: Array<{ name: string; department: string; riskScore: number; label: string }>;
  actionDistribution: Array<{ action: string; count: number }>;
  /** 部门对比：请假率 / 平均绩效分 / 人数 */
  departmentComparison: Array<{
    department: string;
    employees: number;
    leaveRate: number;
    attendanceRate: number;
    avgPerfScore: number;
  }>;
}

export interface AirlineDashboard {
  totalFlights: number;
  loadFactor: number;
  revenue: number;
  grossMargin: number;
  monthlyLoadFactor: Array<{ month: string; loadFactor: number; avgPrice: number }>;
  lowestLoadRoutes: Array<{ route: string; loadFactor: number }>;
}

/** 人力看板：员工总数 / 在岗率 / 请假率 / 绩效分布 / 风险Top5 / 动作分布 / 部门对比 */
export async function computeHrDashboard(): Promise<HrDashboard> {
  const hrOverview = await dbManager.query<Row[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN a.STATUS = 'present' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attendance_rate,
       SUM(CASE WHEN a.STATUS = 'leave' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS leave_rate
     FROM hr_attendance_t a`,
  );
  const perfDist = await dbManager.query<Row[]>(
    `SELECT PERFORMANCE_LEVEL AS level, COUNT(*) AS cnt FROM crm_employee_t GROUP BY PERFORMANCE_LEVEL ORDER BY cnt DESC`,
  );
  const perfLevels: Array<{ level: string; count: number }> = perfDist.map((r) => ({
    level: String(r.level),
    count: Number(r.cnt),
  }));

  // 全部员工画像（100 人逐个算，规模可接受）
  const empRows = await dbManager.query<Row[]>(`SELECT NAME FROM crm_employee_t`);
  const profiles: EmployeeProfile[] = [];
  for (const e of empRows) {
    const p = await computeEmployeeProfile(String(e.NAME));
    if (p) profiles.push(p);
  }
  profiles.sort((a, b) => b.riskScore - a.riskScore);
  const riskTop: HrDashboard['riskTop'] = profiles.slice(0, 5).map((p) => ({
    name: p.name,
    department: p.department,
    riskScore: p.riskScore,
    label: p.label,
  }));

  const actionDist: Record<string, number> = { 升: 0, 育: 0, 留: 0, 裁: 0 };
  for (const p of profiles) {
    const s = await employeeActionSuggestion(p.name);
    if (s) actionDist[s.action] += 1;
  }

  // 部门对比：请假率 / 在岗率 / 平均绩效分（A=4, B+=3, B=2, C=1）
  const deptRows = await dbManager.query<Row[]>(
    `SELECT e.DEPARTMENT_NAME AS department,
            COUNT(DISTINCT e.ID) AS employees,
            SUM(CASE WHEN a.STATUS = 'leave' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS leave_rate,
            SUM(CASE WHEN a.STATUS = 'present' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attendance_rate,
            AVG(CASE e.PERFORMANCE_LEVEL WHEN 'A' THEN 4 WHEN 'B+' THEN 3 WHEN 'B' THEN 2 ELSE 1 END) AS avg_perf
     FROM crm_employee_t e
     JOIN hr_attendance_t a ON e.ID = a.EMPLOYEE_ID
     GROUP BY e.DEPARTMENT_NAME
     ORDER BY leave_rate DESC`,
  );
  const departmentComparison: HrDashboard['departmentComparison'] = deptRows.map((r) => ({
    department: String(r.department),
    employees: Number(r.employees),
    leaveRate: Math.round(Number(r.leave_rate) * 10) / 10,
    attendanceRate: Math.round(Number(r.attendance_rate) * 10) / 10,
    avgPerfScore: Math.round(Number(r.avg_perf) * 100) / 100,
  }));

  const h = hrOverview[0];
  return {
    totalEmployees: empRows.length,
    attendanceRate: Math.round(Number(h?.attendance_rate ?? 0) * 10) / 10,
    leaveRate: Math.round(Number(h?.leave_rate ?? 0) * 10) / 10,
    performanceDistribution: perfLevels,
    riskTop,
    actionDistribution: Object.entries(actionDist).map(([action, count]) => ({ action, count })),
    departmentComparison,
  };
}

/** 航空看板：航班 / 客座率 / 收入 / 毛利率 / 月度趋势 / 低客座率航线 */
export async function computeAirlineDashboard(): Promise<AirlineDashboard> {
  const airline = await computeAirlineMetrics();
  const routeLoad = await dbManager.query<Row[]>(
    `SELECT r.route AS route,
            COALESCE(SUM(r.cnt), 0) / SUM(r.seats) * 100 AS load_factor
     FROM (
       SELECT f.ROUTE AS route, f.TOTAL_SEATS AS seats,
              COUNT(b.ORDER_ID) AS cnt
       FROM airline_flight_t f
       LEFT JOIN airline_booking_t b ON f.FLIGHT_ID = b.FLIGHT_ID
       GROUP BY f.FLIGHT_ID, f.ROUTE, f.TOTAL_SEATS
     ) r
     GROUP BY r.route ORDER BY load_factor`,
  );
  const lowestLoadRoutes = routeLoad.slice(0, 4).map((r) => ({
    route: String(r.route),
    loadFactor: Math.round(Number(r.load_factor) * 10) / 10,
  }));

  return {
    totalFlights: airline.totalFlights,
    loadFactor: airline.loadFactor,
    revenue: airline.revenue,
    grossMargin: airline.grossMargin,
    monthlyLoadFactor: airline.monthlyLoadFactor,
    lowestLoadRoutes,
  };
}

export interface DashboardOverview {
  hr: HrDashboard;
  airline: AirlineDashboard;
}

/** 合并看板（供 Chat 的「整体情况/看板」问题与兼容旧接口使用） */
export async function computeDashboardOverview(): Promise<DashboardOverview> {
  const [hr, airline] = await Promise.all([computeHrDashboard(), computeAirlineDashboard()]);
  return { hr, airline };
}
