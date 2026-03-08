

# 结论证据摘要：从标题拼接改为有意义的总结

## 问题

"结论证据摘要" 区域当前只是把笔记标题和评论原文用 `·` 拼接起来，没有任何归纳总结，对用户没有决策价值。

## 方案

### useReportData.ts — 生成 `evidenceSummary` 字段

用已有的 AI 分析数据（`overallVerdict`、`strengths`、`weaknesses`、情感比例、笔记数量）组装一段结论性摘要，替代原始标题拼接。逻辑：

1. 如果 `overallVerdict` 有意义（非占位文本），直接作为核心结论
2. 拼接关键数据点：`{totalNotes}条用户反馈中{positive}%正向`
3. 附加 1-2 条 strengths 或 weaknesses 要点
4. 最终输出一段 2-3 句话的摘要字符串

### DemandDecisionCard.tsx — 使用新的 `evidenceSummary`

将 `topEvidence.join(" · ")` 替换为 `evidenceSummary` 文本展示。

| 文件 | 改动 |
|------|------|
| `useReportData.ts` | 新增 `evidenceSummary` 字段，用现有数据组装结论摘要 |
| `DemandDecisionCard.tsx` | 用 `evidenceSummary` 替换 `topEvidence.join()` |
| `DataOverviewTab.tsx` | 透传 `evidenceSummary` |

3 个文件，纯前端逻辑调整，无需后端改动。

