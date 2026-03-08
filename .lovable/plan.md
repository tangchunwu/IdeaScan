

# 报告页 UI/UX 优化方案

## 问题分析

基于截图和代码审查，当前报告页存在以下 UI/UX 问题：

1. **视觉层次扁平** — 所有 GlassCard 样式一致，无法区分主要/次要内容
2. **AI 点评 Tab 的亮点/风险卡片** — `border-l-4 rounded-l-none` 导致左侧直角与右侧圆角不协调
3. **间距过大** — 各区块之间 `space-y-8` 过于松散，尤其移动端浪费空间
4. **QuickInsightsCards 缺少视觉焦点** — 三张小卡片样式过于平淡
5. **Tab 栏在移动端只显示图标**，用户不知道每个图标代表什么
6. **ScoreHeroCard 与 PersonaCard 高度不匹配** — 4:8 比例下左侧经常偏矮
7. **ActionRecommendation 背景色过重** — 整块用 `bg-green-500/10` 显得"叠叠乐"

## 优化方案

### 1. AI 点评卡片样式统一（AIAnalysisTab.tsx）
- 去掉 `border-l-4 rounded-l-none`，改用顶部色带 + 图标背景色区分
- 亮点卡片：顶部 `bg-gradient-to-r from-green-500/20 to-transparent` 色带
- 风险卡片：顶部 `bg-gradient-to-r from-red-500/20 to-transparent` 色带
- 战略路线图项加上连接线设计（timeline 样式）

### 2. QuickInsightsCards 视觉增强（QuickInsightsCards.tsx）
- 给每张卡片顶部加一条 2px 的渐变色带（与卡片颜色对应）
- 图标使用圆形背景容器而非裸图标
- 数值字体加大到 `text-2xl`

### 3. Tab 栏移动端显示精简文字（Report.tsx）
- 移动端从"仅图标"改为"图标 + 2字标签"
- `<span className="hidden sm:inline">` → 始终显示缩短的标签

### 4. 间距精简（Report.tsx）
- 主区块间距从 `mb-6 sm:mb-8` 统一为 `mb-4 sm:mb-6`
- Tab 内 `space-y-8` → `space-y-6`

### 5. ActionRecommendation 轻量化（ActionRecommendation.tsx）
- 去掉整体 `border-2` 和背景色
- 改用左侧色条 + 白底卡片，更清爽
- 按钮改为 `size="sm"` + `rounded-full`

### 6. ScoreHeroCard 居中对齐（ScoreHeroCard.tsx）
- 加 `h-full` 确保与 PersonaCard 等高
- 评分解读文字从 `text-xs` 改为 `text-sm` 提升可读性

### 7. DataOverviewTab & MarketInsightsTab 卡片间距（DataOverviewTab.tsx, MarketInsightsTab.tsx）
- `space-y-6` → `space-y-5` 更紧凑
- 市场规模/竞争程度两个小卡片改为一行内的 stat badges 而非独立 GlassCard

## 文件清单

| 文件 | 改动 |
|------|------|
| `AIAnalysisTab.tsx` | 亮点/风险卡片样式重做，战略路线图加 timeline 连接线 |
| `QuickInsightsCards.tsx` | 加顶部色带和图标容器 |
| `Report.tsx` | Tab 标签移动端显示短文字，间距缩减 |
| `ActionRecommendation.tsx` | 去重背景，改为侧边色条风格 |
| `ScoreHeroCard.tsx` | 加 h-full，文字大小调整 |
| `MarketInsightsTab.tsx` | 市场规模/竞争卡片合并为 inline stats |
| `DataOverviewTab.tsx` | 间距微调 |

7 个文件，纯 UI 调整，不涉及数据逻辑。

