# RETROSPECTIVE

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
