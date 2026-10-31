# RETROSPECTIVE

## 2026-10-31｜核心验证链路稳定性与安全边界修复

### Challenges

- 长时间未维护后，前端验证流程、SSE 传输、账号切换和 Edge Functions 出现跨层问题。
- 数据库 RLS、配额 RPC、邀请码 RPC、配对码策略和破坏性迁移需要线上确认，本轮不直接修改。

### Root Cause

- SSE 客户端按网络 chunk 直接解析 JSON，没有处理分包和提前 EOF。
- 私有 React Query 缓存没有按用户隔离，认证退出没有清理缓存和旧异步认证结果。
- 主验证 Edge Function 存在非法 await；信号处理入口缺少服务端鉴权和 batch 上限。
- crawler callback 提前设置 processed_at，导致原始信号绕过评分队列。
- 用户 API key 被持久化到 localStorage。

### Solutions

- 新增可测试的 SSE parser，支持跨 chunk、终态等待和异常断流。
- 按 userId 隔离验证 query key，认证边界清理 Query Cache，并用请求世代和 AbortController 防止旧 session 回写。
- 修复自动续跑 URL 参数、Discover 跳转、后台删除错误处理和设置密钥脱敏迁移。
- 修复 validate-idea-stream 的 async 编译错误；signal-processor 要求 service-role/admin 并限制批量；crawler callback 缺签名配置时拒绝请求；原始信号延后标记 processed_at。
- 完成预取改为后台执行，避免报告查询挂起阻塞完成预览。

### Verification

- Vitest 共 13 个测试文件、42 个测试全部通过。
- `npm run build` 通过。
- 前端 `tsc --noEmit` 通过。
- 关键 Edge Functions 的 `deno check` 通过。
- 隔离模拟确认匿名 signal-processor 被拒绝、service-role 调度仍可用、batch 被限制为 50、缺失 callback secret 被拒绝。

### Learnings

- 流式接口必须用协议级 parser 和 EOF 状态机，不能按 fetch chunk 直接 JSON.parse。
- 用户身份变化时，缓存、内存密钥、异步请求和自动导航必须作为一个生命周期一起清理。
- 生产 Edge Functions 不能只靠前端按钮或 Supabase 配置文件保证权限。

### Boundary

- 本轮没有改数据库迁移、RLS、配额函数、邀请码函数或配对码策略。
- 全仓库 ESLint 仍有历史问题；本轮以构建、类型检查、定向 Deno check 和行为测试为验收标准。

## 2026-10-31｜SPA SEO 路由元数据与静态页面输出

### Challenges

- SEO 扫描器提示部分页面缺少 `h1`，并指出所有路由共用首页 canonical 和静态元数据。
- 项目是 Vite + React Router SPA，浏览器运行后可以修改 head，但初始 HTML 默认仍只有首页信息。
- 报告、登录、后台和授权回调属于工具或私有页面，不应为了消除扫描提示而开放搜索收录。

### Root Cause

- `index.html` 只有一套首页 title、description、canonical 和 Open Graph 元数据。
- `useDocumentTitle` 原先只更新 title 和部分 description，没有按路由更新 canonical、robots、Open Graph 和 Twitter 元数据。
- 路由级元数据没有集中配置，公开页面和私有页面的收录边界容易漂移。

### Solutions

- 新增 `src/lib/seo.ts`，集中维护路由标题、description、canonical、robots 和分享图片规则。
- 扩展 `useDocumentTitle`，在 SPA 路由切换时同步更新 canonical、robots、Open Graph 和 Twitter 元数据。
- 在 `App.tsx` 增加路由级 SEO 兜底，公开营销页使用 `index, follow`，登录、后台、报告、历史和工具页使用 `noindex, nofollow`。
- 在 Vite 构建插件中为固定路由生成独立的 `dist/<route>/index.html`，让不执行 JavaScript 的扫描器也能读取正确的静态 head。
- 为授权回调补充隐藏主标题，为登录页补充明确的 `登录或注册 IdeaScan` 主标题。

### Verification

- `npm run build` 通过，并生成 FAQ、定价、验证页、登录页和后台页的独立 HTML。
- Vitest 共 21 个测试通过，其中 9 个 SEO 用例覆盖路由切换、标签创建、私有页收录限制和授权参数过滤。
- 定向 ESLint 通过；全仓库 ESLint 仍有历史代码中的既有问题，未纳入本次修复范围。
- 直接检查构建产物确认公开页面使用 `index, follow`，登录和后台使用 `noindex, nofollow`，canonical 指向对应路由。

### Learnings

- SPA SEO 必须同时处理运行时 head 和构建产物 head；只改 `document.title` 不足以修复 canonical 和静态扫描问题。
- 公开内容页、用户工具页和认证后台页应先划清收录边界，再决定是否补 `h1` 或元数据。
- 路由 SEO 配置必须集中维护，避免 App、页面 hook 和构建脚本各自复制一套规则。

### Boundary

- 动态 `/p/:slug` 页面可以在运行时生成标题和 canonical；未知 slug 无法在静态构建阶段预生成独立 HTML。
- 本次生成的是独立 head 的 HTML 外壳，没有预渲染页面正文或引入 SSR；需要执行 JavaScript 才能显示正文和 `h1`。
- 本地构建产物已验证；线上主机是否优先返回 `dist/<route>/index.html` 尚待发布后检查，若强制所有路径重写到首页，则需调整静态文件优先级。

## 2026-10-31｜TikHub V2 接口兼容与调用成本边界修复

### Challenges

- TikHub 官方生产 OpenAPI 已更新到 V5.3.2，仓库仍混用小红书旧字段、已移除的 Web 搜索路径和旧抖音搜索接口。
- TikHub 调用散落在验证、复查、趋势扫描、定时任务、适配器和配置验证中；重复重试与无限超时会放大计费和等待风险。
- 小红书评论与搜索翻页需要透传游标/会话状态，跨平台结果还要继续兼容现有 JSON 报告结构。

### Root Cause

- 请求参数直接拼接在多个 Edge Function 中，没有共享的供应商客户端和统一 envelope 解析。
- `sort=general`、`note_type=0` 不符合当前 XHS App V2 合同；抖音 `web/fetch_video_search_result` 不是当前推荐搜索入口。
- HTTP 200 的上游业务错误和异常 JSON 可能被当成空成功；部分错误路径还会继续换关键词或继续请求评论。

### Solutions

- 新增共享 `TikHubClient`，统一 Bearer 鉴权、30-60 秒有限超时、有限重试、Retry-After、429 统计、业务失败识别和物理请求计数。
- XHS 统一使用 App V2 当前字段与搜索会话翻页；评论使用 `cursor/index/pageArea/sort_strategy=latest_v2` 并去重。
- 抖音搜索切换为官方 `POST /api/v1/douyin/search/fetch_video_search_v5`，传递 `offset/page/search_id/backtrace`；评论保留当前有效的 Web 评论接口。
- 验证主流、复查、趋势扫描、调度、渠道适配器和配置验证全部复用客户端；失败停止后续计费请求，已有样本仍可返回。
- 删除旧 `validate-idea/tikhub.ts` 的失效请求实现，仅保留摘要器使用的数据类型；未改数据库迁移、RLS、RPC 或海外平台 schema。

### Verification

- 32 项 TikHub 客户端和渠道适配器测试通过；全量 Vitest 15 个测试文件、74 项测试通过。
- `npm run build`、`npx tsc --noEmit` 和全部目标 Edge Function 的 `deno check --no-lock --no-config` 通过。
- 全仓库检索未发现旧 XHS Web 搜索、旧抖音 Web 搜索、`sort=general` 或 `note_type=0` 调用。
- 官方 `https://api.tikhub.io/openapi.json` 实时核验确认版本 V5.3.2、XHS App V2 参数和抖音 V5 请求体；未做真实 Token 生产调用。

### Learnings

- 第三方付费 API 必须把请求次数、重试次数、限流和失败原因作为客户端级元数据，而不是散落在业务函数中。
- “HTTP 成功”不等于供应商业务成功；响应 envelope、数组字段和上游错误文本都需要显式校验。
- 翻页状态属于供应商协议，不应只传一个 page/cursor；适配器应保留统一模型，供应商细节集中在客户端。

### Boundary

- 本轮只修代码和测试，没有线上 Supabase schema、RLS、RPC 或数据批量操作；旧数据库问题仍需单独确认。
- TikTok、Instagram、YouTube、Reddit 等海外平台只完成 OpenAPI 方向核查，尚未接入业务适配器或报告字段。
- 真实 TikHub Token、额度、区域代理和生产 Edge Function 网络质量未在本地测试中验证。

## 2026-10-31｜皮肤系统与验证主链路统一优化

### Challenges

- 皮肤系统仍有三个页面使用旧 Toast，Report 核心数字没有统一数字字体，主要工具页的皮肤间距没有生效。
- 流式验证已经有稳定的渠道适配器，但主入口仍保留一套重复的 XHS/抖音抓取、分页和结果转换逻辑。

### Root Cause

- Toast、数字样式和间距只在部分页面接入，缺少一次全局收口。
- `validate-idea-stream` 历史上为了关键词变体和进度反馈直接拼接 TikHub 请求，后来适配器稳定后没有完成迁移。

### Solutions

- 将 PublicLandingPage、ScannerAuthDialog、ReferralCard 的旧 `useToast` 全部切换为 `useSkinToast`。
- 给 Validate、History、Discover、Report 主要容器接入 `section-breathe`，给 Report 的互动量、收藏、评论、质量分、样本量和平台数接入 `number-highlight`。
- 保留流式关键词变体和进度统计，把每个关键词的社媒抓取改为调用 `MultiChannelOrchestrator`，统一复用 XHS/抖音适配器和 TikHubClient，并保持旧报告 JSON 输出字段。
- 本轮不改数据库迁移、RLS、RPC，不接入海外平台。

### Verification

- 全量 Vitest 15 个测试文件、74 项测试通过。
- `npx tsc --noEmit`、主流式 Edge Function `deno check --no-lock --no-config` 和 `npm run build` 通过。
- 代码扫描确认业务页面不再直接引用旧 `useToast`；仅保留兼容 hook 导出文件。
- 已检查目标文件 `git diff --check`，无新增空白错误。

### Learnings

- 适配器层稳定后，主流程应尽快切换到适配器，避免供应商协议细节在流式入口重新复制。
- 皮肤规范只有在页面容器、数据展示和反馈组件同时接入时才会形成一致体验。

### Boundary

- 本轮未做浏览器截图回归，视觉效果以代码、构建和组件测试为依据。
- 海外平台适配器、报告平台选择和真实 TikHub 生产 Token 验证仍未完成。
