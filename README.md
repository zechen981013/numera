# 大湾区航空 · 企业智能分析平台（NL → SQL → 决策建议）

> 品牌：**大湾区航空（Greater Bay Airline）**。从「1 张表」升级到「多张表」、从「查询」升级到「分析 → 建议」：航空运营分析（练手）+ 人才流失预测与干预系统（核心交付）。
>
> 前端采用 **Apple 风格 UI + 航空业配色**（深海蓝导航 / 航空蓝主色），参考苹果网页的留白、圆角与渐变设计。

用户不需要编写 SQL，只需用中文自然语言提问，AI Agent 会自动完成：

```
中文问题 → 生成 SQL / 调用业务工具 → 安全检查 → 真实执行 MySQL → 指标计算 → 自然语言回答 + 决策建议
```

例如输入「客座率太低了，该打几折来提升上座？」，系统会综合近 3 个月真实运营数据（促销月 vs 平时票价弹性）输出结构化**打折建议**；输入「赵洋的绩效和出勤怎么样？该怎么处理？」会输出**人才画像 + 升/育/留/裁干预建议**，并以「建议卡片」展示在前端。

---

## 1. 架构

```
User（浏览器 Chat / Dashboard 界面）
   ↓ 输入中文问题
Frontend（React + Vite + Tailwind + recharts）
   ↓ POST /api/chat
Backend API（Express + TypeScript）
   ↓ 获取数据库 Schema（6 张业务表 + 外键关系）
AI 数据库 Agent（Function Calling 多步分析）
   ├── execute_sql 工具：只读 SELECT（支持多表 JOIN，自动规避 JOIN 聚合陷阱）
   ├── employee_profile / suggest_action 工具：人才画像 + 升/育/留/裁建议（调后端规则引擎）
   ├── airline_suggestion 工具：打折建议（调后端规则引擎）
   └── 反复执行，基于真实结果生成自然语言回答 + 结构化 suggestion
   ↓ 每个 SQL 都经过 SQL 安全校验（SQL Parser + 黑名单 + 表名白名单）
MySQL（6 张业务表：航空 2 表 + 人力 4 表）
   ↓ 真实查询结果
Frontend（答案 + 查看 SQL + 结果表 + 建议卡片 + 记录历史）
   ↓
Dashboard 看板（客座率趋势 / 绩效分布 / 风险 Top5 / 干预动作分布 / 打折建议）
```

**关键点：答案永远来自 MySQL 的真实查询结果，AI 不做凭空猜测。** 业务建议（打折幅度、升/育/留/裁）由**后端规则引擎**基于真实数据计算（可解释、稳定、不消耗额外 token），LLM 负责组织语言与上下文。

> Mock 模式（无 API Key）下同样可回答核心业务问题：内置规则直接命中业务规则引擎（画像/建议）或生成分析型 SQL，并仍在 MySQL 上真实执行。

---

## 2. 技术栈

| 层 | 技术 |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Backend | Node.js + TypeScript + Express 5 |
| 数据库 | MySQL（mysql2 + 连接池） |
| AI | OpenAI SDK（Chat Completions + `response_format: json_object` 结构化输出） |
| SQL 校验 | node-sql-parser（AST 解析，不依赖字符串 contains） |
| 输入校验 | zod |

---

## 3. 目录结构

```
.
├── frontend/                  # React 前端
│   └── src/
│       ├── components/        # Sidebar / ChatMessage（含建议卡片）/ ResultTable
│       ├── pages/             # Chat / Dashboard(看板) / Database / History / Settings
│       ├── services/api.ts    # 后端 API 封装
│       └── types/index.ts     # 与后端一致的类型定义
├── backend/                   # Express 后端
│   └── src/
│       ├── agents/            # databaseAgent（工具循环）/ sqlAgent / answerAgent
│       ├── database/          # 连接池 + Schema 获取
│       ├── routes/            # chat / dashboard / schema / history / database / config / health
│       ├── scripts/           # seedBusiness（业务演示数据生成，npm run db:seed）
│       ├── services/          # llm / sqlValidator / businessRules（规则引擎）/ historyService
│       └── server.ts          # 入口
├── database/init.sql          # 数据库初始化脚本（CRM 表）
├── docs/需求文档.md            # 需求文档（多表决策平台 v1.0）
├── .env.example               # 环境变量模板
└── package.json               # 根脚本（一键启动）
```

---

## 4. 安装

需要 Node.js ≥ 20 和本机 MySQL。

```bash
# 1. 在项目根目录安装全部依赖（含 backend / frontend）
npm install

# 2. 复制环境变量模板并填写
cp .env.example .env
```

`.env.example` 内容：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=crm

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT_MS=30000

AI_MOCK_MODE=true
PORT=4000

# RBAC 初始账号（首次启动写入 backend/.data/users.json）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
USER_USERNAME=user
USER_PASSWORD=user123
```

> ⚠️ `.env` 已加入 `.gitignore`，不会提交到 Git。数据库密码 / API Key 只从环境变量读取，绝不硬编码。

---

## 5. 数据库初始化

```bash
# 1. 自动根据 .env 创建 crm 库、crm_employee_t 表并导入演示数据
npm run db:init

# 2. 生成并填充 6 张业务表（航空 2 表 + 人力 4 表，近 3 个月演示数据）
npm run db:seed
```

或者手动执行：

```bash
mysql -u root -p < database/init.sql
```

### 数据模型（新增多表，同一 MySQL 实例）

**航空运营（2 表）**

```sql
CREATE TABLE airline_flight_t (
  FLIGHT_ID INT PRIMARY KEY, ROUTE VARCHAR(50), AIRPLANE_MODEL VARCHAR(50),
  TOTAL_SEATS INT, OPERATING_COST DECIMAL(12,2), FLIGHT_DATE DATE, STATUS VARCHAR(20)
);
CREATE TABLE airline_booking_t (
  ORDER_ID INT PRIMARY KEY, FLIGHT_ID INT, PASSENGER_NAME VARCHAR(50),
  TICKET_PRICE DECIMAL(10,2), BOOKED_AT DATETIME, INDEX idx_flight (FLIGHT_ID)
);
-- 关系：airline_flight_t.FLIGHT_ID = airline_booking_t.FLIGHT_ID（1 航班 : N 订单）
```

**人力分析（统一员工主表 + 3 张流水表）**

```sql
CREATE TABLE crm_employee_t (       -- 员工主数据：工资/邮箱/住址 + HR 属性（问数系统与 HR 系统共用同一批人）
  ID INT PRIMARY KEY, NAME VARCHAR(50) NOT NULL, GENDER VARCHAR(10),
  SALARY DECIMAL(10,2) NOT NULL, DEPARTMENT_NAME VARCHAR(100),
  EMAIL VARCHAR(100), ADDRESS VARCHAR(200), POSITION VARCHAR(50),
  HIRE_DATE DATE, STATUS VARCHAR(20), PERFORMANCE_LEVEL VARCHAR(10)   -- A / B+ / B / C
);
CREATE TABLE hr_attendance_t ( RECORD_ID INT PRIMARY KEY AUTO_INCREMENT, EMPLOYEE_ID INT,
  ATTEND_DATE DATE, STATUS VARCHAR(20), INDEX idx_emp_date (EMPLOYEE_ID, ATTEND_DATE) );
CREATE TABLE hr_salary_t ( RECORD_ID INT PRIMARY KEY AUTO_INCREMENT, EMPLOYEE_ID INT,
  SALARY_MONTH CHAR(7), BASE_SALARY DECIMAL(10,2), BONUS DECIMAL(10,2),
  DEDUCTION DECIMAL(10,2), NET_SALARY DECIMAL(10,2) );
CREATE TABLE hr_review_t ( RECORD_ID INT PRIMARY KEY AUTO_INCREMENT, EMPLOYEE_ID INT,
  REVIEW_DATE DATE, SCORE_LEVEL VARCHAR(5), SCORE DECIMAL(4,1), COMMENT VARCHAR(200) );
-- 关系：crm_employee_t.ID 关联 考勤/工资/考评（1 员工 : N 记录）
-- 口径：hr_salary_t.BASE_SALARY = crm_employee_t.SALARY（两套系统工资一致）
```

> 员工主数据**统一为 `crm_employee_t`**（100 人 / 10 个部门），每人都有考勤、工资流水与 2 期考评，保证「问数系统」「Admin 数据管理」「HR 画像/看板」人员完全一致。

演示数据规模（`npm run db:seed`，幂等重建、可复现）：

| 表 | 规模 |
| --- | --- |
| airline_flight_t | 368 航班（4 条航线 × 92 天，2026-06-01 ~ 08-31） |
| airline_booking_t | 24,290 张订单（8 月为促销月：上座 50%~80%、票价 5.5~8 折） |
| crm_employee_t | 100 名员工 / 10 个部门（技术/研发/财务/人事/市场/销售/运营/行政/客服/采购） |
| hr_attendance_t / hr_salary_t / hr_review_t | 6,600 条考勤 / 300 条月薪 / 200 条考评 |

> 建议为数据库创建一个只读账号（仅 `SELECT` 权限），进一步保障安全：
>
> ```sql
> CREATE USER 'crm_reader'@'localhost' IDENTIFIED BY 'your_password';
> GRANT SELECT ON crm.* TO 'crm_reader'@'localhost';
> ```

---

## 6. 启动

```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:4000（`GET /api/health` 可查看状态）

单独启动：

```bash
npm run dev:backend     # 仅后端
npm run dev:frontend    # 仅前端
```

---

## 7. 使用示例

启动后打开浏览器，首先会进入**登录页**（RBAC）：

| 角色 | 默认账号 | 权限 |
| --- | --- | --- |
| 管理员 admin | `admin` / `admin123` | 查询 + Admin（数据管理）：增删改员工 |
| 普通用户 user | `user` / `user123` | 仅查询 |

> 初始账号写入 `backend/.data/users.json`（首次启动自动生成），可在 `.env` 中通过 `ADMIN_USERNAME/ADMIN_PASSWORD/USER_USERNAME/USER_PASSWORD` 修改，之后以后台文件为准。

登录后输入：

```
技术部的平均工资是多少？
```

AI 回答：

```
技术部的平均工资是 35,453 元。
```

点击「查看 SQL」可以看到实际生成并执行的 SQL：

```sql
SELECT AVG(SALARY) AS average_salary
FROM crm_employee_t
WHERE DEPARTMENT_NAME = '技术部';
```

以及查询结果表：

| average_salary |
| -------------- |
| 35453          |

### 支持的测试问题

**业务决策问题（多表 + 建议卡片，真实/ Mock 模式均支持）**

| 问题 | 预期回答 |
| --- | --- |
| 客座率太低了，该打几折来提升上座？ | 建议票价下调约 30%（约 7.0 折），预计客座率从 43.3% 提升至约 73%（附依据/风险卡片） |
| 整体客座率是多少？哪条航线客座率最低？ | 整体客座率 43.28%，HKG-TPE（香港-台北）最低 42.45% |
| 技术部最近 3 个月在岗率是多少？ | 技术部在岗率 90.91%（360/396） |
| 唐佳琪的绩效和出勤怎么样？该怎么处理？ | 唐佳琪：绩效 B→C、在岗率 78.8%、旷工 4 次、风险分 90 → 「裁（进入淘汰名单）」 |
| 整体在岗率是多少？ | 公司整体在岗率 92.5%、请假率 4%（Mock/真实均支持） |
| 给我看下整体情况和看板 | 人力+航空总览（总数/在岗率/客座率/毛利率/风险Top） |

**原有 CRM 查询问题（100 人数据集）**

| 问题 | 预期回答 |
| --- | --- |
| 技术部的平均工资是多少？ | 技术部的平均工资是 35,453 元。 |
| 财务部的平均工资是多少？ | 财务部的平均工资是 11,918 元。 |
| 整个公司的平均工资是多少？ | 整个公司的平均工资是 19,382 元。 |
| 技术部工资最高的人是谁？ | 余辉，工资 48,782 元。 |
| 财务部工资最高的人是谁？ | 马平，工资 19,783 元。 |
| 公司一共有多少员工？ | 公司一共有 100 名员工。 |
| 谁的工资最高？ | 林艳，工资 50,113 元。 |
| 技术部有多少人？ | 技术部共有 10 人。 |
| 张三的邮箱是什么？ | 张三的邮箱是 employee1@crmhk.com。 |
| 李四住在哪里？ | 李四的家庭住址是 沙田区波斯富街964号apm22楼2207室。 |
| 住址在哪个区的人比较多？ | 住址在「荃湾区」的员工最多，共 15 人。（多步分析：取样 → SUBSTRING_INDEX 提取区名 → GROUP BY 统计） |
| 哪个部门的平均工资最高？ | 研发部的平均工资最高，为 36,430 元。（附各部门完整排名） |
| 工资最高的人住在哪个区？ | 工资最高的是林艳（50,113 元），住在荃湾区。 |
| 公司的平均年龄是多少？ | 抱歉，…表中没有员工年龄（AGE）字段，因此无法回答。 |
| 法务部有多少人？（库中无该部门） | 抱歉，数据库中没有「法务部」部门或该部门暂无员工。 |

---

## 8. 业务规则引擎（决策建议）

建议类输出**不靠 LLM 拍脑袋**，由 `backend/src/services/businessRules.ts` 基于数据库真实数据计算：

| 功能 | 规则 |
| --- | --- |
| 客座率 / 毛利率 | 客座率 = 订票数 ÷ 总座位数 × 100%（子查询预聚合，避免 JOIN 放大）；毛利率 = (收入 − 成本) ÷ 收入 × 100% |
| 打折建议 | 对比促销月(8月) vs 平时(6-7月)：每降 10% 价的客座率弹性 → 建议折扣取整到 5%，输出依据/预期效果/风险 |
| 人才画像 | 在岗率/请假率/迟到/旷工 + 工资与部门均值对比 + 考评趋势 → 标签（力争上游/稳步成长/有待观察/流失风险/边缘化） |
| 流失风险分 | 加分制：绩效连续下滑 +20、请假率>10% +15、旷工≥2 次 +25、低薪 +20、长期未晋升 +10、绩效优但低薪 +15 |
| 升/育/留/裁 | 力争上游→升（升职加薪 20%）；流失风险→育（加薪+放权）；稳定→留；边缘化→裁（进黑名单） |
| Dashboard | 拆分两个：业务看板（航班数/客座率/收入/毛利率/低客座率航线/月度趋势，客座率 vs 平均票价采用**双 Y 轴**对比）+ HR 看板（员工总数/在岗率/请假率/绩效分布/风险 Top5/动作分布/部门对比） |

LLM 在数据库 Agent 中通过工具（`employee_profile` / `suggest_action` / `airline_suggestion`）调用规则引擎，并把结构化建议带回前端以「建议卡片」展示。

---

## 9. AI 模式说明

### Mock 模式（`AI_MOCK_MODE=true`，默认）

**没有配置 API Key 时，系统是如何回答的？**

系统并没有写死答案，也没有跳过数据库。完整流程是：

1. **业务规则优先**：识别到业务意图（员工画像/建议、打折建议、看板总览）时，直接命中 `businessRules` 规则引擎（基于真实数据计算），输出答案 + 建议卡片。
2. **SQL Agent（规则版）** 用简单的规则把中文问题解析成 SQL 候选，例如识别「平均工资 → `AVG(SALARY)`」「工资最高的人 → `ORDER BY SALARY DESC LIMIT 1`」「多少人 → `COUNT(*)`」以及部门过滤（部门名以数据库真实存在的部门为准，不存在的部门会如实告知）。多表库下按问题关键词挑选最相关的主表。
3. 生成的 SQL **照常经过 SQL 安全校验**（Parser + 黑名单 + 表名白名单）。
4. SQL **真正在 MySQL 上执行**。
5. **Answer Agent（规则版）** 只根据真实查询结果的列做格式化（如 `average_salary` → 「xx的平均工资是 25,000 元。」、`NAME+SALARY` → 「李四，工资 35,000 元。」）。

也就是说：**Mock 模式只模拟"问题→SQL"这一步，答案 100% 来自数据库真实执行结果，不会编造数据。** 提问"技术部的平均工资"时它生成的是 `SELECT AVG(SALARY)...` 并真实执行，而不是返回写死的 25000。

### 真实 LLM 模式（`AI_MOCK_MODE=false`）

配置好 API Key 后，两个 Agent 都由真实 LLM 完成：

- 可以在 **Settings 页面 → 连接 OpenAI API** 中填写：
  - **API Key**：实时生效，无需改 .env、无需重启（Key 只保存在后端内存，不回传显示，可随时移除）
  - **Base URL**：可选，用于 OpenAI 兼容中转（DeepSeek / Qwen 等）
  - **模型**：预设 `gpt-4o-mini / gpt-4o / gpt-4.1-mini / deepseek-chat / qwen-plus`，也可自定义
- 保存后在 Settings 中点击「切换到真实 LLM 模式」即可。
- SQL Agent 使用 **Structured Output**（`response_format: { type: 'json_object' }`），强制返回：

```json
{ "sql": "SELECT ...", "explanation": "..." }
```

- Answer Agent 基于用户问题 + SQL + 真实查询结果生成自然语言回答。
- 业务决策问题由**数据库 Agent 工具循环**完成：除 `execute_sql` 外新增 `employee_profile` / `suggest_action` / `airline_suggestion` 三个规则工具，LLM 识别意图后调用（可先执行 SQL 确认员工真实姓名），把结构化建议随回答一起返回，前端渲染为「建议卡片」。

### 多轮对话记忆

- 前端为每个会话维护一个 `sessionId`（localStorage 持久化），Chat 页顶部有「新对话」按钮可开启全新会话。
- 后端 `sessionStore`（内存版，容量上限自动淘汰）按 sessionId 保存最近若干轮问答，真实 LLM 模式下会注入上下文，支持「那她呢？」「那个部门呢？」等指代追问。
- Mock 模式不依赖 LLM，指代类追问无法解析，请直接说清对象。
- 说明：本项目用**内存会话存储**（零依赖、重启即清空）。若需跨进程/持久化，可替换为 Redis（SessionStore 接口已是独立的 `backend/src/services/sessionStore.ts`）。

> 系统没有使用任何 `if (question.includes("技术部")) return "25000"` 之类的硬编码答案。

---

## 10. RBAC 与管理员数据管理

项目内置简单角色访问控制（Role-Based Access Control）：

- **登录鉴权**：`POST /api/auth/login` 发放 token，后续请求带 `Authorization: Bearer <token>`。
- **角色**：
  - `admin`（管理员 / 老板 / 管理层）：除查询外可使用「业务看板（航空）」「HR 看板（人才）」查看经营与人力决策看板，并可在「Admin（数据管理）」页面**增删改** `crm_employee_t` 数据（添加员工、修改工资/姓名/部门、删除员工），写入全部使用**预编译参数化 SQL**，防注入。
  - `user`（普通用户 / 分析师）：只能使用 Chat 进行只读查询，看不到看板与 Admin 入口，调用看板/管理接口返回 403。
- 管理员修改数据后，Chat 的自然语言查询立即读到最新数据。
- 账号存储：`backend/.data/users.json`（密码为 SHA-256 哈希，不存明文）；token 保存在后端内存，重启后需重新登录。

### Excel 导出 / 导入

- **导出 Excel（所有人可用）**：
  - Chat 中每条有查询结果的 AI 回复旁都有「导出 Excel」按钮，点开会弹出**导出设置弹窗**：可按**部门多选**过滤、按**姓名搜索**、**勾选要导出的列**，实时显示过滤后行数，再导出为 `.xlsx`。
  - 智能建议：当结果较多且是列表/统计类结果时（≥5 行、非单值聚合、问题含「哪些/分布/排名/列表…」），AI 回复下方会出现「检测到 N 行查询结果，需要导出吗？」卡片，可一键导出或选择「不需要」（本消息隐藏）／「以后都别问」（浏览器永久记住，Settings 里可随时重新打开）。
  - Admin（数据管理）页面的「导出 Excel」可导出全部员工数据（含邮箱、住址）。
- **导入 Excel**（仅管理员）：
  - Admin 页面点击「导入模板」可下载带示例行的模板文件（列头：姓名 / 工资 / 部门 / 邮箱 / 住址，可加可选 ID 列）。
  - 点击「导入 Excel」上传 `.xlsx / .xls / .csv`，前端解析后调用后端批量导入接口（参数化 SQL + 按 ID 覆盖更新，幂等可重复导入）；未填 ID 的行自动编号。
  - 支持中英文列头（姓名/NAME、工资/SALARY、部门/DEPARTMENT_NAME、邮箱/EMAIL、住址/ADDRESS/地址）。

---

## 11. 安全设计

1. **SQL allowlist / SELECT-only**：所有生成 SQL 先经过 `node-sql-parser` 解析 AST，根节点类型必须是 `select`，否则拒绝。
2. **关键字黑名单**：INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE / CREATE / GRANT 等一律拒绝（纵深防御）。
3. **禁止多语句**：SQL 中出现分号即拒绝，防止 `SELECT 1; DROP TABLE ...` 拼接。
4. **禁止系统表**：`mysql.*`、`information_schema.*`、`performance_schema.*` 等被明确拦截。
5. **表名白名单**：`FROM` 引用的表必须是 Schema 中真实存在的表。
6. **数据库只读账号**：建议使用仅 `SELECT` 权限的 MySQL 账号（见上文）。
7. **环境变量**：密码、API Key 全部来自 `.env`，不硬编码、不提交 Git。
8. **输入校验**：所有 API 入参使用 zod 校验（空问题、超长问题、非法端口等）。
9. **密码不落地**：前端 Database 页面的密码只在内存中使用，接口返回不含密码，不写任何文件。

---

## 12. API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录，返回 token |
| GET | `/api/auth/me` | 当前登录用户（需 token） |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/chat` | 聊天主流程：问题 → SQL/工具 → 校验 → 执行 → 回答 + suggestion（可带 sessionId 多轮记忆） |
| GET | `/api/dashboard/hr` | HR 看板（仅管理员）：总数/在岗率/请假率/绩效分布/风险Top/动作分布/部门对比 |
| GET | `/api/dashboard/airline` | 业务看板（仅管理员）：客座率/收入/毛利率/月度趋势/低客座率航线 + 打折建议 |
| GET | `/api/schema` | 数据库 Schema（表/字段/行数/预览） |
| GET | `/api/history` | 查询历史列表 |
| DELETE | `/api/history` | 清空查询历史 |
| POST | `/api/database/connect` | 运行时切换数据库连接（内存中，不落盘） |
| GET | `/api/config` | AI 运行配置（不含密钥） |
| POST | `/api/config` | 运行时更新 AI 模式 / API Key / Base URL / 模型 |
| GET | `/api/admin/employees` | 员工列表（管理员，含邮箱/住址） |
| POST | `/api/admin/employees` | 新增员工（管理员，参数化 SQL） |
| PUT | `/api/admin/employees/:id` | 修改员工（管理员） |
| DELETE | `/api/admin/employees/:id` | 删除员工（管理员） |
| POST | `/api/admin/employees/import` | Excel 批量导入员工（管理员，按 ID 覆盖更新，幂等） |
| GET | `/api/health` | 健康检查（服务 + 数据库连通性） |

---

## 13. 常见问题

- **提问时报「数据库连接失败」**：检查 `.env` 中 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 是否正确，MySQL 是否已启动（`mysqladmin ping`）。
- **看板/业务指标报错或为 0**：先执行 `npm run db:seed` 生成 6 张业务表演示数据。
- **忘记密码 / 想换账号**：直接编辑 `backend/.data/users.json`（密码为 SHA-256 哈希），或在 `.env` 改初始账号后删除该文件重新生成。
- **报「未配置 OPENAI_API_KEY」**：当前为真实 LLM 模式但没填 Key。可在 Settings 页面直接填写 API Key 并保存，或切回 Mock 模式。
- **历史记录不存在了**：历史保存在 `backend/.data/history.json`，删除该文件即清空历史（属于正常行为）。
- **重启后需要重新登录**：token 保存在后端内存，重启后端即失效，属正常安全行为。

## 14. 日志

后端会记录：请求、问题、生成 SQL、SQL 校验结果、数据库执行耗时、结果行数、LLM 耗时、Agent 轮数、总耗时、错误、管理员数据操作、看板计算耗时。
**绝不打印** `OPENAI_API_KEY` 与 `DB_PASSWORD`。
