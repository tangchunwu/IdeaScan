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

### C. Phase 7: 狩猎雷达 (Idea Discovery)

> **Phase 7 数据库迁移**

- 文件: `supabase/migrations/20260127210000_add_hunter_discovery_tables.sql`
- 作用: 创建以下表:
  - `raw_market_signals` (原始市场信号，支持 pgvector 向量搜索)
  - `niche_opportunities` (聚合后的商业机会)
  - `scan_jobs` (定时扫描任务配置)

> **Phase 7 边缘函数部署**

```bash
# 1. 爬虫调度器 (定时抓取 Reddit/小红书)
supabase functions deploy crawler-scheduler --no-verify-jwt

# 2. AI 信号处理器 (分析并打分)
supabase functions deploy signal-processor --no-verify-jwt
```

> **Phase 7 环境变量** (Supabase Dashboard -> Edge Functions -> Secrets)

| 变量名 | 说明 | 必须 |
|--------|------|------|
| `TIKHUB_TOKEN` | 小红书爬虫凭证 | 是 (如果启用 XHS) |
| `DEEPSEEK_API_KEY` 或 `LOVABLE_API_KEY` | AI 分析用 | 是 |
| `LLM_BASE_URL` | 可选，默认使用 Lovable Gateway | 否 |
| `LLM_MODEL` | 可选，默认使用 `deepseek/deepseek-chat` | 否 |

> **使用方法**

1. 在 `scan_jobs` 表插入一条记录: `INSERT INTO scan_jobs (keywords, platforms)VALUES (ARRAY['宠物洗澡', '独立开发'], ARRAY['xiaohongshu', 'reddit']);`
2. 手动调用 `crawler-scheduler` 函数触发抓取。
3. 调用 `signal-processor` 函数对结果进行 AI 分析。
4. 查询 `SELECT * FROM raw_market_signals ORDER BY opportunity_score DESC LIMIT 20;` 查看高价值机会。

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

## 5. 🔬 竞品透视 (Competitor Spy) [新增核心]

**目标**: 解决 "核心分析缺失" 问题，通过商业逆向工程分析竞品如何赚钱。

**低成本实现方案 (Cost-Effective Strategy)**:
> ⚠️ **成本预警**: 深度爬虫 (Firecrawl) 和同时也 (Exa.ai) 成本较高。为控制单次分析成本 (<$0.1)，建议采用 "分层侦查" 策略。

- [ ] **Level 1: 免费/低成本侦查 (Metadata)**
  - 利用 `Tavily` (已集成) 的 Search Context，只提取 Title/Snippet，不抓取全文。
  - 分析: "它主打什么关键词？", "它的 Slogan 是什么？"
  - **成本**: 极低。

- [ ] **Level 2: 关键页定点爆破 (Key Page Scraping)**
  - 仅当用户**手动点击** "深度分析" 时才触发。
  - 只抓取 1 个核心页面：`/pricing` (价格页)。
  - **AI 推理**: 根据价格表推算其客单价 (AOV) 和目标客户 (Enterprise vs SMB)。
  - **技术**: 使用简单的 `fetch` + `cheerio` (轻量级爬虫) 替代昂贵的 Headless Browser，除非遇到强反爬。

- [ ] **Level 3: 商业模式画布 (Business Model Canvas)**
  - 将上述碎片信息投喂给 DeepSeek (高性价比模型)。
  - 输出:
    - **流量来源猜测**: "主要靠 SEO" vs "主要靠投放"。
    - **护城河分析**: "它是靠价格战" vs "它是靠独家数据"。

## 建议执行顺序

1. **对接真实 AI** (优先级最高，直接影响用户体验)
2. **竞品透视 (Level 1 & 2)** (补全核心分析能力)
3. **邮件通知** (商业闭环的关键)
4. **SEO 优化** (便于传播)
5. **高级主题** (锦上添花)
