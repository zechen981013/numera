#!/usr/bin/env node
/**
 * CRM AI Agent 演示数据生成器（无第三方依赖，可复现）。
 * 生成 100 名员工：中文姓名 + 部门 + 工资 + 邮箱 + 香港家庭住址。
 * 用法：node database/generate_seed.js   （自动重写 database/init.sql）
 *
 * 前 5 名保留原始演示员工（张三/李四/王五/赵六/田七），其余为新生成员工。
 */
const fs = require('node:fs');
const path = require('node:path');

/* ---------- 可复现的伪随机数 ---------- */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260828);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

/* ---------- 姓名（中文 + 拼音，用于生成邮箱） ---------- */
const SURNAMES = [
  ['张', 'zhang'], ['李', 'li'], ['王', 'wang'], ['刘', 'liu'], ['陈', 'chen'],
  ['杨', 'yang'], ['黄', 'huang'], ['赵', 'zhao'], ['吴', 'wu'], ['周', 'zhou'],
  ['徐', 'xu'], ['孙', 'sun'], ['马', 'ma'], ['朱', 'zhu'], ['胡', 'hu'],
  ['郭', 'guo'], ['何', 'he'], ['高', 'gao'], ['林', 'lin'], ['罗', 'luo'],
  ['郑', 'zheng'], ['梁', 'liang'], ['谢', 'xie'], ['宋', 'song'], ['唐', 'tang'],
  ['许', 'xu'], ['韩', 'han'], ['冯', 'feng'], ['邓', 'deng'], ['曹', 'cao'],
  ['彭', 'peng'], ['曾', 'zeng'], ['萧', 'xiao'], ['田', 'tian'], ['董', 'dong'],
  ['袁', 'yuan'], ['潘', 'pan'], ['蒋', 'jiang'], ['蔡', 'cai'], ['余', 'yu'],
  ['杜', 'du'], ['叶', 'ye'], ['程', 'cheng'], ['苏', 'su'], ['魏', 'wei'],
];
const GIVEN = [
  ['伟', 'wei'], ['芳', 'fang'], ['娜', 'na'], ['敏', 'min'], ['静', 'jing'],
  ['丽', 'li'], ['强', 'qiang'], ['磊', 'lei'], ['军', 'jun'], ['洋', 'yang'],
  ['勇', 'yong'], ['艳', 'yan'], ['杰', 'jie'], ['娟', 'juan'], ['涛', 'tao'],
  ['明', 'ming'], ['超', 'chao'], ['霞', 'xia'], ['平', 'ping'], ['刚', 'gang'],
  ['鑫', 'xin'], ['文', 'wen'], ['辉', 'hui'], ['婷', 'ting'], ['琳', 'lin'],
  ['雅', 'ya'], ['雪', 'xue'], ['皓', 'hao'], ['博', 'bo'], ['俊', 'jun'],
  ['子轩', 'zixuan'], ['浩然', 'haoran'], ['思远', 'siyuan'], ['雨桐', 'yutong'],
  ['佳琪', 'jiaqi'], ['晨曦', 'chenxi'], ['梓萱', 'zixuan'], ['若曦', 'ruoxi'],
  ['语嫣', 'yuyan'], ['一诺', 'yinuo'], ['欣怡', 'xinyi'], ['志远', 'zhiyuan'],
  ['天佑', 'tianyou'], ['梦琪', 'mengqi'], ['紫涵', 'zihan'], ['诗涵', 'shihan'],
];

/* ---------- 部门（10 个）+ 各部门工资区间 ---------- */
const DEPARTMENTS = [
  { name: '技术部', min: 20000, max: 50000 },
  { name: '研发部', min: 25000, max: 55000 },
  { name: '财务部', min: 8000, max: 20000 },
  { name: '人事部', min: 10000, max: 22000 },
  { name: '市场部', min: 12000, max: 26000 },
  { name: '销售部', min: 9000, max: 30000 },
  { name: '运营部', min: 10000, max: 24000 },
  { name: '行政部', min: 9000, max: 18000 },
  { name: '客服部', min: 8000, max: 15000 },
  { name: '采购部', min: 10000, max: 22000 },
];

/* ---------- 香港地址素材 ---------- */
const DISTRICTS = [
  '中西区', '湾仔区', '东区', '南区', '油尖旺区', '深水埗区',
  '九龙城区', '黄大仙区', '观塘区', '荃湾区', '屯门区', '元朗区',
  '北区', '大埔区', '沙田区', '西贡区', '葵青区',
];
const STREETS = [
  '弥敦道', '广东道', '轩尼诗道', '皇后大道中', '德辅道中', '铜锣湾道',
  '长沙湾道', '窝打老道', '漆咸道南', '亚皆老街', '英皇道', '波斯富街',
  '骆克道', '花园街', '上海街', '佐敦道', '吴松街', '新填地街',
  '汉口道', '海防道', '梳士巴利道', '青山道', '大埔道', '界限街',
];
const BUILDINGS = [
  '海港城', '朗豪坊', '时代广场', '太古广场', '国际金融中心', '中环中心',
  '环球贸易广场', '新城市广场', '旺角中心', 'K11', '又一城', 'apm',
  '德福广场', '黄埔花园', '乐富广场', '荃湾广场', '如心广场', '元朗广场',
  '新元朗中心', '上水广场', '大埔超级城', '沙田中心', '太古城中心', '太古坊',
];
function genAddress() {
  const district = pick(DISTRICTS);
  const street = pick(STREETS);
  const num = randInt(1, 999);
  const building = pick(BUILDINGS);
  const floor = randInt(3, 45);
  const room = randInt(1, 30);
  const unit = `${floor}${String(room).padStart(2, '0')}`;
  return `${district}${street}${num}号${building}${floor}楼${unit}室`;
}

/* ---------- 生成 100 名唯一员工 ---------- */
const TOTAL = 100;
const employees = [];
const usedNames = new Set();

// 前 5 名保留原始演示员工
const legacy = [
  { id: 1, name: '张三', salary: 15000, department: '技术部' },
  { id: 2, name: '李四', salary: 35000, department: '技术部' },
  { id: 3, name: '王五', salary: 8000, department: '财务部' },
  { id: 4, name: '赵六', salary: 7000, department: '财务部' },
  { id: 5, name: '田七', salary: 6000, department: '财务部' },
];
legacy.forEach((e) => usedNames.add(e.name));

// 每个部门的目标人数（技术部 10，其余 10），先算好各部门还差多少人
const targetCount = Object.fromEntries(DEPARTMENTS.map((d) => [d.name, 10]));

for (const e of legacy) {
  employees.push({ ...e, email: null, address: genAddress() });
  targetCount[e.department] -= 1;
}

// 生成第 6 ~ 100 名员工
for (let id = 6; id <= TOTAL; id++) {
  // 挑选尚未满员的部门
  const eligible = DEPARTMENTS.filter((d) => targetCount[d.name] > 0);
  const dept = pick(eligible);

  // 生成唯一姓名
  let name = '';
  let py = '';
  for (let attempt = 0; attempt < 200; attempt++) {
    const s = pick(SURNAMES);
    const g = pick(GIVEN);
    const candidate = s[0] + g[0];
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      name = candidate;
      py = s[1] + g[1];
      break;
    }
  }
  const salary = randInt(dept.min, dept.max);
  const email = `${py}${id}@crmhk.com`;
  employees.push({ id, name, salary, department: dept.name, email, address: genAddress() });

  targetCount[dept.name] -= 1;
}

// 补上 legacy 员工的邮箱（用拼音规则不方便，统一 employee{n}@crmhk.com）
employees.slice(0, 5).forEach((e, i) => {
  e.email = `employee${i + 1}@crmhk.com`;
});

/* ---------- 生成 init.sql ---------- */
const rowsSql = employees
  .map(
    (e) =>
      `  (${e.id}, '${e.name}', ${e.salary}, '${e.department}', '${e.email}', '${e.address}'),`,
  )
  .join('\n')
  .replace(/,$/, '');

const sql = `-- =============================================================
-- CRM 自然语言数据库查询智能体 - 演示数据库初始化脚本（自动生成，勿手改）
-- 生成器：node database/generate_seed.js
-- 数据规模：100 名员工 / 10 个部门，含邮箱与香港家庭住址
-- 用法：mysql -u root < database/init.sql
--       或   npm run db:init
-- =============================================================

CREATE DATABASE IF NOT EXISTS crm
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE crm;

-- 重置演示数据（先删表再重建，保证新字段 EMAIL / ADDRESS 生效）
DROP TABLE IF EXISTS crm_employee_t;

CREATE TABLE crm_employee_t (
  ID INT PRIMARY KEY,
  NAME VARCHAR(50) NOT NULL,
  SALARY DECIMAL(10, 2) NOT NULL,
  DEPARTMENT_NAME VARCHAR(100) NOT NULL,
  EMAIL VARCHAR(100),
  ADDRESS VARCHAR(200)
);

INSERT INTO crm_employee_t (ID, NAME, SALARY, DEPARTMENT_NAME, EMAIL, ADDRESS) VALUES
${rowsSql};

SELECT COUNT(*) AS total FROM crm_employee_t;
`;

const outPath = path.resolve(__dirname, 'init.sql');
fs.writeFileSync(outPath, sql, 'utf-8');
console.log(`已生成 ${employees.length} 名员工 → ${outPath}`);
