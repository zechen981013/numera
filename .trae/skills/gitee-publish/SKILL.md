---
name: "gitee-publish"
description: "一键把项目发布到 Gitee：自动在 Gitee 创建新仓库 → 初始化 git → 提交 → 推送。Invoke when user asks to 上传/发布/推送到 Gitee、创建远程仓库并提交代码、一键发布到码云。"
---

# Gitee 一键发布（建仓 + 提交 + 推送）

用户说「帮我提交到 Gitee / 上传到码云 / 发布这个项目」时使用本技能。流程：
**Gitee 创建远程仓库 → 本地初始化 git → 安全检查 → commit → push**。

## 0. 前置条件：Gitee 私人令牌（必须）

Gitee 已不支持登录密码推 HTTPS，必须使用**私人令牌**（access token）。

- 获取：https://gitee.com/profile/personal_access_tokens（设置 → 安全设置 → 私人令牌 → 新建，权限勾选 `projects`）
- 推荐保存为环境变量（避免明文出现在命令里）：`export GITEE_TOKEN='xxxxxxxx'`
- 用户没有令牌时，引导其去上述页面生成，生成后让用户提供或填入环境变量，**不要**把令牌写进仓库任何文件。

## 1. 收集信息

1. **Gitee 用户名**：问用户或从 `git config user.name` / 历史 remote 推断；若无法获得，明确询问。
2. **仓库名**：默认用当前项目目录名（去空格），让用户确认；允许用户指定。
3. **仓库描述**：简短一句话（如「大湾区航空 · 企业智能分析平台」）。
4. **可见性**：默认 `private=false`（公开），询问用户是否需要私有 `true`。
5. **令牌**：优先 `GITEE_TOKEN` 环境变量；否则询问用户。

## 2. 在 Gitee 创建仓库（通过 API）

```bash
curl -s -X POST 'https://gitee.com/api/v5/user/repos' \
  -H 'Content-Type: application/json;charset=UTF-8' \
  -d "{\"name\":\"${REPO_NAME}\",\"description\":\"${DESC}\",\"private\":false,\"auto_init\":true}"
```
- Gitee API v5 用 `access_token` 作为 query 参数或 JSON 字段认证，**不是** Bearer header。推荐拼到 URL：
  `curl -s -X POST 'https://gitee.com/api/v5/user/repos?access_token='"$GITEE_TOKEN" ...`
- `auto_init:true` 会自动生成 README 并初始化默认分支 `master`。
- 失败排查：
  - `401 Unauthorized / token` → 令牌无效或权限不足（需勾选 projects 权限）。
  - `{"message":"仓库已存在"}` → 仓库已存在，跳过创建，直接进入推送。

> 也可让用户去 https://gitee.com/projects/new 手动建仓（填仓库名、README、.gitignore），本技能自动识别并复用。

## 3. 本地初始化与安全检查

```bash
# 若项目还没有 git 仓库
git init -b master

# 确认 .gitignore 存在且已忽略敏感文件（缺失则创建）
# 必须忽略：.env / .env.local / node_modules/ / dist/ / build/ / .data/ / *.log / .DS_Store
git status        # 扫描一遍，确认 .env、密钥、大文件未被 git add
```

> 推送前必须检查 `.env`（含 API Key/数据库密码）是否被忽略；若没有 .gitignore，先补一份再加提交。

## 4. 提交

```bash
git add .                       # 或按需 git add <具体文件>
git commit -m "项目初始提交"
```
- commit message 用中文或项目语言，简洁说明"做了什么"（如 `大湾区航空企业智能分析平台：NL→SQL 多表决策平台`）。
- 未配置 user.name/email 时先设置：`git config user.name "..." && git config user.email "..."`（**不修改全局配置**，只在项目内设置）。

## 5. 关联远程并推送

```bash
git remote add origin "https://gitee.com/${GITEE_USER}/${REPO_NAME}.git"
git push -u origin master
```
- push 认证：macOS 会弹窗询问，用户名填 Gitee 用户名，**密码填私人令牌**（不是登录密码）。
- 若用环境变量令牌自动推送：
  `git push -u "https://${GITEE_USER}:${GITEE_TOKEN}@gitee.com/${GITEE_USER}/${REPO_NAME}.git" master`
  （token 只进 URL 用于本次命令，不会写入 remote 配置；push 成功后如需，可把 origin 设回不带 token 的地址）
- 首次 push 失败（`remote: Incorrect username or password`）→ 99% 是令牌问题：确认令牌有效 + 勾选了 `projects` 权限；或用 SSH 方案（见常见问题）。

## 6. 完成确认

推送成功后告知用户仓库地址：`https://gitee.com/${GITEE_USER}/${REPO_NAME}`，并总结推送了哪些内容（文件数、commit 数）。

## 常见问题

| 问题 | 原因 / 解决 |
| --- | --- |
| `Incorrect username or password (access token)` | 密码填了登录密码而非令牌；或令牌权限不足（重新生成并勾选 projects） |
| `401 Unauthorized` 创建仓库失败 | 令牌无效 / 过期，重新生成 |
| 仓库已存在 | 跳过建仓直接 push；或换仓库名 |
| 默认分支是 `main` | 改用 `git push -u origin main`；或 `git init -b main` |
| 想用 SSH 代替 https | `ssh-keygen -t ed25519` → 公钥粘贴到 https://gitee.com/profile/sshkeys → `git remote set-url origin git@gitee.com:<user>/<repo>.git` |
| 误把 `.env` 提交了 | `git rm --cached .env` 再提交，并立即去 Gitee 改令牌/改密码 |
