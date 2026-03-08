

# ActionRecommendation 卡片空白问题修复

## 问题
`ActionRecommendation` 使用 `h-full`，被拉伸到与同行的 `DataConfidenceCard` 等高，导致按钮下方出现大片空白。

## 方案
去掉 `h-full`，改为自适应高度。同时调整外层 grid 布局，让两张卡片顶部对齐（`items-start`）而非拉伸等高。

| 文件 | 改动 |
|------|------|
| `ActionRecommendation.tsx` | 移除 GlassCard 和内层 div 的 `h-full` |
| `Report.tsx` | ActionRecommendation + DataConfidenceCard 所在 grid 行加 `items-start` |

2 个文件，极小改动。

