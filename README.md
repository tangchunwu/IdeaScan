# IdeaScan — AI 需求验证与市场洞察平台

<p align="center">
  <strong>输入一个想法，自动完成关键词扩展 → 社媒数据抓取 → 竞品分析 → 生成可追踪验证报告</strong>
</p>

---

## ✨ 产品亮点

| 能力 | 说明 |
|------|------|
| **端到端验证** | 从想法到报告一键完成：关键词扩展 → 多平台抓取 → 数据清洗 → AI 摘要 → 评分报告 |
| **多平台数据源** | 小红书、抖音自爬 + TikHub 第三方兜底，双路由自动降级 |
| **AI 深度分析** | 多维评分（需求热度、竞争格局、可行性）、情感分析、痛点提取、用户画像 |
| **热点雷达** | 基于验证历史与定时扫描发现市场机会，气泡图可视化，个性化推荐 |
| **需求验证实验** | 自动生成 MVP 落地页，追踪 CTA 点击、Waitlist 提交等真实需求信号 |
| **实时进度流** | SSE 实时推送验证进度，失败自动重试，支持断点续传 |
| **报告可溯源** | 证据等级（A/B/C/D）、数据质量评分、成本拆解，每个结论可回溯原始数据 |
| **多 LLM 兜底** | 用户自配模型优先，Lovable AI 作为最终安全网，确保验证不因模型故障中断 |

---

## 🏗 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (Vite + React + TS)                  │
│         Tailwind CSS · shadcn/ui · Recharts · Framer        │
└──────────────────────┬──────────────────────────────────────┘
                       │ SSE / REST
┌──────────────────────▼──────────────────────────────────────┐
│              Lovable Cloud (Supabase)                        │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Postgres │  │Edge Funcs  │  │   Auth   │  │   RLS    │  │
│  │ + RLS    │  │(Deno)      │  │          │  │ Policies │  │
│  └──────────┘  └─────┬──────┘  └──────────┘  └──────────┘  │
└──────────────────────┼──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌─────────┐
   │ Crawler │   │ TikHub   │   │  LLM    │
   │ Service │   │ API      │   │ (多源)  │
   │(Python) │   │(兜底)    │   │         │
   └─────────┘   └──────────┘   └─────────┘
```

### 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vite · React 18 · TypeScript · Tailwind CSS · shadcn/ui · Recharts · Framer Motion |
| 后端 | Lovable Cloud (Supabase) — Postgres · Edge Functions (Deno) · Auth · RLS |
| 爬虫 | Python 3.11 · FastAPI · Playwright · Redis（独立 `crawler-service`） |
| AI | 多 LLM 路由（用户自配 + Lovable AI 兜底） |
| 测试 | Vitest |
| 国际化 | i18next（中/英双语） |

---

## 📁 目录结构

```text
src/
├── components/
│   ├── report/          # 验证报告页组件（评分、维度、AI分析、竞品等）
│   ├── discover/        # 热点雷达页组件（趋势卡片、气泡图、筛选器）
│   ├── dashboard/       # 对比分析组件
│   ├── social/          # 社交证明组件（VC 圆桌、分享卡片）
│   ├── shared/          # 通用组件（导航、加载、错误边界等）
│   └── ui/              # shadcn/ui 基础组件
├── pages/               # 路由页面（首页、验证、报告、历史、发现、定价等）
├── services/            # 业务服务层（验证、发现、社交、MVP、猎手）
├── hooks/               # 自定义 Hooks（认证、配额、设置、验证）
├── i18n/                # 国际化资源（中/英）
├── lib/                 # 工具函数（导出、PDF、报告生成等）
└── integrations/        # Supabase 客户端（自动生成，勿修改）

supabase/
├── functions/           # Edge Functions（30+ 个后端函数）
│   ├── validate-idea-stream/   # 核心：流式验证主函数
│   ├── validate-idea/          # 验证引擎（含多平台适配器）
│   ├── discover-topics/        # 热点发现与回填
│   ├── crawler-*/              # 爬虫调度与认证系列
│   ├── generate-mvp/           # MVP 落地页生成
│   └── _shared/                # 共享模块（LLM、搜索、限流等）
└── migrations/          # 数据库迁移（勿手动修改）

crawler-service/         # Python 爬虫服务
├── app/
│   ├── adapters/        # 平台适配器（小红书、抖音）
│   ├── main.py          # FastAPI 入口
│   ├── worker.py        # 异步任务 Worker
│   └── ...
└── scripts/             # 运维脚本

scripts/                 # 部署与运维脚本
```

---

## 🚀 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 配置环境变量

在仓库根目录创建 `.env`：

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

### 3. 初始化数据库

```bash
# 本地 Docker Supabase
./scripts/bootstrap.sh local

# 远端（已完成 supabase link）
./scripts/bootstrap.sh remote

# 初始化并部署核心函数
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173` 即可开始使用。

---

## 🕷 爬虫服务（社媒数据抓取必需）

### 本地开发

```bash
cd crawler-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# 启动 API 服务
uvicorn app.main:app --reload --port 8100

# 另开终端启动异步 Worker
python run_worker.py
```

### macOS 常驻运行

```bash
./scripts/crawler/install-launchd.sh
./scripts/crawler/status.sh
```

---

## 🔑 后端 Secrets 配置

### 必需

| Secret | 说明 |
|--------|------|
| `SUPABASE_URL` | 自动配置 |
| `SUPABASE_SERVICE_ROLE_KEY` | 自动配置 |
| `LLM_BASE_URL` | LLM API 地址（OpenAI 兼容格式） |
| `LLM_MODEL` | 模型名称 |
| `LLM_API_KEY` | LLM API Key |

### 推荐

| Secret | 说明 |
|--------|------|
| `TIKHUB_TOKEN` | TikHub 小红书/抖音数据兜底 |
| `LOVABLE_API_KEY` | Lovable AI 兜底（验证失败安全网） |
| `TAVILY_API_KEY` | Web 搜索（竞品分析） |
| `BOCHA_API_KEY` | 博查搜索（中文搜索增强） |

### 爬虫服务相关

| Secret | 说明 |
|--------|------|
| `CRAWLER_SERVICE_BASE_URL` | 爬虫服务公网地址 |
| `CRAWLER_SERVICE_TOKEN` | 爬虫服务认证 Token |
| `CRAWLER_CALLBACK_SECRET` | 回调签名密钥 |

---

## 📊 核心功能详解

### 需求验证流程

```
用户输入想法
    ↓
关键词扩展（LLM 生成 3-5 个搜索词）
    ↓
多源数据采集
├── 自爬小红书/抖音（Playwright + 扫码登录）
├── TikHub API（第三方兜底）
└── Web 搜索（Jina Reader 清洗）
    ↓
数据清洗 & 去重（Context Budgeter 控制成本）
    ↓
分层摘要（L1 快速摘要 → L2 深度分析）
    ↓
AI 综合评分 & 报告生成
├── 多维评分：需求热度、竞争格局、可行性
├── 情感分析 & 痛点提取
├── 用户画像 & 目标客群
├── 竞品对标分析
└── 证据等级 & 成本拆解
```

### 热点雷达

- **数据来源**：用户验证结果自动回填 + 定时扫描
- **质量评分**：热度 × 0.45 + 验证分数 × 0.4 + 样本量 × 0.15
- **智能过滤**：自动跳过失败验证、截断关键词、零分记录
- **个性化推荐**：基于用户历史验证 tags 匹配相关热点

### MVP 落地页

- 从验证报告一键生成 MVP 产品落地页
- 内置 Waitlist 表单与 CTA 追踪
- 需求验证实验：追踪真实用户行为信号

---

## 🧪 开发命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 代码检查
npm run lint

# 单元测试
npm run test

# 数据库迁移
supabase db push

# 部署全部 Edge Functions
supabase functions deploy $(find supabase/functions -mindepth 1 -maxdepth 1 -type d -not -name "_*" -exec basename {} \; | tr '\n' ' ')
```

---

## 🔧 故障排查

<details>
<summary><strong>扫码成功但未保存 Cookie</strong></summary>

1. 确认 `crawler-service` 正在运行
2. 调用 `crawler-auth-status` 检查返回是否为 `authorized`
3. 调用 `crawler-auth-sessions` 确认存在活跃会话

本地诊断脚本：
```bash
python scripts/crawler/qr_session_probe.py --platform xiaohongshu --user-id <uuid> --open
```
</details>

<details>
<summary><strong>报错 SELF_CRAWLER_EMPTY 或样本不足</strong></summary>

常见原因：账号触发风控 / 关键词过窄 / 会话冷却期

建议：启用 TikHub 兜底、增加关键词扩展数量、增加重试间隔
</details>

<details>
<summary><strong>小红书 api_error_-104</strong></summary>

小红书搜索接口权限或风控限制，即使扫码成功也可能出现。系统已支持错误识别、真实浏览器模式（CDP）、第三方兜底。此错误无法 100% 消除。
</details>

<details>
<summary><strong>卡在"智能摘要/分析中"</strong></summary>

1. 检查 LLM 配置（Base URL / API Key / Model）是否正确
2. 查看函数日志是否出现 `LLM_UNAVAILABLE`
3. 确认对应 Edge Function 已部署
4. 系统已内置 Lovable AI 兜底，若用户模型失败会自动切换
</details>

<details>
<summary><strong>前端可运行但抓取始终失败</strong></summary>

通常是后端链路未打通：
- `CRAWLER_SERVICE_BASE_URL` 仍指向本地地址
- `CRAWLER_SERVICE_TOKEN` 与爬虫端配置不一致
- 回调密钥 `CRAWLER_CALLBACK_SECRET` 不匹配
</details>

<details>
<summary><strong>验证失败后热点雷达出现残缺数据</strong></summary>

已修复：backfill 逻辑现在会过滤掉无分数、无报告、关键词过短（< 4 字符）的验证记录，不再写入残缺数据。
</details>

---

## 🚢 生产部署

1. **数据库**：先执行迁移 `supabase db push`，再部署 Edge Functions
2. **爬虫服务**：使用 Docker / PM2 / systemd / launchd 常驻
3. **网络**：`CRAWLER_SERVICE_BASE_URL` 须为公网可访问地址
4. **LLM 冗余**：配置用户自有模型 + Lovable AI 双路兜底

---

## 🤝 欢迎共建

如果你也在做中文场景的需求验证、增长分析或社媒数据产品，欢迎一起参与：

- **爬虫稳定性**：风控对抗、重试策略、会话健康检测、限流熔断
- **数据质量**：去重清洗、异常识别、证据可追溯性、置信度评估
- **数据源扩展**：新平台接入、字段标准化、跨源融合
- **工程质量**：监控告警、压测脚本、错误分级、文档完善

提交建议：
- 小步 PR，附上复现步骤与预期结果
- 涉及爬虫/数据逻辑的改动，附带样本与对比说明
- **严禁提交任何真实密钥、Cookie 或敏感数据**

---

## 🙏 致谢

IdeaScan 的诞生离不开以下开源项目的启发与支撑：

- **[XHS_Business_Idea_Validator](https://github.com/)** — 本项目的灵感原点。其基于多 Agent + MCP 架构的小红书商业验证方案，奠定了"关键词扩展 → 社媒抓取 → AI 分析 → 报告生成"的核心工作流范式。IdeaScan 在此基础上演化为云原生架构，扩展了多平台、实时流、热点雷达等能力，但始终铭记这一优秀的起点。

- **[crawler-service](crawler-service/)** — 项目自研的独立爬虫服务。从零构建了扫码登录、会话池管理、风控对抗、异步队列、多平台适配器等完整能力栈。它是 IdeaScan 数据采集层的核心引擎，让"自爬优先 + 第三方兜底"的双路数据策略成为可能。

感谢所有为社媒数据分析和需求验证领域贡献智慧的开发者们。

---

## 📄 License

内部项目，按团队规范使用。
