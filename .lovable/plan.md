

# ScoreHeroCard 内容去重 + 行动按钮优化

## 问题分析

从截图看到 3 个问题：
1. **idea 标题与 overallVerdict 内容重复** — 右侧先显示了完整的 idea 文本（很长），然后 overallVerdict 只显示"已完成综合评估"这种无意义占位文本，应该直接展示 AI 的分析结论摘要
2. **"建议：立即启动！" 与 ReportHeader 中的 AI Agent 按钮功能重复** — 两处都有行动建议
3. **"开始构建 MVP" 按钮** 当前跳转到 lovable.dev，实际应该走 MVP Generator 流程（已有 `/mvp/generator` 页面）

## 方案

### ScoreHeroCard.tsx 改动

1. **idea 标题截短** — 超过 30 字符截断加省略号，避免占满整个右侧
2. **overallVerdict 区域** — 作为核心分析结论展示，如果是空或无意义文本（如"已完成综合评估"），则显示 strengths/weaknesses 的精华摘要
3. **去掉底部 Verdict + Actions 区域** — 整个 `border-t` 分隔线以下的建议标题和按钮全部移除，因为：
   - ReportHeader 已有 AI Agent 下拉菜单（含"一键发小红书"等）
   - DemandDecisionCard 已有完整的决策建议
   - 重复的 CTA 只会让用户困惑
4. ScoreHeroCard 定位回归为**纯信息展示**：评分 + 标题 + AI 结论摘要

### Report.tsx 改动

- `onStartBuilding` 和 `onValidateMore` props 不再传递（已移除按钮）

| 文件 | 改动 |
|------|------|
| `ScoreHeroCard.tsx` | 截短标题，用 strengths/weaknesses 充实右侧内容，移除底部重复的行动按钮 |
| `Report.tsx` | 移除传给 ScoreHeroCard 的 onStartBuilding/onValidateMore |

2 个文件，逻辑 + 样式调整。

