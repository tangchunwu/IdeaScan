

# 报告页重复内容清理计划

## 发现的重复问题

### 1. 雷达图出现 3 次
- `RadarDimensionSection.tsx` — 主页面（Tab 之前）
- `OverviewTab.tsx` — "概览" Tab 内的 "多维度评分" 雷达
- `AIAnalysisTab.tsx` — "AI 点评" Tab 内的 "六维度深度评估" 雷达

**方案**: 删除 `OverviewTab` 和 `AIAnalysisTab` 中的雷达图，保留主页面的 `RadarDimensionSection`（已有展开交互，体验最好）。

### 2. 维度分析列表出现 2 次
- `RadarDimensionSection.tsx` — 可展开的维度卡片
- `AIAnalysisTab.tsx` — 维度分数 + 原因列表

**方案**: 删除 `AIAnalysisTab` 中的维度列表，只保留主页面的。

### 3. 评分展示出现 3 次
- `ScoreHeroCard` — 大圆环评分
- `QuickInsightsCards` — "需求真实度 XX/100"
- `ActionRecommendation` — 右上角大字评分 + 综合评分
- `DemandDecisionCard` — 巨大的分数展示

**方案**: 删除 `ActionRecommendation` 中的评分数字（保留 verdict 和行动建议）；删除 `DemandDecisionCard` 左侧的分数展示区（改为只显示 verdict 结论文字）。

### 4. 优势/劣势出现 3 次
- `AIAnalysisTab` — "核心投资亮点" + "关键风险与致命伤"（strengths/weaknesses 完整列表）
- `ActionRecommendation` — strengths.length / weaknesses.length 计数
- `RiskMitigationCards` — weaknesses 作为风险卡片再展示一遍

**方案**: `RiskMitigationCards` 只使用 `risks` 数据，不再接收 `weaknesses`；`ActionRecommendation` 保留计数但移除重复的行动步骤列表（与 AI Tab 的战略路线图重复）。

### 5. 风险列表出现 2 次
- `RiskMitigationCards.tsx` — 主页面的风险卡片
- `AIAnalysisTab.tsx` — "失败前瞻分析" section

**方案**: 删除 `AIAnalysisTab` 中的 "失败前瞻分析"，保留主页面的 `RiskMitigationCards`（已有展开缓解策略的交互）。

### 6. 趋势图在概览 Tab 重复
- `TrendTimelineChart` — "关键词热度趋势"
- `AreaChart` — "一周热度趋势"（同一数据源）

**方案**: 删除 `OverviewTab` 中的 `AreaChart`，只保留 `TrendTimelineChart`。

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `AIAnalysisTab.tsx` | 删除雷达图、维度列表、失败前瞻分析；只保留投资亮点/风险 + 战略路线图 |
| `OverviewTab.tsx` | 删除重复的雷达图和趋势 AreaChart |
| `ActionRecommendation.tsx` | 精简：移除分数展示和 nextSteps（与 AI Tab 路线图重复），聚焦 verdict + 行动按钮 |
| `DemandDecisionCard.tsx` | 精简左侧分数区域，改为结论文字为主 |
| `RiskMitigationCards.tsx` | 移除 weaknesses prop 依赖，只用 risks 数据 |
| `Report.tsx` | 更新 `RiskMitigationCards` 的 props 传递 |

共修改 6 个文件，纯删减重复内容，不增加新功能。

