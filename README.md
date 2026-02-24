# IdeaScan — AI 需求验证与市场洞察平台

<p align="center">
  <strong>输入一个想法，自动完成关键词扩展 → 社媒数据抓取 → 竞品分析 → 生成可追踪验证报告</strong><br/>
  🌐 <a href="https://ideascan.lovable.app">ideascan.lovable.app</a>
</p>

---

## 📑 目录

- [产品亮点](#-产品亮点)
- [技术架构](#-技术架构)
- [目录结构](#-目录结构)
- [快速开始](#-从零开始运行小白友好版)
- [核心功能详解](#-核心功能详解)
- [产品路线图](#-产品路线图-roadmap)
- [常用开发命令](#-常用开发命令)
- [常见问题](#-常见问题--故障排查)
- [生产部署](#-生产部署)
- [贡献指引](#-贡献指引)
- [致谢](#-致谢)
- [License](#-license)

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
│              Lovable Cloud (Backend)                         │
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
| 后端 | Lovable Cloud — Postgres · Edge Functions (Deno) · Auth · RLS |
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
└── integrations/        # 后端客户端（自动生成，勿修改）

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
```

---

## 🚀 从零开始运行（小白友好版）

> 💡 **不想折腾后端？** 直接访问线上版本：**https://ideascan.lovable.app**
> 以下教程适用于本地开发或二次开发。

### 前置准备

| 工具 | 用途 | 验证命令 |
|------|------|----------|
| **Node.js 18+** | 运行前端 | `node -v` |
| **Git** | 代码管理 | `git -v` |
| **Python 3.11+** | 爬虫服务（可选） | `python3 --version` |
| **Redis** | 爬虫队列（可选） | `redis-cli ping` |

### 第一步：克隆项目

```bash
git clone <你的仓库地址>
cd project-ideascan
```

### 第二步：启动前端

```bash
npm install
cp .env.example .env
# 编辑 .env，填入后端连接信息（Lovable Cloud 用户无需修改）
npm run dev
```

浏览器打开 `http://localhost:5173` 即可看到页面。

### 第三步：初始化数据库

**方式 A：本地 Docker 模式**（需 [Docker Desktop](https://www.docker.com/products/docker-desktop/)）

```bash
./scripts/bootstrap.sh local
```

**方式 B：远端模式**（已完成 `supabase link`）

```bash
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote
```

**方式 C：Lovable Cloud**（最简单）— 数据库和后端函数已自动配置，直接跳到第四步。

### 第四步：配置 AI 和搜索服务

至少配置一个 LLM 服务（在后端 Secrets 中设置）：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 或兼容服务商 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名称 |
| `LLM_API_KEY` | `sk-xxx...` | API Key |

> 💡 兼容服务商推荐：[DeepSeek](https://platform.deepseek.com/)、[SiliconFlow](https://siliconflow.cn/)、[Moonshot](https://platform.moonshot.cn/)

**可选搜索增强：**

| Secret 名称 | 用途 |
|-------------|------|
| `TAVILY_API_KEY` | Web 搜索 |
| `BOCHA_API_KEY` | 中文搜索增强 |
| `TIKHUB_TOKEN` | 小红书/抖音数据兜底 |

### 第五步：启动爬虫服务（可选）

> 不启动爬虫也能用——系统会自动降级到 TikHub 或 Web 搜索。

```bash
cd crawler-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8100
```

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
- **个性化推荐**：基于用户历史验证 tags 匹配相关热点

### MVP 落地页

- 从验证报告一键生成 MVP 产品落地页
- 内置 Waitlist 表单与 CTA 追踪
- 需求验证实验：追踪真实用户行为信号

---

## 🗺 产品路线图 (Roadmap)

### ✅ 已完成 (v1.0)

- 端到端需求验证（关键词扩展 → 多平台抓取 → AI 评分报告）
- 热点雷达与个性化推荐
- MVP 落地页一键生成 + Waitlist 线索收集
- AI 专家团圆桌讨论（多角色模拟 VC/PM/用户/分析师视角）
- 竞品透视分析
- 多 LLM 三级回退（用户自配 → 服务端默认 → Lovable AI）
- 数据导入/导出 & PDF 报告
- 中英双语国际化

### 🚧 近期规划 (v2.0) — 社媒数据库 + MVP 原型升级

| 方向 | 说明 |
|------|------|
| **社媒数据库** | 将每次验证抓取的社媒数据（小红书、抖音帖子/评论）持久化为结构化数据资产，支持跨验证复用、趋势回溯，不再用完即弃 |
| **MVP 原型增强** | 从静态落地页升级为可交互原型（多页面、表单流、模拟支付），更真实地测试用户意愿 |
| **社媒发布闭环** | 验证完成后一键生成适配小红书、抖音等平台格式的推广内容（图文笔记、短视频脚本），直接发布或导出素材包 |
| **邮件通知** | Waitlist 提交后自动发送确认邮件给用户，同时通知创业者 |

### 🔭 远期愿景 (v3.0) — 全链路创业操作系统

| 方向 | 说明 |
|------|------|
| **狩猎雷达 (The Hunter)** | 24h 定时扫描特定圈层讨论，自动发现未被满足的需求，构建"潜在需求库" |
| **智能匹配** | 将发现的市场机会一键导入 MVP 生成器，直接生成落地页验证 |
| **增长飞轮 (Growth Pilot)** | 利用社媒发布能力自动为 MVP 导流，形成"发现 → 验证 → 落地 → 增长"完整闭环 |
| **高级主题与 SEO** | 动态 OG Image、多主题模板、搜索引擎优化 |

---

## 🧪 常用开发命令

```bash
# 前端开发
npm run dev            # 启动开发服务器
npm run build          # 生产构建
npm run test           # 运行测试

# 数据库
supabase db push       # 推送迁移到远端
supabase db reset      # 重置本地数据库

# Edge Functions
supabase functions deploy validate-idea-stream   # 部署单个函数
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote   # 部署全部

# 爬虫服务
cd crawler-service && source .venv/bin/activate
uvicorn app.main:app --reload --port 8100
python run_worker.py
```

---

## 🔧 常见问题 & 故障排查

<details>
<summary><strong>❓ npm install 报错</strong></summary>

1. 确保 Node.js ≥ 18：`node -v`
2. 清理缓存：`rm -rf node_modules package-lock.json && npm install`
</details>

<details>
<summary><strong>❓ 页面白屏</strong></summary>

打开浏览器开发者工具（F12）查看控制台。最常见原因：`.env` 文件缺失或后端配置错误。
</details>

<details>
<summary><strong>❓ 点击验证后一直转圈</strong></summary>

1. 未配置 LLM — 至少配置一个 AI 服务（见第四步）
2. 后端函数未部署 — 运行 `DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote`
3. 查看后端日志排查具体错误
</details>

<details>
<summary><strong>❓ 扫码登录成功但抓取失败</strong></summary>

1. 确认 `crawler-service` 正在运行
2. 可能触发平台风控，等待 5-10 分钟后重试
3. 配置 `TIKHUB_TOKEN` 作为兜底
</details>

<details>
<summary><strong>❓ 报错 SELF_CRAWLER_EMPTY 或样本不足</strong></summary>

常见原因：账号触发风控 / 关键词过窄 / 会话冷却期。建议启用 TikHub 兜底。
</details>

---

## 🚢 生产部署

### Lovable Cloud（推荐）

在 [Lovable](https://lovable.dev) 上运行项目，前端/数据库/后端函数全部自动部署，点击 Publish 即可上线。

### 自建部署

1. **数据库**：执行迁移 `supabase db push`，部署 Edge Functions
2. **前端**：`npm run build` → 将 `dist/` 部署到 Vercel / Netlify / Cloudflare Pages
3. **爬虫服务**：Docker / PM2 / systemd 常驻
4. **LLM 冗余**：配置用户自有模型 + Lovable AI 双路兜底

---

## 🤝 贡献指引

欢迎参与以下方向的共建：

- **爬虫稳定性**：风控对抗、重试策略、会话健康检测
- **数据质量**：去重清洗、异常识别、置信度评估
- **数据源扩展**：新平台接入、字段标准化
- **工程质量**：监控告警、测试覆盖、文档完善

> ⚠️ **严禁提交任何真实密钥、Cookie 或敏感数据**

---

## 🙏 致谢

IdeaScan 的诞生离不开以下开源项目的启发与支撑：

- **[XHS_Business_Idea_Validator](https://github.com/)** — 本项目的灵感原点。其基于多 Agent + MCP 架构的小红书商业验证方案，奠定了"关键词扩展 → 社媒抓取 → AI 分析 → 报告生成"的核心工作流范式。IdeaScan 在此基础上演化为云原生架构，扩展了多平台、实时流、热点雷达等能力，但始终铭记这一优秀的起点。

- **[crawler-service](crawler-service/)** — 项目自研的独立爬虫服务。从零构建了扫码登录、会话池管理、风控对抗、异步队列、多平台适配器等完整能力栈。它是 IdeaScan 数据采集层的核心引擎，让"自爬优先 + 第三方兜底"的双路数据策略成为可能。

感谢所有为社媒数据分析和需求验证领域贡献智慧的开发者们。

---

## 📄 License

内部项目，按团队规范使用。
