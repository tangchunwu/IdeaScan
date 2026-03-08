

# 报告页 Tab 精简与优化方案

## 当前问题

截图显示 **9 个 Tab**，在桌面端已经很拥挤，手机端更难操作。几个 Tab 内容过于单薄或与其他 Tab 重叠。

## 分析

| Tab | 内容量 | 问题 |
|-----|--------|------|
| **概览** | 趋势图 + 饼图 + 3 个指标 | 内容单薄 |
| **数据洞察** | 数据质量 + 关键词 + 痛点 + 市场信号 | 与概览同为"数据层"，分开没必要 |
| **市场分析** | 市场规模 + 竞争 + 用户画像 | 清理后只剩 2 个卡片 + 画像，很薄 |
| **情感分析** | 饼图 + 词云 + 正/负面要点 | 与市场分析都是"用户侧"数据，合并更紧凑 |
| **竞品搜索** | 结构化竞品卡片 | ✅ 独立内容，保留 |
| **AI 点评** | 亮点/风险 + 战略路线图 | ✅ 独立内容，保留 |
| **创投圈** | VC Feed 社交互动 | ✅ 独立功能，保留 |
| **笔记** | 笔记 + 协作者 | ✅ 独立功能，保留 |
| **分享** | 复制链接 + 分享卡片 | 与 Header 的分享按钮重复，可移除 |

## 改动方案

### 1. 合并「概览」+「数据洞察」→「数据概览」
- 将 OverviewTab 和 DataInsightsTab 的内容合并为一个组件
- 顺序：趋势图 → 关键指标 + 内容类型分布 → 数据质量 → 痛点聚类 → 市场信号
- 删除 OverviewTab.tsx，内容并入新的 DataOverviewTab.tsx

### 2. 合并「市场分析」+「情感分析」→「市场洞察」
- MarketTab 内容（市场规模、竞争、用户画像）+ SentimentTab 内容（情感饼图、词云、正负面要点）合为一个 Tab
- 删除 MarketTab.tsx 和 SentimentTab.tsx，合并为 MarketInsightsTab.tsx

### 3. 移除「分享」Tab
- Header 已有分享按钮（handleShare）和导出按钮
- 分享卡片生成功能可以移到 Header 的下拉菜单中，或作为分享按钮的弹窗
- 删除 ShareTab 作为独立 Tab

### 4. Tab 栏更新
9 个 → 6 个：`数据概览 | 市场洞察 | 竞品搜索 | AI 点评 | 创投圈 | 笔记`

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/components/report/DataOverviewTab.tsx` | **新建** — 合并 OverviewTab + DataInsightsTab |
| `src/components/report/MarketInsightsTab.tsx` | **新建** — 合并 MarketTab + SentimentTab |
| `src/components/report/OverviewTab.tsx` | 删除（内容并入 DataOverviewTab） |
| `src/components/report/DataInsightsTab.tsx` | 删除（内容并入 DataOverviewTab） |
| `src/components/report/MarketTab.tsx` | 删除（内容并入 MarketInsightsTab） |
| `src/components/report/SentimentTab.tsx` | 删除（内容并入 MarketInsightsTab） |
| `src/components/report/ShareTab.tsx` | 删除（分享功能已在 Header） |
| `src/pages/Report.tsx` | 更新 Tab 列表和引用 |

共 3 个新建/合并，5 个删除，1 个更新。Tab 数量 9 → 6。

