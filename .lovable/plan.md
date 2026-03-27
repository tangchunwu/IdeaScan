

## 计划：补全各页面 SEO 标题 + 添加动态 meta description

### 问题
- 7-8 个页面缺少 `useDocumentTitle`，搜索引擎和浏览器标签显示默认标题
- 所有页面共享同一个 meta description，搜索引擎无法区分各页面内容

### 改动方案

#### 1. 为缺失页面添加 `useDocumentTitle`

| 页面 | 标题 |
|------|------|
| Auth | "登录 / 注册" |
| Privacy | "隐私政策" |
| Terms | "服务条款" |
| NotFound | "页面未找到" |
| MVPGenerator | "MVP 生成器" |
| PublicLandingPage | 动态："{产品名} - MVP 落地页" |
| OpenClaw | "OpenClaw AI 助手" |
| FeedbackDashboard | "反馈管理后台" |

AuthCallback 为过渡页，不需要。

#### 2. 扩展 `useDocumentTitle` 支持动态 meta description

在 `useDocumentTitle` hook 中增加可选的 `description` 参数，动态更新 `<meta name="description">` 标签。

#### 3. 为核心页面补充独立 description

| 页面 | description |
|------|-------------|
| Index | 保持 index.html 默认 |
| Validate | "一句话描述你的创业想法，AI 自动抓取社媒数据和竞品情报，3分钟生成需求验证报告。" |
| Discover | "发现正在爆发的市场机会，追踪社媒热门话题和创业趋势。" |
| Pricing | "IdeaScan 定价方案，免费体验 AI 需求验证。" |
| FAQ | "关于 IdeaScan AI 创业验证工具的常见问题解答。" |
| Report | "查看 AI 生成的需求验证报告，包含市场分析、竞品情报和用户画像。" |

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/hooks/useDocumentTitle.ts` | 增加 description 参数，动态更新 meta |
| `src/pages/Auth.tsx` | 添加 useDocumentTitle |
| `src/pages/Privacy.tsx` | 添加 useDocumentTitle |
| `src/pages/Terms.tsx` | 添加 useDocumentTitle |
| `src/pages/NotFound.tsx` | 添加 useDocumentTitle |
| `src/pages/MVP/Generator.tsx` | 添加 useDocumentTitle |
| `src/pages/MVP/PublicLandingPage.tsx` | 添加 useDocumentTitle |
| `src/pages/OpenClaw.tsx` | 添加 useDocumentTitle（如缺失）|
| `src/pages/Admin/FeedbackDashboard.tsx` | 添加 useDocumentTitle |
| 核心页面（Validate、Discover 等） | 补充 description 参数 |

