/**
 * 业务演示数据初始化脚本：航空运营（2 表）+ 人力分析（3 流水表）。
 * 员工主数据统一使用 crm_employee_t（100 人，含工资/邮箱/住址 + HR 属性），
 * 每人补齐近 3 个月考勤/工资流水与 2 期考评，保证「问数系统」与「HR 系统」人员一致。
 * 用法：npm run db:seed   （幂等：重建 crm_employee_t + 清空流水表再重插）
 *
 * 数据规模：
 * - 航空：4 条航线 × 92 天（2026-06-01 ~ 2026-08-31）≈ 368 个航班、约 2 万张订单
 * - 人力：100 名员工 / 10 个部门，约 6,600 条考勤、300 条工资、200 条考评
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.resolve(__dirname, '..', '..', '..', 'backend', '.data');

/* ---------- 可复现随机数 ---------- */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260828);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const randFloat = (min: number, max: number) => min + rand() * (max - min);
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

/* ---------- 建表 SQL ---------- */
const DDL = [
  // 统一员工主数据表（工资/邮箱/住址 + HR 属性）
  `CREATE TABLE IF NOT EXISTS crm_employee_t (
     ID INT PRIMARY KEY,
     NAME VARCHAR(50) NOT NULL,
     GENDER VARCHAR(10),
     SALARY DECIMAL(10,2) NOT NULL,
     DEPARTMENT_NAME VARCHAR(100),
     EMAIL VARCHAR(100),
     ADDRESS VARCHAR(200),
     POSITION VARCHAR(50),
     HIRE_DATE DATE,
     STATUS VARCHAR(20) DEFAULT 'active',
     PERFORMANCE_LEVEL VARCHAR(10)
   )`,
  `CREATE TABLE IF NOT EXISTS airline_flight_t (
     FLIGHT_ID INT PRIMARY KEY,
     ROUTE VARCHAR(50) NOT NULL,
     AIRPLANE_MODEL VARCHAR(50),
     TOTAL_SEATS INT NOT NULL,
     OPERATING_COST DECIMAL(12,2) NOT NULL,
     FLIGHT_DATE DATE NOT NULL,
     STATUS VARCHAR(20) DEFAULT 'completed'
   )`,
  `CREATE TABLE IF NOT EXISTS airline_booking_t (
     ORDER_ID INT PRIMARY KEY,
     FLIGHT_ID INT NOT NULL,
     PASSENGER_NAME VARCHAR(50) NOT NULL,
     TICKET_PRICE DECIMAL(10,2) NOT NULL,
     BOOKED_AT DATETIME NOT NULL,
     INDEX idx_flight (FLIGHT_ID)
   )`,
  `CREATE TABLE IF NOT EXISTS hr_attendance_t (
     RECORD_ID INT PRIMARY KEY AUTO_INCREMENT,
     EMPLOYEE_ID INT NOT NULL,
     ATTEND_DATE DATE NOT NULL,
     STATUS VARCHAR(20) NOT NULL,
     INDEX idx_emp_date (EMPLOYEE_ID, ATTEND_DATE)
   )`,
  `CREATE TABLE IF NOT EXISTS hr_salary_t (
     RECORD_ID INT PRIMARY KEY AUTO_INCREMENT,
     EMPLOYEE_ID INT NOT NULL,
     SALARY_MONTH CHAR(7) NOT NULL,
     BASE_SALARY DECIMAL(10,2) NOT NULL,
     BONUS DECIMAL(10,2) DEFAULT 0,
     DEDUCTION DECIMAL(10,2) DEFAULT 0,
     NET_SALARY DECIMAL(10,2) NOT NULL,
     INDEX idx_emp_month (EMPLOYEE_ID, SALARY_MONTH)
   )`,
  `CREATE TABLE IF NOT EXISTS hr_review_t (
     RECORD_ID INT PRIMARY KEY AUTO_INCREMENT,
     EMPLOYEE_ID INT NOT NULL,
     REVIEW_DATE DATE NOT NULL,
     SCORE_LEVEL VARCHAR(5) NOT NULL,
     SCORE DECIMAL(4,1) NOT NULL,
     COMMENT VARCHAR(200),
     INDEX idx_emp (EMPLOYEE_ID)
   )`,
];

/* ---------- 生成航空数据（不变） ---------- */
function buildAirlines() {
  const flights = [];
  const bookings = [];
  const routes = [
    { route: 'HKG-PEK', basePrice: 1200, model: 'A320', seats: 150 },
    { route: 'HKG-SHA', basePrice: 1000, model: 'A321', seats: 180 },
    { route: 'HKG-SZX', basePrice: 800, model: 'B737', seats: 120 },
    { route: 'HKG-TPE', basePrice: 1500, model: 'A330', seats: 160 },
  ];
  const surnames = ['张', '李', '王', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑', '梁', '谢', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾'];
  const givens = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '子轩', '浩然', '思远', '雨桐', '佳琪', '晨曦', '梓萱', '若曦', '语嫣', '一诺'];
  let flightId = 1;
  let orderId = 1;

  const start = new Date('2026-06-01');
  const end = new Date('2026-08-31');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const isPromo = d.getMonth() === 7; // 8 月 = 促销月（打折吸引上座）
    for (const r of routes) {
      const flight = {
        FLIGHT_ID: flightId,
        ROUTE: r.route,
        AIRPLANE_MODEL: r.model,
        TOTAL_SEATS: r.seats,
        OPERATING_COST: r.seats * 260,
        FLIGHT_DATE: dateStr,
        STATUS: 'completed',
      };
      flights.push(flight);

      // 上座人数：促销月 50%~80%，平时 20%~45%
      const pax = isPromo
        ? randInt(Math.floor(r.seats * 0.5), Math.floor(r.seats * 0.8))
        : randInt(Math.floor(r.seats * 0.2), Math.floor(r.seats * 0.45));

      for (let i = 0; i < pax; i++) {
        const price = isPromo
          ? Math.round((r.basePrice * randFloat(0.55, 0.8)) * 100) / 100
          : Math.round((r.basePrice * randFloat(0.95, 1.05)) * 100) / 100;
        const bookedAt = new Date(d);
        bookedAt.setDate(bookedAt.getDate() - randInt(0, 30));
        bookings.push({
          ORDER_ID: orderId,
          FLIGHT_ID: flightId,
          PASSENGER_NAME: `${pick(surnames)}${pick(givens)}`,
          TICKET_PRICE: price,
          BOOKED_AT: `${bookedAt.toISOString().slice(0, 10)} ${String(randInt(0, 23)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00`,
        });
        orderId++;
      }
      flightId++;
    }
  }
  return { flights, bookings };
}

/* ---------- 生成 100 名员工（统一主数据） ---------- */
function buildPeople() {
  const deptPositions: Record<string, string[]> = {
    技术部: ['后端工程师', '前端工程师', '测试工程师', '架构师', 'DevOps', '数据库管理员'],
    研发部: ['算法工程师', '研发工程师', '产品经理', 'UI设计师', '技术专家'],
    财务部: ['会计', '出纳', '财务分析', '税务专员', '审计', '预算主管'],
    人事部: ['HRBP', '招聘专员', '薪酬专员', '培训经理', '员工关系'],
    市场部: ['市场专员', '品牌经理', '活动策划', '内容运营', 'SEO', '媒介经理'],
    销售部: ['销售代表', '大客户经理', '渠道经理', '销售主管', '电话销售', '商务拓展'],
    运营部: ['运营专员', '数据分析师', '客服主管', '流程优化', '项目管理', '运营经理'],
    行政部: ['行政专员', '前台', '后勤主管', '资产管理'],
    客服部: ['客服专员', '客服主管', '投诉处理', 'VIP客户经理'],
    采购部: ['采购专员', '采购经理', '供应商管理', '库存管理'],
  };
  const surnames = ['张', '李', '王', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑', '梁', '谢', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '萧', '田', '董', '袁', '潘', '蒋', '蔡', '余', '杜', '叶'];
  const givens = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '子轩', '浩然', '思远', '雨桐', '佳琪', '晨曦', '梓萱', '若曦', '语嫣', '一诺'];
  const districts = ['中西区', '湾仔区', '东区', '南区', '油尖旺区', '深水埗区', '九龙城区', '黄大仙区', '观塘区', '荃湾区', '屯门区', '元朗区', '北区', '大埔区', '西贡区', '沙田区', '葵青区', '离岛区'];
  const streets = ['波斯富街', '轩尼诗道', '弥敦道', '南京街', '上海街', '太子道', '长沙湾道', '青山公路', '西贡公路', '大埔道', '新界路', '中环街', '金钟道', '花园道', '德辅道', '皇后大道', '告士打道', '怡和街', '礼顿道', '崇光百货街'];

  const departments = Object.keys(deptPositions);
  const deptBase: Record<string, number> = {
    技术部: 22000, 研发部: 21000, 财务部: 16000, 人事部: 15000, 市场部: 14000,
    销售部: 13000, 运营部: 13000, 行政部: 12000, 客服部: 10000, 采购部: 12000,
  };
  const usedNames = new Set<string>();
  const employees = [];
  for (let i = 0; i < 100; i++) {
    let name = '';
    for (let attempt = 0; attempt < 300; attempt++) {
      const candidate = `${pick(surnames)}${pick(givens)}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        name = candidate;
        break;
      }
    }
    const dept = departments[Math.floor(i / 10)]; // 每部门 10 人
    const posList = deptPositions[dept];
    const profile = i % 10 === 0 ? 'star' : i % 10 === 9 ? 'risk' : 'stable'; // 每部门 1 星 1 险
    const perf =
      profile === 'star' ? (i % 20 === 0 ? 'A' : 'B+')
      : profile === 'risk' ? 'C'
      : 'B';
    // 工资：稳定型围绕部门均值，风险型明显偏低，明星型偏高
    const salaryScale =
      profile === 'risk' ? randFloat(0.72, 0.88)
      : profile === 'star' ? randFloat(1.1, 1.3)
      : randFloat(0.95, 1.12);
    const salary = Math.round(deptBase[dept] * salaryScale * 100) / 100;
    const hireYear = 2016 + randInt(0, 9);
    const hireMonth = randInt(1, 12);
    const hireDay = randInt(1, 28);
    employees.push({
      ID: i + 1,
      NAME: name,
      GENDER: i % 2 === 0 ? '男' : '女',
      SALARY: salary,
      DEPARTMENT_NAME: dept,
      EMAIL: `employee${i + 1}@crmhk.com`,
      ADDRESS: `${pick(districts)}${pick(streets)}${randInt(1, 999)}号${['apm', '国际大厦', '中心', '广场', '大厦'][randInt(0, 4)]}${randInt(1, 30)}楼${randInt(1, 20)}室`,
      POSITION: posList[i % posList.length],
      HIRE_DATE: `${hireYear}-${String(hireMonth).padStart(2, '0')}-${String(hireDay).padStart(2, '0')}`,
      STATUS: 'active',
      PERFORMANCE_LEVEL: perf,
      profile,
    });
  }

  // 生成考勤（92 天，工作日出勤）
  const attendance = [];
  const start = new Date('2026-06-01');
  const end = new Date('2026-08-31');
  const statusPool: Record<string, Array<[string, number]>> = {
    star: [['present', 0.97], ['leave', 0.015], ['late', 0.01], ['absent', 0.005]],
    stable: [['present', 0.93], ['leave', 0.04], ['late', 0.02], ['absent', 0.01]],
    risk: [['present', 0.82], ['leave', 0.09], ['late', 0.03], ['absent', 0.06]],
  };
  for (const emp of employees) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // 跳过周末
      const pool = statusPool[emp.profile];
      const r = rand();
      let status = 'present';
      let acc = 0;
      for (const [s, p] of pool) {
        acc += p;
        if (r < acc) {
          status = s;
          break;
        }
      }
      attendance.push({
        EMPLOYEE_ID: emp.ID,
        ATTEND_DATE: d.toISOString().slice(0, 10),
        STATUS: status,
      });
    }
  }

  // 生成工资（3 个月，BASE_SALARY 与 crm_employee_t.SALARY 对齐）
  const salaries = [];
  const months = ['2026-06', '2026-07', '2026-08'];
  for (const emp of employees) {
    const base = emp.SALARY; // 口径一致：月薪 = 主表工资
    for (const m of months) {
      const bonus =
        emp.profile === 'star' ? base * 0.3
        : emp.profile === 'risk' ? 0
        : base * 0.1;
      const bonusRound = Math.round(bonus * 100) / 100;
      const deduction = Math.round((base + bonusRound) * randFloat(0.08, 0.15) * 100) / 100;
      salaries.push({
        EMPLOYEE_ID: emp.ID,
        SALARY_MONTH: m,
        BASE_SALARY: base,
        BONUS: bonusRound,
        DEDUCTION: deduction,
        NET_SALARY: Math.round((base + bonusRound - deduction) * 100) / 100,
      });
    }
  }

  // 生成考评（每人 2 条：年初 + 年中）
  const reviews = [];
  const scoreMap: Record<string, [number, number]> = { A: [92, 98], 'B+': [85, 91], B: [75, 84], C: [60, 74] };
  for (const emp of employees) {
    const levels =
      emp.profile === 'star' ? ['B+', 'A']
      : emp.profile === 'risk' ? ['B', 'C']
      : emp.ID % 2 === 0 ? ['B', 'B'] // 稳定型一半原地、一半微升
      : ['B', 'B+'];
    const dates = ['2026-01-15', '2026-07-15'];
    for (let i = 0; i < dates.length; i++) {
      const lvl = levels[i];
      const [lo, hi] = scoreMap[lvl];
      reviews.push({
        EMPLOYEE_ID: emp.ID,
        REVIEW_DATE: dates[i],
        SCORE_LEVEL: lvl,
        SCORE: randInt(lo, hi),
        COMMENT: lvl === 'A' ? '表现突出，潜力大' : lvl === 'C' ? '需要重点关注，绩效不达标' : '表现稳定',
      });
    }
  }

  return { employees, attendance, salaries, reviews };
}

/* ---------- 分批插入 ---------- */
async function insertInBatches(
  conn: mysql.Connection,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;
  const colSql = columns.join(', ');
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const values = chunk.flatMap((r) => columns.map((c) => r[c] as string | number | null));
    await conn.execute(`INSERT INTO ${table} (${colSql}) VALUES ${placeholders}`, values);
  }
}

async function main() {
  await mkdir(HISTORY_DIR, { recursive: true });
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false,
  });
  try {
    // 重建统一员工主数据表（彻底幂等），删除旧 hr_employee_t，避免两套人员并存
    await conn.query(`DROP TABLE IF EXISTS crm_employee_t`);
    await conn.query(`DROP TABLE IF EXISTS hr_employee_t`);
    for (const ddl of DDL) await conn.query(ddl);
    // 清空业务流水表（幂等重置）
    for (const t of ['hr_review_t', 'hr_salary_t', 'hr_attendance_t', 'airline_booking_t', 'airline_flight_t']) {
      await conn.query(`DELETE FROM ${t}`);
    }

    const { flights, bookings } = buildAirlines();
    const people = buildPeople();

    await insertInBatches(conn, 'airline_flight_t', ['FLIGHT_ID', 'ROUTE', 'AIRPLANE_MODEL', 'TOTAL_SEATS', 'OPERATING_COST', 'FLIGHT_DATE', 'STATUS'], flights);
    await insertInBatches(conn, 'airline_booking_t', ['ORDER_ID', 'FLIGHT_ID', 'PASSENGER_NAME', 'TICKET_PRICE', 'BOOKED_AT'], bookings);
    await insertInBatches(conn, 'crm_employee_t', ['ID', 'NAME', 'GENDER', 'SALARY', 'DEPARTMENT_NAME', 'EMAIL', 'ADDRESS', 'POSITION', 'HIRE_DATE', 'STATUS', 'PERFORMANCE_LEVEL'], people.employees);
    await insertInBatches(conn, 'hr_attendance_t', ['EMPLOYEE_ID', 'ATTEND_DATE', 'STATUS'], people.attendance);
    await insertInBatches(conn, 'hr_salary_t', ['EMPLOYEE_ID', 'SALARY_MONTH', 'BASE_SALARY', 'BONUS', 'DEDUCTION', 'NET_SALARY'], people.salaries);
    await insertInBatches(conn, 'hr_review_t', ['EMPLOYEE_ID', 'REVIEW_DATE', 'SCORE_LEVEL', 'SCORE', 'COMMENT'], people.reviews);

    logger.info('Business seed done', {
      employees: people.employees.length,
      flights: flights.length,
      bookings: bookings.length,
      attendance: people.attendance.length,
      salaries: people.salaries.length,
      reviews: people.reviews.length,
    });
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  logger.error('Business seed failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
