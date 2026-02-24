# IdeaScan

IdeaScan 是一个面向中文创业者和独立开发者的 AI 需求验证系统。输入一个想法后，系统会自动完成关键词扩展、社媒抓取、竞品分析，并生成可追踪的验证报告。

## 项目能力

- 端到端需求验证流水线（抓取、清洗、摘要、分析、报告）
- 扫码登录小红书/抖音并持久化用户会话
- 自爬与第三方数据源（TikHub）混合路由，支持降级兜底
- 实时进度流（SSE）与失败重试机制
- 报告证据等级（A/B/C/D）与成本拆解

## 技术栈

- 前端：Vite + React + TypeScript + Tailwind + shadcn/ui
- 后端：Supabase（Postgres + Edge Functions + Auth + RLS）
- 爬虫：Python 3.11 + FastAPI + Playwright + Redis（独立 `crawler-service`）
- 测试：Vitest

## 目录结构

```text
src/                         前端应用
supabase/functions/          Edge Functions
supabase/migrations/         数据库迁移
crawler-service/             爬虫服务（API + Worker）
scripts/bootstrap.sh         数据库初始化/迁移脚本
scripts/crawler/             爬虫服务运维脚本
```

## 快速开始（推荐 10 分钟）

### 1. 安装依赖

```bash
npm i
```

### 2. 配置前端环境变量

在仓库根目录创建 `.env`：

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

### 3. 初始化数据库

本地数据库（Docker Supabase）：

```bash
./scripts/bootstrap.sh local
```

远端数据库（已完成 `supabase link`）：

```bash
./scripts/bootstrap.sh remote
```

初始化时一并部署核心函数：

```bash
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote
```

### 4. 启动前端

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

异步队列模式需要另开一个终端启动 worker：

```bash
cd crawler-service
source .venv/bin/activate
python run_worker.py
```

### 方式 B：macOS launchd 常驻（长期运行）

```bash
./scripts/crawler/install-launchd.sh
./scripts/crawler/status.sh
```

## Supabase Secrets 配置

在 Supabase Project Secrets 中至少配置以下变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRAWLER_SERVICE_BASE_URL`
- `CRAWLER_SERVICE_TOKEN`
- `CRAWLER_CALLBACK_SECRET`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `OPENAI_API_KEY`（或兼容供应商 Key）

常用补充：

- `TIKHUB_TOKEN`（小红书/抖音兜底）
- `TAVILY_API_KEY` / `BOCHA_API_KEY` / `YOU_API_KEY`
- `SELF_CRAWLER_RATIO`
- `CRAWLER_CALLBACK_URL`（可选）

## 常用开发命令

```bash
# 前端开发
npm run dev

# 前端构建与预览
npm run build
npm run preview

# 代码检查与测试
npm run lint
npm run test
```

## 后端运维

### 数据库迁移

```bash
supabase db push
```

### 部署全部函数

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

## 部署建议（生产）

1. Supabase：先执行迁移，再部署 Edge Functions。
2. 爬虫服务：使用 Docker、PM2、systemd 或 launchd 常驻。
3. 将 `CRAWLER_SERVICE_BASE_URL` 配置为可公网访问地址（不要使用本地回环地址）。

## 故障排查

### 1. 扫码成功但未保存 cookie

优先检查：

- `crawler-service` 是否运行中
- `crawler-auth-status` 返回是否为 `authorized`
- `crawler-auth-sessions` 是否存在该用户活跃会话

本地可用脚本直连验证：

```bash
source crawler-service/.venv/bin/activate
python scripts/crawler/qr_session_probe.py --platform xiaohongshu --user-id <your-user-uuid> --open
```

### 2. 报错 `SELF_CRAWLER_EMPTY` 或样本不足

常见原因：

- 账号触发平台风控
- 关键词过窄或语义不匹配
- 会话处于冷却期

建议：

- 启用 TikHub 兜底
- 增加关键词扩展数量
- 增加重试间隔，避免短时间高频请求

### 3. 小红书 `api_error_-104`

该错误通常表示小红书搜索接口权限或风控限制。即使扫码登录成功，也可能出现。项目已支持：

- 错误识别与清晰提示
- 真实浏览器模式（CDP）
- 第三方兜底

注意：`-104` 目前无法通过单纯代码修改实现 100% 消除。

### 4. 卡在“智能摘要/分析中”

优先检查：

- LLM 配置是否可用（Base URL / API Key / Model）
- 函数日志是否出现 `LLM_UNAVAILABLE`
- 对应函数是否已成功部署

### 5. 前端可运行但抓取始终失败

通常是后端链路未打通：

- `CRAWLER_SERVICE_BASE_URL` 仍指向本地地址
- `CRAWLER_SERVICE_TOKEN` 与 crawler 端配置不一致
- 回调密钥（`CRAWLER_CALLBACK_SECRET`）不匹配

### 6. 如何确认系统正在正常工作

- 前端 SSE 进度是否持续推进
- `crawler-health` 是否正常
- `crawler_jobs` / `crawler_samples` 是否持续有新增
- `list-validations` 是否从 `pending/analyzing` 进入 `completed/failed`

## 已知限制

小红书反爬机制较严格，触发风控（典型 `-104`）时可能出现“扫码成功但关键词抓取失败”。

生产建议：

- 保留扫码登录能力（优先自爬）
- 同时启用第三方兜底（如 TikHub）保证可用性

## 欢迎共建

如果你也在做中文场景的需求验证、增长分析或社媒数据产品，欢迎一起把 IdeaScan 做得更稳、更准、更开源友好。

我们特别欢迎以下方向的贡献：

- 爬虫稳定性：平台风控对抗、重试策略、会话健康检测、限流与熔断
- 数据质量：去重、清洗、异常样本识别、证据可追溯性与置信度评估
- 数据源扩展：新增站点接入、字段标准化、跨源融合与回退策略
- 工程可维护性：监控告警、压测脚本、错误分级、文档完善与示例补齐

提交建议：

- 小步 PR，附上复现步骤与预期结果
- 涉及爬虫或数据逻辑的改动，尽量附带样本与对比说明
- 严禁提交任何真实密钥、cookie 或敏感数据

## License

内部项目，按团队规范使用。
