# IdeaScan

IdeaScan 是一个面向中文创业者/独立开发者的 AI 需求验证系统。你输入一个需求想法，系统会自动完成关键词扩展、社媒抓取、竞品分析、报告生成。

## 技术栈（含后端爬虫）

- 前端：Vite + React + TypeScript + Tailwind + shadcn/ui
- 后端：Supabase (Postgres + Edge Functions + Auth + RLS)
- 爬虫服务：Python 3.11 + FastAPI + Playwright + Redis（独立 `crawler-service`）
- 测试：Vitest

## 目录结构

```text
src/                         前端应用
supabase/functions/          Edge Functions
supabase/migrations/         数据库迁移
crawler-service/             独立爬虫服务（API + Worker）
scripts/bootstrap.sh         数据库初始化/迁移脚本
scripts/crawler/             爬虫服务运维脚本
```

## 10 分钟快速上手（推荐）

### 1) 安装依赖

```bash
npm i
```

### 2) 配置前端环境变量

创建 `.env`：

```bash
VITE_SUPABASE_URL=你的 Supabase URL
VITE_SUPABASE_PUBLISHABLE_KEY=你的 Supabase Anon Key
```

### 3) 初始化数据库（脚本）

本地数据库（Docker Supabase）：

```bash
./scripts/bootstrap.sh local
```

远端数据库（已 `supabase link`）：

```bash
./scripts/bootstrap.sh remote
```

如需同时部署核心函数：

```bash
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote
```

### 4) 启动前端

```bash
npm run dev
```

## 爬虫服务启动（扫码登录与社媒抓取必需）

### 方式 A：本地开发运行（最快）

```bash
cd crawler-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8100
```

新开一个终端（异步队列模式需要）：

```bash
cd crawler-service
source .venv/bin/activate
python run_worker.py
```

### 方式 B：macOS launchd 常驻（适合长期运行）

```bash
./scripts/crawler/install-launchd.sh
./scripts/crawler/status.sh
```

## Supabase 必配 Secrets

在 Supabase Project Secrets 中至少配置：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRAWLER_SERVICE_BASE_URL`
- `CRAWLER_SERVICE_TOKEN`
- `CRAWLER_CALLBACK_SECRET`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `OPENAI_API_KEY`（或你使用的兼容 Key）

常用补充：

- `TIKHUB_TOKEN`（小红书/抖音兜底）
- `TAVILY_API_KEY` / `BOCHA_API_KEY` / `YOU_API_KEY`
- `SELF_CRAWLER_RATIO`
- `CRAWLER_CALLBACK_URL`（可选）

## 核心能力

- 流式验证进度（抓取、清洗、摘要、分析）
- 扫码登录小红书/抖音并保存用户会话
- 自爬 + 第三方（TikHub）混合路由
- 失败记录重试与验证历史沉淀
- 报告证据等级（A/B/C/D）与成本拆解

## 打包与部署

### 前端打包

```bash
npm run build
npm run preview
```

产物目录：`dist/`

### 后端部署建议（生产）

1. Supabase：执行迁移 + 部署函数。
2. 爬虫服务：以 Docker/PM2/systemd/launchd 形式常驻。
3. 在 Supabase Secrets 中将 `CRAWLER_SERVICE_BASE_URL` 配成公网地址（不要用本地回环地址）。

## 后端数据库与函数运维

### 数据库迁移

```bash
supabase db push
```

### 部署所有函数

```bash
supabase functions deploy $(find supabase/functions -mindepth 1 -maxdepth 1 -type d -not -name "_*" -exec basename {} \; | tr '\n' ' ')
```

### 部署核心函数（推荐）

```bash
supabase functions deploy \
  validate-idea validate-idea-stream list-validations get-validation delete-validation \
  user-settings verify-config get-sample-reports re-analyze-validation \
  export-user-data import-user-data \
  generate-mvp submit-mvp-lead track-experiment-event \
  scan-trending-topics discover-topics \
  generate-discussion reply-to-comment generate-persona-image \
  crawler-dispatch crawler-callback crawler-health \
  crawler-auth-start crawler-auth-status crawler-auth-cancel \
  crawler-auth-import-cookies crawler-auth-sessions crawler-auth-revoke
```

## FAQ（常见问题）

### 1) 扫码成功了，但没有保存 cookie

先检查：

- `crawler-service` 是否在跑
- `crawler-auth-status` 返回是否 `authorized`
- `crawler-auth-sessions` 是否能看到该用户活跃会话

本地可用脚本直连验证：

```bash
source crawler-service/.venv/bin/activate
python scripts/crawler/qr_session_probe.py --platform xiaohongshu --user-id <你的用户UUID> --open
```

### 2) 报错 `SELF_CRAWLER_EMPTY` / 样本不足

常见原因：

- 账号触发平台风控
- 关键词过窄或语义不适配
- 会话处于冷却期

建议：

- 开启 TikHub 兜底
- 增加关键词扩展数量
- 间隔重试，避免短时间高频请求

### 3) 小红书 `api_error_-104` 是什么

这是小红书搜索接口权限/风控限制。即使扫码登录成功，也可能出现该错误。项目已支持：

- 错误识别与清晰提示
- 真实浏览器模式（CDP）
- 第三方兜底

但当前现实是：`-104` 无法通过简单代码修改 100% 消除。

### 4) 卡在“智能摘要/分析中”怎么办

优先检查：

- LLM 配置是否可用（Base URL / API Key / Model）
- 函数日志是否有 `LLM_UNAVAILABLE`
- 对应函数是否已部署成功

### 5) 为什么前端能开，但抓取一直失败

通常是后端链路未打通：

- `CRAWLER_SERVICE_BASE_URL` 仍指向本地地址
- `CRAWLER_SERVICE_TOKEN` 与 crawler 侧不一致
- crawler 回调密钥不匹配

### 6) 如何判断系统是否真的在工作

- 前端 SSE 进度是否持续推进
- `crawler-health` 是否正常
- `crawler_jobs / crawler_samples` 表是否有新增
- `list-validations` 状态是否从 `pending/analyzing` 进入 `completed/failed`

## 当前已知限制（公开说明）

小红书搜索反爬机制较严格，若触发风控（典型为 `-104`），会导致“扫码成功但关键词抓取失败”。

当前生产建议：

- 保留用户扫码登录能力（优先自爬）
- 同时启用第三方兜底（如 TikHub）保证可用性

## License

内部项目，按团队规范使用。
