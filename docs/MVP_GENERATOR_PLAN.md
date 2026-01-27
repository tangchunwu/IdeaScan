# MVP 生成器功能补全计划 (Phase 6.5)

> **当前状态**: 核心链路已跑通 (DB -> Mock Edge Function -> Frontend)，但内容生成为 Mock，且无邮件通知。
> **目标**: 完成 "Core Deep Dive" 的剩余部分，实现真正的智能化和商业闭环。

## 0. 交接指南：配置新增架构 (Handover Guide)

> **给下一位开发者的特别说明**：
> Phase 6 新增了数据库表和边缘函数，在开始 Phase 6.5 之前，**必须**确保以下配置已同步到生产环境 (Supabase)：

### A. 数据库迁移 (Database)

请在 Supabase SQL Editor 中运行或通过 CLI 推送以下 Migration：

- 文件: `supabase/migrations/20260127070000_add_mvp_generator_tables.sql`
- 作用: 创建 `mvp_landing_pages` (落地页) 和 `mvp_leads` (线索) 表，并配置 RLS 策略。

### B. 边缘函数部署 (Edge Functions)

请部署生成器函数：

```bash
supabase functions deploy generate-mvp --no-verify-jwt
```

- **注意**: 目前该函数使用 Mock 数据，不需要额外的环境变量。
- **未来**: 一旦对接真实 AI，需要在 Supabase 后台配置 `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`。

---

## 1. 🤖 对接真实 AI (Real AI Integration)

**现状**: 即使 Idea 不同，生成的文案都是一样的模板。
**计划**:

- [ ] **Edge Function 改造**: 修改 `supabase/functions/generate-mvp/index.ts`。
- [ ] **Prompt 工程**: 设计专用 Prompt，将 `validation_report` (痛点/受众/竞品) 转化为高转化率的 Landing Page Copy。
  - *Input*: "SaaS, 痛点: 效率低, 受众: PM"
  - *Output*: Hero Title: "不再被繁琐流程困扰", Features: ["自动化工作流", "智能报表"]。
- [ ] **JSON 结构化输出**: 强制 LLM 返回标准 JSON 格式，并增加容错校验。

## 2. 📧 邮件通知服务 (Email Notifications)

**现状**: 用户填了邮箱也没反应，创建者也不知道有新线索。
**计划**:

- [ ] **服务选型**: 集成 **Resend** (推荐，开发者体验最好) 或 SendGrid。
- [ ] **新 Edge Function**: `send-welcome-email`。
- [ ] **双向通知**:
  - **To User**: "感谢加入 Waitlist！这是我们的产品路线图..." (增加信任感)。
  - **To Creator**: "恭喜！您获得了一个新潜在客户 [email]..." (即时反馈)。

## 3. 🎨 高级主题系统 (Advanced Theming)

**现状**: 只有基础的 Light/Dark 模式。
**计划**:

- [ ] **主题引擎**: 建立 `ThemeContext` 或 CSS Variable 注入机制。
- [ ] **预设高转化模版**:
  - `Tech Blue` (SaaS/工具类)
  - `Warm Orange` (社区/生活类)
  - `Minimal Black` (高端/设计类)
- [ ] **字体配对**: 根据主题自动切换字体 (Inter, Playfair, Roboto Mono)。

## 4. 🌏 SEO & 社交分享 (Social Sharing)

**现状**: 分享链接在微信/Twitter 显示默认标题，无吸引力。
**计划**:

- [ ] **动态 Meta**: 引入 `react-helmet-async`。
- [ ] **Open Graph**: 动态注入 `<meta property="og:title" content="{Generated Title}" />`。
- [ ] **缩略图**: (进阶) 使用 Edge Function 动态生成带有标题文字的 OG Image。

## 建议执行顺序

1. **对接真实 AI** (优先级最高，直接影响用户体验)
2. **邮件通知** (商业闭环的关键)
3. **SEO 优化** (便于传播)
4. **高级主题** (锦上添花)
