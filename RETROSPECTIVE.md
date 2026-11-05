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

## 2026-10-31｜海外社媒四平台灰度扩展与诊断

### Challenges

- TikHub 需要同时承载 TikTok、Instagram、YouTube、Reddit 四种不同的搜索和分页协议。
- 不能修改数据库表结构，但海外结果需要进入历史报告并且不能影响国内评分。
- 真实 Token 验证必须由用户在站内触发，不能写入日志或自动消耗业务配额。

### Root Cause

- 现有渠道注册表只有小红书和抖音，客户端没有海外平台的统一分页返回模型。
- 报告读取链路只识别国内 `xiaohongshu_data`，没有独立的海外 JSON 区块。

### Solutions

- 扩展统一 TikHub 客户端和 ChannelAdapter，接入四个平台官方搜索/评论接口、分页透传、样本上限和请求统计。
- 使用现有 `validation_reports.data_summary` JSON 保存 `overseasSocialData`，不新增表、列、迁移、RLS 或 RPC。
- 增加服务端 `ENABLE_OVERSEAS_SOCIAL=true` 灰度开关，默认关闭；海外数据单独展示，不参与评分。
- 设置页增加海外平台诊断，先验证 Token，再逐个平台执行最小采集，展示状态、耗时和请求次数。

### Verification

- 海外客户端和适配器定向测试通过；全量 Vitest 18 个测试文件、92 项测试通过。
- `npx tsc --noEmit`、相关 Edge Function `deno check --no-lock --no-config` 和 `npm run build` 通过。
- `git diff` 检查确认没有数据库迁移或 `supabase/config.toml` 改动。
- 真实 TikHub Token 尚未执行线上诊断，当前只验证 mock 合同和灰度关闭代码路径。

### Learnings

- 多平台扩展应先统一供应商分页和错误合同，再让适配器只负责平台字段映射。
- 没有 schema 迁移时，可以复用已有 JSON 报告字段，但必须明确版本、平台状态和不参与评分的边界。

### Boundary

- 默认环境变量未开启时，验证流程不会调用海外平台。
- 普通设置页没有开放平台选择；当前诊断按钮只验证用户主动配置的 Token。
- 线上额度、区域可用性、TikHub 实际返回字段和生产网络质量仍需用户执行站内诊断确认。

## 2026-10-31｜国内外平台统一选择与综合评分

### Challenges

- 海外平台最初只作为独立证据展示，不能满足用户希望按平台选择并与国内数据共同评分的产品目标。
- 验证页、前端请求、Edge Function 和 AI 分析输入需要保持同一组选中平台。

### Root Cause

- 原验证请求只传小红书/抖音开关，海外平台仅写入独立 JSON，没有进入统一 `socialData`。

### Solutions

- 验证页新增国内和海外平台选择器，选择结果通过 `selectedPlatforms -> overseasPlatforms` 传入验证流。
- 海外帖子和评论转换为现有统一社会数据格式，在 AI 分析前与国内样本合并，因此共同参与评分。
- 报告继续保留 `overseasSocialData` 平台拆分区块，同时明确展示综合评分结果。
- 诊断和灰度入口保留；未修改数据库表、RLS、RPC。

### Verification

- 全量 Vitest 18 个测试文件、92 项测试通过。
- `npx tsc --noEmit`、相关 Deno check 和 `npm run build` 通过。
- 新增平台选择请求断言和海外样本转换测试。

### Learnings

- “平台可选”和“平台参与评分”必须同时贯穿 UI、请求配置、采集、归一化和 AI 输入，不能只在报告层拼接展示。

### Boundary

- 真实 TikHub Token 和生产平台返回仍需在设置页诊断；当前代码测试使用 mock。
- 海外平台选择需要用户配置 TikHub Token；未选择的平台不会发起请求。

## 2026-11-02｜全球商机雷达首期原生集成

### Challenges

- 旧单用户 MVP 以人工记录为主，不能直接作为正式产品的自动需求发现入口。
- 新研究链路需复用六平台与皮肤，同时不能更改数据库或让模型伪造引用。

### Root Cause

- 研究链接、人工评分与自主采集不是同一能力；原 MVP 也缺少宿主登录与账号边界。
- 分享参数可将同一原帖伪装为多个来源；单实例冷却不等于跨实例公共预算保护。

### Solutions

- 新增 `/opportunity-radar` 原生页面、严格鉴权的 `opportunity-discover` 函数、需求意图检索与基于来源 ID 的候选分析。
- 每个候选至少引用两条独立原文；按平台原帖规范路由去重，合并评论上下文，证据不足明确少返回或空结果。
- 结果仅留页面内存并可导出白名单 JSON；账号切换清除表单及结果，取消和卸载屏蔽迟到响应。
- 跳转验证预填市场、行业、平台与标签，并遵守现有 500 字限制；全网候选明确提示补选评分所需社媒。
- 默认使用用户自带密钥，公共服务端密钥回退必须显式启用；模型域名白名单、禁止重定向与有限请求预算降低越权和成本风险。

### Verification

- 全量 Vitest 26 文件、192 项通过；新模块 ESLint、Deno check 和生产构建通过。
- 实测 1440px 与 390px 的未登录页面，单一 H1、noindex、平台选择与移动端无横向溢出，浏览器无控制台错误。
- 根 `tsc --noEmit` 通过，但实际应用项目检查仍有既有两处错误：ScannerAuthDialog 未定义 toast、海外适配器测试类型自引用；未修改无关代码。

### Learnings

- 保留帖子 ID 或分享 URL 不足以保证证据独立性，应分离展示 URL 与原文去重键。
- 登录边界必须同时清理结果、输入、配置引用与迟到请求，不能只隐藏结果卡片。
- 不改数据库时可交付只读研究闭环，但不能宣称已有持久机会库或分布式任务/额度系统。

### Boundary

- 未改表、迁移、RLS、RPC，未部署、提交、推送或调用真实付费 API；原有未提交文件保持不动。
- 线上供应商返回、区域可用性、真实需求相关性和付费意愿未验收；证据片段不等于结论已证实。
- 定时监控、机会库、异步持久任务与全局预算不在首期，开放公共密钥前必须补齐网关预算保护。

## 2026-11-02｜IdeaScan｜TikHub 真实响应映射与脱敏诊断修复

### Challenges

- mock 响应下的海外适配器测试通过，但真实 TikHub 返回的 TikTok、Reddit、YouTube 包装字段不同，导致有效帖子被丢弃或指标变成 0。
- 诊断原先只保留 HTTP 状态，业务错误、网络失败和超时被混成同一类，设置页也无法安全展示旧版/新版响应差异。

### Root Cause

- TikTok 真实结果在 `search_item_list[].aweme_info`，Reddit 使用 `children[].post` / `comment`，YouTube 使用 `video_id`、`description_snippet`、`view_count` 等清洗字段；旧映射只覆盖了 mock 形状。
- TikHub client 丢弃上游错误摘要，固定 30 秒下限和 408 包装掩盖了真实失败类型；诊断没有共享请求预算和分阶段状态。

### Solutions

- 修复 TikTok 搜索项、cursor 分页、Reddit t3/t1 身份和父帖绑定、YouTube 清洗字段/计数/绝对时间解析，并增加真实响应形状回归测试。
- TikHubError 增加脱敏后的 HTTP 状态、业务码、请求 ID、错误类型和路径；区分 HTTP、业务、网络、超时、无效响应和预算终止，不保留完整上游 body。
- 新增六平台有界诊断：一次鉴权，每个平台最多一次搜索和一次评论探测，最多 13 次请求、单请求 8 秒、总计时 55 秒，401/402/403/422 或额度类失败停止后续付费请求。
- 设置页支持单平台/六平台诊断、分阶段搜索与评论结果、调用数和安全错误摘要；旧版 flat 响应只提示先部署新版函数，不读取未定义字段。

### Verification

- 全量 Vitest 30 个文件、233 项通过；`tsc --noEmit`、应用项目类型检查、相关 Edge Function `deno check`、`npm run build` 和 `git diff --check` 通过。
- 使用聊天中暴露的旧 Token 做一次有限真实诊断：鉴权成功；TikTok、小红书、YouTube 搜索和评论通过；Instagram HTTP 400；Reddit、抖音搜索通过但评论响应契约仍不匹配，已显示为 `invalid_response`，没有伪报成功。
- 未通过浏览器设置页复用登录会话完成点击验收，真实探测使用同一诊断逻辑的本地 CLI；未部署本轮修改、未提交推送、未修改数据库。
- 追加的失败结构探测仅尝试一次鉴权，未通过后停止，没有继续请求平台或取得新的评论响应正文。

### Learnings

- 供应商适配测试必须包含官方清洗响应和原始包装响应，不能只用自定义理想 fixture。
- “Token 鉴权成功”与“某平台搜索/评论成功”必须拆成独立阶段；HTTP 200 不代表业务数据契约正确。
- 诊断工具要共享物理请求预算和总 deadline，错误摘要只返回白名单字段，不能用异常 `instanceof` 丢失普通对象错误。

### Boundary

- Reddit 和抖音评论的真实响应包装仍需依据新的线上样本继续补充映射；Instagram 400 的具体上游原因因旧 client 未保留正文，尚不能归因于 Token、权限或额度。
- 旧 Token 已在聊天中暴露，必须撤销并重新生成；本轮没有保存或写入该 Token。
- 共享模块不能单独部署；上线需重新部署引用它们的 `verify-config`、`opportunity-discover`、`validate-idea`、`validate-idea-stream`，并发布前端。未部署前线上设置页不会包含本轮修复。

## 2026-11-02｜IdeaScan｜TikHub Reddit 评论树与抖音评论包装修复

### Challenges

- Reddit 搜索已成功，但评论诊断报 `missing comments`；抖音搜索成功，评论返回也不能直接按单一 `comments` 字段解析。

### Root Cause

- TikHub Reddit 评论清洗响应使用 `data.postInfoById.commentForest.trees[].node`，分页游标在 `commentForest.pageInfo.endCursor`，不是顶层 `comments`。
- 抖音评论客户端只接受 `comments`，没有覆盖已知的 `comment_list`、`commentList` 和 `items` 包装。

### Solutions

- Reddit 客户端解析 comment forest 节点并保留 `endCursor`，适配器继续用真实 `t1_` 评论 ID 绑定 `t3_` 父帖。
- 抖音评论扩展为有限已知数组字段递归解析；未知结构仍返回 invalid response，不把错误当空评论。
- 新增官方清洗响应形状的 Reddit 评论树和抖音 comment-list 回归测试。

### Verification

- 全量 Vitest 30 个文件、235 项通过；应用 TypeScript、相关 Deno check、生产构建和 diff check 通过。
- 真实 Reddit 评论响应已确认 `commentForest` 结构；真实抖音评论本次未继续增加请求，保留线上失败状态边界。

### Learnings

- 社媒接口的搜索结果和评论结果常用不同清洗模型，必须分别建立响应契约和测试。
- 评论数量为零、接口返回空数组和响应结构未知是三个不同状态，诊断和评分输入不能合并处理。

### Boundary

- Instagram HTTP 400 的上游具体原因仍未确认；没有完整错误正文时不归因于 Token 或权限。
- 本轮只修改本地代码和测试，未部署、提交或推送；数据库、RLS、RPC 未改。

## 2026-11-04｜IdeaScan｜海外信源扩充至 X 与 Threads

### Challenges

- IdeaScan 已接入 TikTok、Instagram、YouTube、Reddit，但海外需求发现仍缺少文本讨论密集的 X 与 Threads。
- 新平台需要同时贯穿 TikHub 客户端、统一适配器、验证页、商机雷达、诊断页、路由回填和报告结构，不能只增加两个按钮。

### Hypotheses

- 如果 TikHub 官方接口提供稳定的关键词搜索和评论入口，那么 X 与 Threads 可以先以统一帖子/评论模型接入，不需要新增数据库表。
- 如果平台选择已经写入验证 URL，那么路由白名单和诊断请求预算必须同步扩展，否则用户选择会在跳转或诊断中丢失。

### Root Cause

- 共享渠道注册表、海外平台枚举和前端展示只覆盖四个海外平台；X/Threads 没有客户端方法、适配器或安全原帖链接生成规则。
- 路由平台白名单仍是旧六平台，诊断请求预算仍按鉴权加六个平台的 13 次计算。

### Solutions

- 新增 `TwitterAdapter` 与 `ThreadsAdapter`，以及 TikHub 搜索/评论客户端方法；按统一 `UnifiedPost`、`UnifiedComment` 输出，并保留请求统计与失败状态。
- 将 X/Threads 加入渠道注册表、海外数据、商机雷达、验证页、报告卡、诊断面板和安全原帖 URL 生成；不修改数据库、迁移、RLS 或 RPC。
- 将验证路由白名单扩展到八个平台；诊断预算改为鉴权 1 次加八个平台各搜索/评论 1 次，共 17 次，并补充八平台回归测试。
- 依据 TikHub 官方文档核对参数：X 使用 `keyword/search_type/cursor`，Threads 使用 `query`；Threads 评论的 `end_cursor` 仅作兼容参数，文档明确无分页。

### Verification

- 全量 Vitest：30 个测试文件、242 项测试全部通过。
- `npx tsc --noEmit`、应用项目 TypeScript 检查、`npm run build`、`git diff --check` 通过。
- 生产构建成功生成验证页与商机雷达页；构建仍有历史 chunk size 和 Browserslist 提示，不影响本次功能。
- 官方文档实时核对通过；未使用聊天中暴露的旧 TikHub Token 做新的付费生产调用，真实账号额度、区域和平台权限仍需在部署后从诊断页确认。

### Learnings

- 新增一个社媒平台必须同步检查：客户端协议、适配器注册、统一类型、URL 安全规则、评分输入、前端选择、路由白名单和诊断预算。
- 诊断次数应由平台集合推导或至少与 UI 文案同源，不能只改平台列表而保留旧的固定请求上限。
- 官方文档的“无分页”说明应保留在客户端边界内，避免为了统一接口而虚构可用的翻页能力。

### Boundary

- 本轮未部署、提交或推送；未修改数据库、RLS、RPC，也未做真实 X/Threads 付费调用。
- 全仓库 ESLint 仍有历史 `no-explicit-any` 问题；本轮以测试、TypeScript、构建和 diff 检查作为验收依据。

## 2026-11-04｜IdeaScan｜需求验证与优质需求发现质量审查

### Challenges

- 用户希望打磨需求验证和寻找优质需求两个模块，需要从当前实现判断优化优先级，尤其是海外、有趣、具有地域场景的小软件机会。
- 采集成功、报告完整与商业结论有证据支撑是不同验收标准。

### Hypotheses

- 如果评论已经参与需求分析，那么相反的评论语义应改变结论；检查发现正常摘要只处理帖子和竞品，评论原文没有进入最终评分 prompt。
- 如果降级逻辑只说明证据不足，那么娱乐评论和空报告不应产生强需求标签或确定趋势；离线函数调用证明当前存在数量计分和默认数据补齐。

### Root Cause

- 验证流将帖子/竞品摘要作为主要评分上下文，评论采集与评论分析之间存在断点。
- 规则降级按样本数计分，前端再按分数判断真实需求；数据层对缺失趋势、情感、市场信息使用固定默认值，混淆未知与已测量。
- 雷达主要单轮检索与一次模型提炼；市场语言、付费复核、反证和证据交接没有统一为完整研究档案。

### Solutions

- 交付 `docs/需求验证与优质需求发现优化建议-20261104.md`，列明源码依据、离线复现、产品方案、实施顺序和验收标准。
- 建议 P0 修复评论分析、缺失值、降级判定、采集部分结果和平台 ID/去重；P1 补本地语言查询、需求信号聚类、付费与反证；P2 统一带证据的研究记录和行为验证闭环。
- 保留情绪、仪式、关系与趣味价值，不把所有优质小应用都限定为效率 SaaS。

### Verification

- 离线运行当前函数：模型失败时，40 帖、12 条娱乐评论和 5 条网页可返回 78 分；零样本仍返回 35 分及固定情感比例。
- 空报告读取函数产生固定周趋势和默认市场判断；同一 X 原帖的 x.com/twitter.com 链接在当前去重键中不同。
- 本轮未改业务代码、未运行新增付费调用、未部署或推送。线上 RPC、真实数据分布、地域覆盖和转化表现未验收。

### Learnings

- 评论是否展示、是否采集和是否参与结论计算应分别检查，不能互相替代。
- 渠道适配器测试通过不能证明研究结论可信；应增加证据不足、娱乐互动、矛盾评论、失败降级和地域错配的语义验收。
- 优质机会应同时说明支持证据、反证、最大未知和下一步实验，研究分数不能冒充真实付款证明。

## 2026-11-04｜IdeaScan｜需求验证与商机雷达证据闭环优化实施

### Challenges

- 将质量审查落到两个实际模块：评论需要进入分析，报告不能以默认数字补未知，海外检索需要市场语境，雷达证据需要安全交接和跨会话保存。
- 取消后续跑会让旧异步任务继续写入；新研究切换时，迟到的保存响应也可能把旧档案绑定到新结果。

### Hypotheses

- 把原文、引用、推断和未知分层后，应能通过相反评论、广告/娱乐、空响应、孤立评论和失败降级样本区分研究建议与证据不足。
- 只检查 processing 不足以隔离旧任务；每轮运行标识配合数据库行锁，应拒绝取消后的旧写入与续跑前一轮的回写。
- 研究存储增加 owner RLS、JSON 白名单和乐观并发后，应能保存材料且不泄露 API 配置、不跨账号展示。

### Root Cause

- 原链路在摘要时丢失评论、按样本数降级计分，前端再把高分解释为真实需求；默认数字掩盖了缺失值。
- 多处报告写入缺少统一事务与运行代际，单纯前端取消无法阻止迟到写入；研究回填也只有文字条件，没有原文档案。
- 单轮通用查询没有按语言和意图组织，模型输出缺少逐字引用、反证与最小实验门禁。

### Solutions

- 统一稳定证据池、父帖评论、支持/反证/未知、合法模型结构、null 失败状态、实际样本统计和 HTML/PDF 报告；历史报告保留旧版边界。
- 增加本地场景查询、趣味机会类型、逐字信号抽取、有界两阶段复核与查询记录；部分采集失败保留原文并显式透传。
- 新增私有研究档案、恢复/对比/继续补证、手工观察结果和按账号服务端证据交接；记录购买反馈为 self_reported。
- 增加每轮运行标识和 service-role 专属事务写入 RPC；断点、取消和终态共用锁与版本校验，失败先存断点再条件修改状态。

### Verification

- 全量 Vitest 40 文件、312 项通过；应用 TypeScript、三目标函数 Deno check、生产构建、关键新增文件 ESLint 与 diff check 通过。
- 隔离 PGlite 执行三份研究迁移，25 项 RLS、CAS、旧运行拒写、取消/续跑、报告唯一写入和版本字段行为检查通过。
- 未登录浏览器页面：单一 H1，八平台、机会类型与语言入口正确；390px 无横向溢出、控制台无错误。
- 已观察关键回归 RED→GREEN；未调用付费供应商、未执行真实登录态完整链路、未改线上数据库、未部署或推送。

### Learnings

- 引用 ID 合法不等于引用能证明主张，需同时检查原文类型、父帖身份和反证；孤立评论不能靠内容 hash 变成多个独立来源。
- 完成状态必须验证模型合同，不能因系统自动补出的未知项就认为模型完成；情感比例需用非负总和守恒的分配方式。
- 异步工作要同时隔离账号、研究结果和运行轮次；涉及取消/恢复的数据库写入应采用同一锁顺序和事务入口。
- 完整采集数据与模型上下文预算必须分开保存；数据库迁移、后端函数、前端需要按依赖顺序发布。

## 2026-11-04｜IdeaScan｜公开仓库完整历史密钥审计

### Challenges

- 用户需要确认公开仓库是否暴露 API 或数据库密钥；原工作区是浅克隆，不能据此判断早期提交和其他分支。
- Supabase anon 客户端 key 会被通用 JWT 规则命中，必须按角色区别于 service_role 和数据库密码。

### Hypotheses

- 若凭据只从 main 删除，其他公开分支和历史归档仍可能包含；使用隔离完整镜像和 ZIP 内容交叉检查。
- 若 JWT 是浏览器公开配置，其 payload.role 应为 anon；本地解码核对角色，不请求生产数据库。

### Root Cause

- 早期导入的第三方参考项目 .env.example 存在一个疑似 TikHub Token 字面量，历史 ZIP 含同一值。main 已无该文件，但五个旧分支仍有文件，四个还保留 ZIP；归属和有效性不能静态确认。
- 其余 Gitleaks JWT 命中均为 anon 客户端 key；本轮未发现 OpenAI 私钥、Supabase 服务端密钥或数据库密码。

### Solutions

- 获取六分支、零标签、1757 提交的完整镜像，使用官方校验通过的 Gitleaks v8.30.1 和脱敏补查，覆盖全部 blob/commit 对象及历史 ZIP。
- 仅保存路径、行号、类型、角色、指纹和结论，完整 Token 不进入报告、聊天或复盘。
- 建议若旧 Token 属于用户，先在供应商控制台撤销；清理应覆盖旧分支、ZIP 和历史，需另行明确执行范围。

### Verification

- 审计 main：4eddd93a34704614591987a076d5158b6a5cb2c2；GitHub 未鉴权查询确认 public，无公开 Release 或 PR。
- 补查 4549 个 blob/commit 对象约54MB，解包一个57条目的ZIP；Gitleaks六项命中经分类为五项anon JWT和一项历史疑似Token。
- 聊天中此前 TikHub Token 的短前缀未在 Git 对象中匹配；未测试任何 Token 有效性或线上 RLS，未访问实际用户数据。
- 本轮未删除分支、改写历史、推送清理或修改仓库可见性；审计报告保存在工作区 outputs，复盘仅本地记录。

### Learnings

- 公开仓库凭据审计必须先检查浅克隆状态，再覆盖全部可获取分支、历史与压缩包，不能只扫描最近改动。
- 扫描器命中只是候选：JWT应解析角色，通用token规则需排除源码引用、测试值和占位符，疑似真实值仍要区分归属与有效性。
- anon/publishable key 公开不等于数据库管理员密钥暴露；实际数据权限仍需独立 RLS 验收。

## 2026-11-04｜IdeaScan｜旧研究出口统一状态门禁

### Challenges

- 新版报告已经使用 `analysisStatus`、`decision` 和证据边界，但分享、热点回填、讨论生成和周报仍有旧的 `overall_score || 0/50` 或固定情感比例。
- 如果只改主报告，用户会在不同入口看到相互矛盾的研究结论。

### Hypotheses

- 只允许 `analysisStatus=complete` 且 decision 不是 `insufficient` 的报告参加排名、公开分享分数和周报汇总，可以阻止未完成研究被放大。
- 重新分析入口若不读取新证据合同，可能用旧摘要补出不受追溯的结论，应拒绝对新 incomplete 报告走旧补全路径。

### Root Cause

- 旧入口把数据库中的 `overall_score` 当作统一真相，没有结合 `ai_analysis` 和 `data_summary` 的研究状态。
- `SharedReport`、OG 分享、`discover-topics`、`generate-discussion` 和 `weekly-digest` 各自有默认值和旧评分路径。

### Solutions

- 新增 `_shared/analysis-status.ts`，统一解析 `complete/incomplete/legacy/unknown`，并提供可排名分数门禁。
- 公开分享、热点回填、讨论生成和周报改为只消费完整且可执行判断的研究；缺失状态不补 0、50 或 33%，重新分析对新 incomplete 报告返回继续验证提示。
- 公开分享页同步传递研究状态和判断，Lovable 更新说明增加五个旧出口函数的部署清单。

### Verification

- 新增状态门禁测试通过；报告真值与导出测试 16 项通过。
- `npx tsc --noEmit -p tsconfig.app.json` 通过；五个旧出口函数 Deno check 通过；`git diff --check` 通过。
- 全量 40 个测试文件、314 项回归通过；本阶段没有线上部署、真实分享链接或付费 API 验收。

### Learnings

- 研究可信度是跨入口合同，公开分享、周报和增长页面也必须遵守同一证据状态。
- 旧函数不一定需要立刻删除，但必须明确它们能否消费新版报告；不能让兼容路径静默降低证据门槛。

## 2026-11-04｜IdeaScan｜研究缺口与版本链优化

### Challenges

- 证据状态已经统一，但用户仍需要知道候选下一步缺什么，以及补证后结论为什么变化。
- 研究档案原先只保存结果快照，补证容易覆盖原始研究，无法比较版本差异。

### Hypotheses

- 将独立来源、直接经历、反证、付款信号、地域匹配和实验拆成缺口，能让“下一步继续研究”变成具体动作。
- 用父版本、版本号和变化说明保存补证，能保留原始判断并支持比较，而不是静默替换。

### Root Cause

- 候选只有一段建议文本，没有结构化的缺口集合；研究保存没有版本链字段。

### Solutions

- 新增 `researchGaps.ts`，在候选卡展示按优先级排序的证据缺口和行动建议。
- 新增 `researchVersion.ts` 与第三份研究版本迁移；补证结果携带 `parentResearchId`，保存时生成下一版本，研究库展示版本号和变化说明。

### Verification

- 缺口、版本和研究库回归测试通过；应用 TypeScript 通过，`git diff --check` 通过。
- 本轮未部署新迁移、未调用付费 API、未执行真实用户研究；旧报告和历史档案需要迁移后再验证版本字段。

### Learnings

- “继续研究”必须告诉用户缺什么，以及补什么会改变判断；单独显示一个继续按钮不够。
- 研究结果应不可变保存，补证生成新版本，避免覆盖原始证据和当时的决策依据。

## 2026-11-04｜IdeaScan｜证据缺口与研究版本链优化实施

### Challenges

- 研究候选已经能保存和补证，但用户仍难以知道下一步缺少什么；补证保存也会覆盖或混淆原研究版本。
- 版本字段需要同步 Supabase SQL、Drizzle 迁移、前端类型和研究服务，不能只加 UI 标记。

### Hypotheses

- 将独立来源、直接经历、反证、付款、地域和实验拆成结构化缺口，能让用户直接行动，而不是重新猜测研究方向。
- 以父版本生成新研究记录，可以保留原判断、支持比较，并让补证后的结论有沿袭关系。

### Root Cause

- 候选之前只有支持/反证文本，没有统一的缺口计算；研究档案只有单一快照，没有版本链。

### Solutions

- 新增 `researchGaps.ts`，候选卡展示缺口原因、优先级和具体行动。
- 新增 `researchVersion.ts` 和 `20261104100000_research_session_versions.sql`，研究保存携带 `parentResearchId`，档案展示版本号与变化说明。
- 同步 Supabase 类型、Drizzle 迁移日志和 Lovable 更新说明。

### Verification

- 全量 Vitest 43 个测试文件、319 项通过。
- 应用 TypeScript、生产构建、`git diff --check` 通过。
- 隔离 PGlite 执行三份迁移，25 项 RLS、CAS、运行代际、取消/续跑和版本字段检查通过。
- 未部署新迁移、未调用付费 API、未执行真实用户研究；研究库组件测试出现 React act 警告，但无测试失败。

### Learnings

- 研究缺口要用用户可执行的动作表达：补来源、补反证、补报价、补当地语言或做最小实验。
- 研究档案应追加版本而不是覆盖原始结果，父版本 ID 是比较和审计的最小连接。

## 2026-11-05｜IdeaScan｜工具型与娱乐型需求研究适配

### Challenges

- 用户指出工具类和娱乐类产品的需求表现、收费逻辑不同；继续使用“抱怨、节省时间、减少损失”作为统一标准，会漏掉复玩和情绪价值。

### Hypotheses

- 明确 `utility` 与 `entertainment` 价值模型后，检索意图和下一步实验应产生差异：前者看损失和替代，后者看复玩、分享、身份、付费触发和新鲜感衰减。

### Root Cause

- 商机雷达虽然已有 ritual/hobby 等机会类型，但没有单独的价值模型；娱乐查询仍可能使用工具式痛点词，候选缺口也只提醒付款和用户经历。

### Solutions

- 增加价值类型选择并写入市场上下文与验证交接。
- 娱乐型市场查询新增 repeat_use、sharing、payment、novelty_decay；工具型继续使用 experience、payment、alternative、counter。
- 娱乐候选缺口增加新鲜感衰减和 7 天复玩/分享实验，提示低价主题包、会员、虚拟物品、季票等变现方向由用户验证，禁止按工具 ROI 直接估价。

### Verification

- 市场上下文、雷达合同和验证交接定向测试通过；Deno check 与应用 TypeScript 通过。
- 当前定向 28 项测试通过；全量回归尚待完成。本轮未调用付费 API、未部署线上函数。

### Learnings

- 工具类找“未解决的问题”，娱乐类找“被反复追求的体验”；两个模型应共享证据规则，但不能共享同一套查询和收费判断。
