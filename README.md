# IdeaScan

IdeaScan 是一个面向中文创业者/独立开发者的需求验证系统，目标是更快判断一个想法是否值得做。

当前版本重点是两条主线：
- 降本稳质：降低单次验证的 token/API 成本，同时保持结论稳定。
- 需求可用性证明：在市场信号之外，新增付费意图实验闭环。

## 核心能力

- 社媒+竞品分析：输出市场信号结论（需求强度、竞品态势、风险建议）。
- 证据等级：报告新增 `A/B/C/D` 证据等级，而不是只看单一分数。
- 成本拆解：报告记录 `llm_calls / token / external_api_calls / est_cost / latency`。
- 付费意图闭环：支持 `view -> cta_click -> checkout_start -> paid_intent/waitlist_submit` 事件漏斗。
- 混合采集路由：`self_crawler` 主路 + `third_party` 兜底（可灰度比例控制）。

## 技术栈

- 前端：Vite + React + TypeScript + Tailwind + shadcn/ui
- 后端：Supabase (Postgres + Edge Functions + Auth + RLS)
- 测试：Vitest

## 目录结构

```text
src/                         # 前端应用
supabase/functions/          # Edge Functions
supabase/migrations/         # 数据库迁移
crawler-service/             # 独立爬虫服务（FastAPI + Worker + Redis）
```

关键函数：
- `validate-idea`：非流式验证主链路
- `validate-idea-stream`：流式验证主链路
- `generate-mvp`：生成实验落地页并初始化实验
- `track-experiment-event`：实验事件采集与漏斗回写
- `submit-mvp-lead`：服务端线索提交、限流、防刷、去重
- `crawler-dispatch`：向独立爬虫服务下发抓取任务
- `crawler-callback`：接收爬虫回调并落库（样本/指标/raw signals）

## 快速开始

### 1. 安装依赖

```bash
npm i
```

### 2. 配置前端环境变量

创建 `.env`（或 `.env.local`）：

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### 3. 启动前端

```bash
npm run dev
```

## Supabase 本地/远端准备

### 1. 应用数据库迁移

```bash
supabase db push
```

本次关键迁移：
- `supabase/migrations/20260216162000_validation_cost_and_proof.sql`
- `supabase/migrations/20260216190000_add_crawler_service_tables.sql`

该迁移包含：
- `validation_reports` 新增：`evidence_grade`、`cost_breakdown`、`proof_result`
- 新增表：`demand_experiments`、`experiment_events`、`idea_proof_snapshots`
- 新增表：`crawler_jobs`、`crawler_samples`、`crawler_provider_metrics_daily`
- 配额统一：`user_quotas.free_tikhub_limit` 默认 3
- 计数字段统一：`trending_topics.validate_count -> validation_count`
- Lead 去重索引：`mvp_leads(landing_page_id, lower(email))`

### 2. 配置 Edge Function Secrets

以下变量按需配置（在 Supabase Project Secrets）：

- 基础：
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- LLM：
  - `LLM_BASE_URL`
  - `LLM_MODEL`
  - `LOVABLE_API_KEY` 或 `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`
- 第三方搜索：
  - `TAVILY_API_KEY`
  - `BOCHA_API_KEY`
  - `YOU_API_KEY`
- 第三方抓取：
  - `TIKHUB_TOKEN`
- 图像生成（可选）：
  - `IMAGE_GEN_BASE_URL`
  - `IMAGE_GEN_MODEL`
  - `IMAGE_GEN_API_KEY`
- 灰度控制：
  - `SELF_CRAWLER_RATIO`（建议从 `0.2` 开始）
- 独立爬虫：
  - `CRAWLER_SERVICE_BASE_URL`
  - `CRAWLER_SERVICE_TOKEN`
  - `CRAWLER_CALLBACK_SECRET`
  - `CRAWLER_CALLBACK_URL`（可选，不配时自动使用 Supabase Functions 回调地址）

### 3. 部署关键函数

首次换库时，建议直接全量部署，避免遗漏前端依赖函数导致 `401/404/non-2xx`：

```bash
supabase functions deploy $(find supabase/functions -mindepth 1 -maxdepth 1 -type d -not -name "_*" -exec basename {} \; | tr '\n' ' ')
```

如果你只想部署当前前端主链路，至少要包含（按页面真实调用补齐）：

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

## crawler-service 运行

```bash
cd crawler-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8100
```

另开终端启动 worker：

```bash
cd crawler-service
source .venv/bin/activate
python run_worker.py
```

说明：
- `CRAWLER_INLINE_MODE=false` 时，必须启动 `run_worker.py` 消费队列。
- `CRAWLER_INLINE_MODE=true` 时，只起 `uvicorn` 也可执行任务（开发/本地联调更简单）。

## 需求可用性判定（当前规则）

主判定指标：
- `paid_intent_rate = paid_intent / UV`

辅判定指标：
- `waitlist_rate = waitlist_submit / UV`

默认 verdict 规则在：
- `supabase/functions/_shared/proof-experiment.ts`

当前阈值（可调整）：
- `UV < 50`：`insufficient_data`
- `paid_intent_rate >= 0.08`：`validated_paid_intent`
- `paid_intent_rate >= 0.04` 或 `waitlist_rate >= 0.12`：`promising_need`
- `waitlist_rate >= 0.06`：`needs_iteration`
- 否则：`weak_signal`

## 降本策略（已上线）

- 上下文预算器：去重+排序+限额后再送 LLM  
  文件：`supabase/functions/_shared/context-budgeter.ts`
- 预算驱动摘要：`quick` 模式走轻量摘要，降低多层 LLM 调用
- 采集混合切换：优先自有信号，不足再走第三方
- 配额延迟扣减：仅在实际使用第三方抓取时检查/扣减免费额度
- 报告可观测：展示本次成本拆解与耗时

## 采集开关说明（前端设置）

在设置页可单独控制两条采集链路：
- `启用自爬服务 (Self Crawler)`：开启后优先尝试自爬链路。
- `启用 TikHub 兜底`：开启后在自爬样本不足时自动回退 TikHub。

行为规则：
- `quick` 模式：强制只走自爬链路（不走 TikHub）。
- `deep` 模式：按开关策略运行（可自爬 + TikHub 兜底）。
- 两者都开：按路由策略运行（默认自爬灰度 + TikHub 兜底）。
- 只开自爬：强制尝试自爬，不走 TikHub（适合降本测试）。
- 只开 TikHub：只走 TikHub（仅 deep 模式可生效）。
- 两者都关：仅可用缓存；若无缓存会直接报错。
- 当前前端配额逻辑：仅在“启用 TikHub 兜底且无自带 Token”时才检查免费额度。

扫码登录能力（crawler-service）：
- 支持小红书/抖音用户扫码登录，登录后保存该用户会话。
- 抓取时会优先使用该用户会话；会话抓取失败时才回退 TikHub（取决于模式与开关）。
- `quick` 默认采样提升为 `8` 帖 / 每帖 `10` 评论，兼顾可信度与风控。
- `deep` 默认采样为 `14` 帖 / 每帖 `30` 评论，适合做高置信结论。
- crawler-service 支持每用户每日预算开关：`CRAWLER_ENABLE_DAILY_BUDGET` + `CRAWLER_DAILY_BUDGET_UNITS`。
- crawler-service 支持会话安全与健康控制：`CRAWLER_SESSION_ENCRYPTION_KEY`、`CRAWLER_SESSION_MAX_IDLE_HOURS`、`CRAWLER_SESSION_FAIL_THRESHOLD`。
- crawler-service 评论抓取优先走接口响应，并支持游标翻页补样；DOM 仅用于兜底。
- crawler-service 会话支持自动剔除：空闲超时 / cookie 过期 / 连续失败超阈值会自动移出会话池。
- 扫码状态可观测：`crawler-auth-status` 返回 `message + auth_metrics`，前端可展示 Cookie 总数与关键 Cookie 就绪度。

## 测试与质量

```bash
npm run test
npm run build
```

说明：
- 当前仓库 `npm run lint` 仍有历史存量问题（大量 `any` 等），并非本次功能新增导致。

## 对外口径（当前）

- 免费额度：每月 3 次（无自带 TikHub Token 时）
- 如果用户配置自己的 TikHub Token：不受免费额度限制

## 后续建议

- 将 `SELF_CRAWLER_RATIO` 逐步从 `0.2 -> 0.5 -> 0.8` 灰度提升
- 基于真实运行数据迭代 proof 阈值与证据等级门槛
- 引入异步 Batch 任务，进一步降低重复上下文成本
