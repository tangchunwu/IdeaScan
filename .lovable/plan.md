

# IdeaScan 竞品对标优化计划

## 竞品分析发现

对比 ProductGapHunt 的报告页，IdeaScan 在以下方面存在明显差距：

### 1. ProductGapHunt 有而 IdeaScan 缺少的功能

| 功能 | ProductGapHunt | IdeaScan 现状 |
|------|---------------|--------------|
| **品牌名建议** | 基于想法生成 3 个品牌名 + 域名可用性检查 | 无 |
| **趋势关键词** | 展示高搜索量关键词 + Google Trends 嵌入 | 仅在数据洞察 Tab 中显示关键词 |
| **竞品市场份额** | 每个竞品显示估算市占率、营收模型、预估收入 | 仅展示搜索结果列表（标题+摘要） |
| **风险分析与缓解** | 结构化风险卡片（严重程度 + 缓解策略） | 风险只在 AI 分析中以文本罗列 |
| **变现策略建议** | 4 种变现模型 + 时间线 + 收入潜力评估 | 无 |
| **市场研究资讯** | 行业新闻、Indie Hacker 成功案例、Product Hunt 项目 | 无 |
| **LinkedIn 人脉推荐** | 相关行业人脉推荐 | 无 |

### 2. IdeaScan 的差异化优势（需保持）
- 小红书真实数据抓取
- 4 人 AI 辩论（创投圈）
- 中文市场深度定位
- 用户画像生成

## 改进计划（按优先级排序）

### Phase 1: 报告竞品分析升级（高优先级）

**目标**: 竞品 Tab 从"搜索结果列表"升级为"结构化竞品分析"

当前 `CompetitorTab.tsx` 仅展示原始搜索结果（标题+URL+摘要），信息价值低。

改进方案：
- 利用已有的 `competitor-extractor.ts` 提取的竞品数据，在前端展示结构化竞品卡片
- 每个竞品卡片显示：名称、类别、相关度、定价信息、用户评价摘要
- 增加"竞争格局总览"区域，显示竞品数量和竞争激烈度指标
- 保留原始搜索结果作为"数据来源"折叠区

技术要点：
- 修改 `CompetitorTab.tsx`，从 report 数据中读取 `competitor_names`（已由 `competitor-extractor.ts` 生成并存储）
- 新增结构化展示组件，分为"竞品概览"和"原始数据"两部分

### Phase 2: 风险分析结构化（高优先级）

**目标**: 将 AI 分析中的风险从文本列表变为结构化风险卡片

改进方案：
- 在报告主体区域（QuickInsightsCards 下方或 ActionRecommendation 附近）增加"风险与缓解"卡片
- 每个风险显示：标题、严重程度（Critical/High/Medium）、影响描述、缓解建议
- 数据来源：从 `aiAnalysis.weaknesses` 解析，或在 LLM prompt 中要求结构化输出

技术要点：
- 新建 `RiskMitigationCards.tsx` 组件
- 从 `aiAnalysis.weaknesses` 数组映射，按严重程度排序
- 参考 ProductGapHunt 的风险卡片样式（颜色编码 + 缓解策略）

### Phase 3: 变现策略模块（中优先级）

**目标**: 为用户提供具体可执行的变现路径建议

改进方案：
- 在 AI 分析 Tab 或报告主体区新增"变现策略"板块
- 展示 2-4 种变现模型（订阅制/按次付费/Freemium/B2B 授权等）
- 每种模型标注：实施时间线（短期/中期/长期）和收入潜力

技术要点：
- 扩展 LLM prompt 在 `validation-core.ts` 中，要求 AI 输出 `monetizationStrategies` 字段
- 新建 `MonetizationStrategies.tsx` 前端组件
- 对已有报告，可通过 re-analyze 功能补充

### Phase 4: 品牌名建议工具（中优先级）

**目标**: 基于用户想法自动生成品牌名建议

改进方案：
- 在报告页增加"品牌名建议"区域
- 生成 3 个 AI 推荐名称
- 每个名称提供域名检查链接（跳转到 Namecheap/GoDaddy 搜索）

技术要点：
- 可在 re-analyze 或报告生成时由 LLM 生成
- 域名检查使用外链方式（`https://www.namecheap.com/domains/registration/results/?domain=xxx`）

### Phase 5: 市场研究资讯聚合（低优先级）

**目标**: 展示与想法相关的行业新闻和成功案例

改进方案：
- 在竞品 Tab 或新增 Tab 中展示：相关行业新闻、类似产品的成功/失败案例
- 数据来源：搜索结果中筛选新闻类内容

技术要点：
- 从现有搜索结果中按 URL 域名分类（36kr/huxiu 为新闻，Product Hunt 为产品）
- 前端分组展示

## 实施顺序

1. **Phase 1 + 2**（一起做）：竞品分析升级 + 风险结构化 — 报告信息密度和可读性大幅提升
2. **Phase 3**：变现策略 — 增强"决策助手"定位
3. **Phase 4**：品牌名建议 — 增加趣味性和实用性
4. **Phase 5**：市场资讯 — 锦上添花

Phase 1+2 预计涉及修改：
- `src/components/report/CompetitorTab.tsx` — 结构化重写
- 新建 `src/components/report/RiskMitigationCards.tsx`
- `src/pages/Report.tsx` — 集成风险卡片
- `src/components/report/useReportData.ts` — 提取竞品结构化数据

