

# IdeaScan 产品审视与改进计划

## 一、核心定位回顾

**产品定位**：在写第一行代码前，用真实数据验证创业想法是"真刚需"还是"伪需求"。

**核心价值链**：描述想法 → AI 全网调研 → 需求验证报告 → 行动决策

## 二、与竞品对比后的差距分析

参考 ProductGapHunt 等同类产品，IdeaScan 有独特优势（中文市场定位、小红书数据、AI 辩论），但在以下关键体验上存在明显差距：

### 问题 1：首页没有"即时体验"入口
**现状**：首页 Hero 区域只有"验证我的想法"按钮，点击后跳转到需要登录的 Validate 页面。新用户无法零摩擦感受产品价值。
**竞品做法**：ProductGapHunt 首页直接放置输入框，用户填写想法后才提示登录，转化路径更短。
**改进**：在首页 Hero 区添加内联输入框，用户输入想法后点击按钮带着参数跳转到 /validate 页面（或登录页）。

### 问题 2：缺少"样例报告"的强引导
**现状**：History 页面有 SampleReports 组件，但首页和 Validate 页没有引导。新用户不知道报告长什么样。
**竞品做法**：ProductGapHunt 首页有"View a sample report"链接，让用户在注册前就看到产品价值。
**改进**：在首页 Hero 下方加"查看示例报告"链接，直接跳转到一个预设的公开分享报告。

### 问题 3：报告页信息过载，核心结论不突出
**现状**：Report 页面同时展示 DemandDecisionCard（巨大的信息密度）、ScoreHeroCard、RadarDimensionSection、6 个 Tab。用户打开后被大量数据淹没，找不到"所以我该怎么做"。
**竞品做法**：ProductGapHunt 用 3 个清晰卡片（Competition Level / Market Potential / Revenue Potential）给出一目了然的结论。
**改进**：
- 简化 DemandDecisionCard，把成本明细等开发者信息移到 DevPanel
- 报告顶部增加"一句话结论"+ 3 个关键指标卡片（需求真实度 / 竞争激烈度 / 行动建议），类似 ProductGapHunt 的三卡片布局
- 将 ActionRecommendation 提升到更显眼位置

### 问题 4：Validate 页面认知负担重
**现状**：Validate 页面一次性展示：大文本框 + 灵感参考 + 目标赛道标签 + AI 推荐关键词 + 验证模式选择。对新用户来说信息太多。
**改进**：
- 默认折叠"目标赛道"区域，用"高级选项"展开
- 验证模式选择简化为默认深度模式，"快速模式"作为次要选项
- 减少视觉噪音，让核心动作（输入想法 → 点击验证）更突出

### 问题 5：首页缺少信任建设
**现状**：只有 SocialProofCounter 显示验证数量。没有用户评价、使用场景、或真实案例。
**改进**：添加 2-3 条精选用户评价/使用场景卡片（可以是真实反馈或代表性案例）。

### 问题 6：品牌名称不一致
**现状**：Navbar 显示"创意验证器 / Idea Validator"，Footer 是"IdeaScan"，Auth 页面是"需求验证器"。三个名字。
**改进**：统一为"IdeaScan"品牌，Navbar 副标题改为"需求验证"。

## 三、实施计划

### 批次 A：核心转化路径优化（最高优先级）
1. **首页内联输入框**：在 Hero 区域 CTA 按钮上方添加简洁输入框，输入后带参数跳转
2. **首页"查看示例报告"链接**：在 CTA 下方添加文字链接，指向预设的公开分享报告
3. **品牌名统一**：Navbar、Auth、Footer 统一使用"IdeaScan"

### 批次 B：报告页体验重构
4. **报告顶部三卡片**：在 ScoreHeroCard 下方添加 3 个一目了然的指标卡片（需求真实度 / 竞争激烈度 / 推荐行动）
5. **DemandDecisionCard 精简**：移除成本明细、token 统计等开发者信息到 DevPanel
6. **ActionRecommendation 提前**：从 Tab 内移到报告主体区域

### 批次 C：输入体验简化
7. **Validate 高级选项折叠**：标签选择区域默认折叠
8. **验证模式默认深度**：去掉模式选择 UI，深度模式为默认（可在设置中切换）

### 批次 D：信任与社交证明
9. **首页用户评价区**：添加 2-3 条评价卡片（在 Features 和 HowItWorks 之间）

### 技术要点
- 首页输入框：纯前端改动，`Index.tsx` 添加 state + 带 `?idea=` 参数跳转
- 示例报告：需要一个固定的 share_token 对应高质量报告
- 报告三卡片：新建 `QuickInsightsCards` 组件，从 aiAnalysis 和 marketAnalysis 提取数据
- DemandDecisionCard 精简：拆分为用户版和开发者版
- Validate 折叠：用 Collapsible 组件包裹标签区

