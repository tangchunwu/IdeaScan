

# 报告页布局优化方案

## 当前问题

截图展示的页面在 Tab 之前堆叠了 **9 个独立区块**，用户需要大量滚动才能看到 Tab 内容：

```text
QuickInsightsCards (3卡片)
ScoreHeroCard (4col) + PersonaCard (8col)
ActionRecommendation (2/3) + DataConfidenceCard (1/3)
RadarDimensionSection
[needsReanalysis banner]
RiskMitigationCards
MonetizationStrategies
BrandNameSuggestions
DemandDecisionCard
──── Tabs ────
```

**核心问题：Tab 之前内容太多，页面过长。**

## 优化方案

### 1. 将 3 个独立区块移入 AI 点评 Tab
- **RiskMitigationCards**、**MonetizationStrategies**、**BrandNameSuggestions** 都是 AI 生成的深度分析内容
- 移入 `AIAnalysisTab` 中，排在"战略路线图"后面
- 主页面减少 3 个大区块

### 2. 将 DemandDecisionCard 移入数据概览 Tab
- DemandDecisionCard 包含证据溯源和数据统计，属于"数据层"内容
- 移入 `DataOverviewTab` 顶部，作为数据概览的开篇总结

### 3. 精简 ScoreHeroCard 高度
- 减少 `min-h` 从 280/320px 到 240/280px
- 缩小内部间距（mb-6 → mb-4, mt-8 → mt-5）

### 4. 精简 ActionRecommendation
- 删除"决策置信度"进度条（QuickInsightsCards 的行动建议卡片已有同样信息）
- 只保留 verdict 标题 + 行动按钮，更紧凑

### 优化后主页面结构
```text
QuickInsightsCards (3卡片)
ScoreHeroCard (4col) + PersonaCard (8col)
ActionRecommendation (2/3, 更紧凑) + DataConfidenceCard (1/3)
RadarDimensionSection
──── Tabs ────
```

Tab 之前从 9 个区块减少到 4 个，滚动量减半。

## 文件清单

| 文件 | 改动 |
|------|------|
| `Report.tsx` | 删除 RiskMitigationCards/MonetizationStrategies/BrandNameSuggestions/DemandDecisionCard 的独立渲染，改为通过 props 传入 Tab |
| `AIAnalysisTab.tsx` | 底部新增 RiskMitigationCards + MonetizationStrategies + BrandNameSuggestions |
| `DataOverviewTab.tsx` | 顶部新增 DemandDecisionCard |
| `ScoreHeroCard.tsx` | 减小最小高度和内部间距 |
| `ActionRecommendation.tsx` | 删除决策置信度进度条 |

5 个文件改动，纯布局调整。

