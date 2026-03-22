

## 计划：让分享报告页展示完整内容

### 问题
分享报告页 (`SharedReport.tsx`) 目前只展示评分圆环 + 雷达图 + 数据概览，缺少完整报告的多个核心模块。用户希望分享页与完整报告 (`Report.tsx`) 内容一致。

### 改动（仅改 `src/pages/SharedReport.tsx`）

在现有 ScoreHeroCard + RadarDimensionSection + DataOverviewTab 基础上，补充以下模块：

1. **QuickInsightsCards** — 需求真实度 / 竞争激烈度 / 行动建议 三卡片
2. **ScoreHeroCard 完整 props** — 传入 `idea`, `overallVerdict`, `strengths`, `weaknesses`
3. **PersonaCard** — 用户画像（如有数据）
4. **Tabs 结构** — 添加概览/市场/竞品/AI 四个标签页
   - 概览: `DataOverviewTab`（已有）
   - 市场: `MarketInsightsTab`
   - 竞品: `CompetitorTab`
   - AI: `AIAnalysisTab`

所有数据已由 `useReportData(data)` 提供，无需额外 API 调用。

### 移除/调整
- 去掉底部 CTA（"想验证你自己的创业想法"）→ 改为更轻量的底部提示
- 不显示报告编辑功能（笔记、协作者、重新分析按钮等）

