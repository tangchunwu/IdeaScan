

# 报告页精简与优化方案

## 截图中的问题分析

截图展示的是「市场分析」Tab，存在以下问题：
- **"趋势方向"** 只显示两个字"趋势平稳"，信息密度极低
- **"热度评级"** 硬编码为"高"，没有实际数据支撑
- **"目标用户画像"** 和 **"竞争程度"** 在页面其他 3 个位置重复出现
- **"热门关键词"** 经常为空，占大块空间

## 全页面仍存在的重复

| 数据 | 出现位置 | 保留 |
|------|----------|------|
| 竞争分析 | QuickInsightsCards + DemandDecisionCard + MarketTab | QuickInsightsCards（摘要）+ MarketTab（详情） |
| 目标用户 | OverviewTab 关键指标 + DemandDecisionCard + MarketTab | MarketTab |
| 行动建议/Verdict | QuickInsightsCards + ActionRecommendation + DemandDecisionCard | QuickInsightsCards（摘要）+ ActionRecommendation（按钮） |
| 情感分布 | SentimentTab 饼图 + SentimentTab 柱状图 | 饼图（删柱状图，同数据两种图没必要） |

## 改动方案

### 1. MarketTab — 精简卡片，合并关键词
- 删除"趋势方向"和"热度评级"两张空洞卡片
- 保留"市场规模"和"竞争程度"，改为横向双列布局
- 将"热门关键词"合并到"目标用户画像"卡片下方，减少一个独立区块

### 2. OverviewTab — 删除重复指标
- 从"关键指标"列表中删除"目标用户"（MarketTab 已有完整版）

### 3. DemandDecisionCard — 去除重复区块
- 删除"竞品拥挤度分析"区块（QuickInsightsCards + MarketTab 已覆盖）
- 删除"目标用户"+"核心痛点"双卡（MarketTab + AIAnalysisTab 已覆盖）
- 保留：verdict header + stats row + 两个 verdict 引言 + evidence 部分

### 4. ActionRecommendation — 删除重复统计
- 删除中间的"核心优势/关键风险/用户好评率"统计行（QuickInsightsCards 已展示）
- 保留：verdict 标题 + 决策置信度条 + 行动按钮

### 5. SentimentTab — 删除重复柱状图
- 删除"情感对比"柱状图（与饼图展示完全相同的 3 个数据点）
- 饼图扩展为全宽

## 文件清单

| 文件 | 改动 |
|------|------|
| `MarketTab.tsx` | 删 2 张空卡片，合并关键词到用户画像区块 |
| `OverviewTab.tsx` | 删"目标用户"指标 |
| `DemandDecisionCard.tsx` | 删竞品分析 + 目标用户/痛点区块 |
| `ActionRecommendation.tsx` | 删统计行 |
| `SentimentTab.tsx` | 删柱状图，饼图全宽 |

5 个文件，纯删减，无新增功能。

