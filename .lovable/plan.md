# IdeaScan 改进计划

## 已完成 ✅

### P1: Discover 匿名用户开放
- 创建 `get_public_trending_topics` RPC 函数（security definer），绕过 RLS 返回 top 5 热点
- Discover 页面和 HotTrends 组件均支持匿名用户查看有限数据
- 匿名用户看到登录引导，点击验证时要求登录

### P1: 动态 SEO 标题
- 创建 `useDocumentTitle` hook，所有页面动态设置 `<title>`
- 覆盖页面：首页、验证、报告、历史、对比、发现、定价、FAQ

### P1: Validate.tsx 拆分重构
- 提取 `useValidationStream` hook（~190 行）处理 SSE 流、取消、进度
- 提取 `ValidationProgress` 组件（~130 行）展示验证进度 UI
- Validate.tsx 从 850 行精简至 ~310 行

### P2: UX 细节优化
- 移动端 Navbar 菜单增加"系统配置"入口
- SocialProofCounter 移除硬编码 +1280 偏移量，使用真实数据
- HotTrends 已有"发现更多趋势"CTA 引导到 Discover 页

## 待实施

### P0: 付费转化路径
- 提供平台共享 TikHub Token 配额
- 免费用户每月 3 次验证无需配置 Token

### P0: 报告公开分享链接
- 生成不需要登录的只读分享链接
- 包含 OG meta tags 用于社交平台预览卡片

### P2: 更多 UX 优化
- PDF 导出增加 loading 进度提示
- Report 页面移动端适配优化

### P3: 技术债务
- 统一 toast 通知（useToast vs sonner）
- Edge Function 错误信息友好化映射
