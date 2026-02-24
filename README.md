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

## 🚀 从零开始运行（小白友好版）

> 💡 **不想折腾后端？** 如果你只是想体验产品，可以直接访问线上版本：  
> **https://sparkle-view-lab.lovable.app**  
> 以下教程适用于想在本地开发或二次开发的同学。

### 前置准备清单

在开始之前，请确保你的电脑已安装以下工具：

| 工具 | 用途 | 安装方式 | 验证命令 |
|------|------|----------|----------|
| **Node.js 18+** | 运行前端 | [下载](https://nodejs.org/) 或 `brew install node` | `node -v` |
| **npm** | 包管理器 | 随 Node.js 一起安装 | `npm -v` |
| **Git** | 代码管理 | [下载](https://git-scm.com/) 或 `brew install git` | `git -v` |
| **Supabase CLI** | 数据库管理 | `brew install supabase/tap/supabase` | `supabase --version` |
| **Python 3.11+** | 爬虫服务（可选） | [下载](https://www.python.org/) 或 `brew install python` | `python3 --version` |
| **Redis** | 爬虫队列（可选） | `brew install redis` | `redis-cli ping` |

> 🍎 macOS 用户推荐使用 [Homebrew](https://brew.sh/) 一键安装：`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

---

### 第一步：克隆项目

```bash
git clone <你的仓库地址>
cd project-ideascan
```

---

### 第二步：启动前端（约 2 分钟）

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板
cp .env.example .env

# 3. 编辑 .env，填入你的 Supabase 信息
#    如果使用 Lovable Cloud，这些值会自动填充，无需手动修改
#    如果自建 Supabase，需要填写：
#      VITE_SUPABASE_URL=https://你的项目ID.supabase.co
#      VITE_SUPABASE_PUBLISHABLE_KEY=你的anon_key
#      VITE_SUPABASE_PROJECT_ID=你的项目ID

# 4. 启动开发服务器
npm run dev
```

看到以下输出就说明前端启动成功了 🎉：
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

在浏览器打开 `http://localhost:5173` 即可看到页面。

> ⚠️ **此时前端可以浏览，但验证功能需要后端支持。** 继续下面的步骤配置后端。

---

### 第三步：初始化数据库（约 3 分钟）

#### 方式 A：本地 Docker 模式（推荐新手）

需要先安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。

```bash
# 启动本地 Supabase 并初始化数据库
./scripts/bootstrap.sh local
```

运行成功后会输出本地 Supabase 的 URL 和 Key，将它们填入 `.env` 文件。

#### 方式 B：远端 Supabase 模式

如果你已经有 Supabase 项目并完成了 `supabase link`：

```bash
# 推送数据库迁移并部署 Edge Functions
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote
```

#### 方式 C：Lovable Cloud（最简单）

如果你在 [Lovable](https://lovable.dev) 上运行此项目，数据库和 Edge Functions **已自动配置**，无需任何手动操作。直接跳到第四步。

---

### 第四步：配置 AI 和搜索服务

验证功能的核心依赖是 LLM（大语言模型）。你需要配置至少一个 AI 服务：

#### 选项 1：使用兼容 OpenAI 格式的 API（推荐）

在 Supabase 项目的 Secrets 中配置：

| Secret 名称 | 值 | 去哪获取 |
|-------------|-----|----------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 或兼容服务商 |
| `LLM_MODEL` | `gpt-4o-mini` | 你选择的模型名称 |
| `LLM_API_KEY` | `sk-xxx...` | API Key |

> 💡 **兼容服务商推荐**：[DeepSeek](https://platform.deepseek.com/)、[SiliconFlow](https://siliconflow.cn/)、[Moonshot](https://platform.moonshot.cn/) 等国内服务商也提供 OpenAI 兼容接口，价格更优惠。

#### 选项 2：使用 Lovable AI（零配置）

如果在 Lovable Cloud 上运行，系统内置 Lovable AI 作为兜底，即使不配置任何 LLM 也能完成基础验证。

#### 搜索服务（竞品分析增强，可选）

| Secret 名称 | 用途 | 获取地址 |
|-------------|------|----------|
| `TAVILY_API_KEY` | Web 搜索 | [tavily.com](https://tavily.com/) |
| `BOCHA_API_KEY` | 中文搜索增强 | [bochaai.com](https://bochaai.com/) |
| `TIKHUB_TOKEN` | 小红书/抖音数据兜底 | [tikhub.io](https://tikhub.io/) |

---

### 第五步：启动爬虫服务（可选，社媒数据抓取需要）

> 💡 **不启动爬虫也能用！** 系统会自动降级到 TikHub 第三方数据源（需配置 `TIKHUB_TOKEN`）或 Web 搜索。  
> 爬虫服务的优势是数据更新鲜、更完整，适合深度验证。

```bash
# 1. 进入爬虫服务目录
cd crawler-service

# 2. 创建 Python 虚拟环境（首次运行需要）
python3 -m venv .venv

# 3. 激活虚拟环境
source .venv/bin/activate       # macOS / Linux
# .venv\Scripts\activate        # Windows

# 4. 安装依赖
pip install -r requirements.txt

# 5. 安装浏览器内核（首次需要，约 100MB）
playwright install chromium

# 6. 启动 API 服务
uvicorn app.main:app --reload --port 8100
```

看到以下输出说明启动成功：
```
INFO:     Uvicorn running on http://127.0.0.1:8100 (Press CTRL+C to quit)
```

如需异步任务处理（大批量抓取），**另开一个终端窗口**：

```bash
cd crawler-service
source .venv/bin/activate
python run_worker.py
```

最后，在 Supabase Secrets 中配置爬虫服务连接：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `CRAWLER_SERVICE_BASE_URL` | `http://localhost:8100` | 本地开发地址 |
| `CRAWLER_SERVICE_TOKEN` | 自定义一个长字符串 | 爬虫端也需要设同样的值 |
| `CRAWLER_CALLBACK_SECRET` | 自定义一个长字符串 | 回调签名密钥 |

---

### 🎉 启动完成！

恭喜！你的 IdeaScan 本地开发环境已准备就绪。

| 服务 | 地址 | 状态 |
|------|------|------|
| 前端 | http://localhost:5173 | 必需 ✅ |
| Supabase | 本地 Docker 或远端 | 必需 ✅ |
| 爬虫服务 | http://localhost:8100 | 可选 ⚡ |
| Redis | localhost:6379 | 爬虫队列需要 ⚡ |

**接下来你可以：**
1. 🔐 注册一个账号（首页右上角）
2. 💡 输入你的创业想法，点击"开始验证"
3. 📊 等待 1-3 分钟，查看完整验证报告
4. 🔥 在"发现"页浏览热点雷达

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

## 🧪 常用开发命令

```bash
# 前端开发
npm run dev            # 启动开发服务器
npm run build          # 生产构建
npm run preview        # 预览构建产物
npm run lint           # 代码检查
npm run test           # 运行测试

# 数据库
supabase db push       # 推送迁移到远端
supabase db reset      # 重置本地数据库
supabase status        # 查看本地 Supabase 状态

# Edge Functions
supabase functions deploy validate-idea-stream   # 部署单个函数
DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote   # 部署全部核心函数

# 爬虫服务
cd crawler-service && source .venv/bin/activate
uvicorn app.main:app --reload --port 8100   # 启动 API
python run_worker.py                         # 启动 Worker
./scripts/crawler/status.sh                  # 查看服务状态
```

---

## 🔧 常见问题 & 故障排查

<details>
<summary><strong>❓ npm install 报错</strong></summary>

1. 确保 Node.js 版本 ≥ 18：`node -v`
2. 清理缓存重试：
```bash
rm -rf node_modules package-lock.json
npm install
```
3. 如果仍有问题，尝试使用 `bun install` 代替
</details>

<details>
<summary><strong>❓ 页面打开是白屏</strong></summary>

1. 打开浏览器开发者工具（F12），查看控制台是否有红色报错
2. 最常见原因：`.env` 文件缺失或 Supabase 配置错误
3. 确认 `.env` 中的 URL 和 Key 正确（不要有多余空格或引号）
</details>

<details>
<summary><strong>❓ 注册/登录不了</strong></summary>

1. 确认 Supabase 项目已正确初始化（数据库迁移已执行）
2. 本地模式：确认 Docker Desktop 正在运行
3. 远端模式：确认 `supabase link` 已完成并 `supabase db push` 成功
</details>

<details>
<summary><strong>❓ 点击验证后一直转圈 / 报错</strong></summary>

1. **没有配置 LLM**：至少需要配置一个 AI 服务（见第四步）
2. **Edge Functions 未部署**：运行 `DEPLOY_FUNCTIONS=true ./scripts/bootstrap.sh remote`
3. **查看函数日志**：在 Supabase Dashboard → Edge Functions → Logs 中排查
4. 系统内置 Lovable AI 兜底，如果用户模型失败会自动切换
</details>

<details>
<summary><strong>❓ 扫码登录小红书成功但抓取失败</strong></summary>

1. 确认 `crawler-service` 正在运行（`http://localhost:8100` 可访问）
2. 可能是平台风控，建议：
   - 等待 5-10 分钟后重试
   - 配置 `TIKHUB_TOKEN` 作为兜底
   - 查看 crawler 日志排查具体错误
</details>

<details>
<summary><strong>❓ 报错 SELF_CRAWLER_EMPTY 或样本不足</strong></summary>

常见原因：账号触发风控 / 关键词过窄 / 会话冷却期

建议：启用 TikHub 兜底、增加关键词扩展数量、增加重试间隔
</details>

<details>
<summary><strong>❓ 小红书 api_error_-104</strong></summary>

小红书搜索接口权限或风控限制，即使扫码成功也可能出现。系统已支持错误识别、真实浏览器模式（CDP）、第三方兜底。此错误无法 100% 消除。
</details>

<details>
<summary><strong>❓ playwright install 失败</strong></summary>

1. 网络问题（国内）：设置镜像
```bash
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright pip install playwright
playwright install chromium
```
2. 权限问题：`sudo playwright install-deps` 安装系统依赖
</details>

---

## 🚢 生产部署

### 快速部署（推荐 Lovable Cloud）

在 [Lovable](https://lovable.dev) 上直接运行项目，前端/数据库/Edge Functions 全部自动部署，点击 Publish 即可上线。

### 自建部署

1. **数据库**：先执行迁移 `supabase db push`，再部署 Edge Functions
2. **前端**：`npm run build` 后将 `dist/` 部署到任意静态托管（Vercel / Netlify / Cloudflare Pages）
3. **爬虫服务**：使用 Docker / PM2 / systemd / launchd 常驻
4. **网络**：`CRAWLER_SERVICE_BASE_URL` 须为公网可访问地址
5. **LLM 冗余**：配置用户自有模型 + Lovable AI 双路兜底

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
