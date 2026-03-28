

## 报告页视觉升级 — 消除 Demo 感

从截图看，主要问题：卡片扁平无层次、SectionHeading emoji 风格幼稚、虚线分隔廉价、QuickInsights 三卡色彩单调、整体缺乏深度和质感。

---

### 1. SectionHeading 升级 — 去 emoji，用 icon 圆标 (`SectionHeading.tsx`)
- 去掉 emoji，改为带颜色底色的小圆形 icon 容器（类似参考图中 📊 那个方形 icon）
- 接受 `icon` prop（Lucide icon component），渲染在 `w-8 h-8 rounded-lg bg-primary/10` 容器内
- 保持左侧 3px 色条，但色条改为渐变（`from-primary to-primary/50`）
- 标题用 `text-lg font-bold`，副标题 `text-xs text-muted-foreground`

### 2. QuickInsightsCards 质感提升 (`QuickInsightsCards.tsx`)
- 去掉 `border-l-[3px] border-l-primary`（太统一，没区分度）
- 每张卡片底部加微妙渐变：需求卡 green 底色渐变、竞争卡 red/blue、行动卡 purple
- 数值文字加 `tabular-nums` 和更大字号 `text-3xl`
- 进度条加圆角端点装饰
- 卡片 hover 时轻微 border 高亮（各自颜色）

### 3. ScoreHeroCard 视觉提升 (`ScoreHeroCard.tsx`)
- 整体背景改为深色渐变（`from-slate-900/95 to-slate-800/90`，暗色模式卡片），与页面浅色形成对比
- 评分圆环增大到 120px，添加外圈光晕
- 标题用渐变文字 `text-gradient`
- verdict 文字区域加左侧竖线装饰
- 底部加一行小标签：数据量 + 置信度

### 4. 去掉虚线分隔，用间距 + 微妙渐变分隔 (`Report.tsx`)
- 删除所有 `<hr className="border-dashed...">` 
- 改用 `mt-10 sm:mt-14` 的间距
- 在 section 之间可选加一个极淡的渐变色块做视觉过渡

### 5. GlassCard 增加深度 (`GlassCard.tsx`)
- `glass-card` 增加 `border-white/10` 顶部高光线（`border-t border-white/10`）
- hover 时 shadow 更明显，加 `ring-1 ring-primary/5`

### 6. Report.tsx 引用 SectionHeading 改用 icon
- 快速洞察: `BarChart3`、综合评估: `Target`、用户画像: `Users`、维度评估: `Radar`、详细报告: `FileText`

---

### 涉及文件（5个）

1. `src/components/report/SectionHeading.tsx` — emoji → icon 圆标，渐变色条
2. `src/components/report/QuickInsightsCards.tsx` — 卡片底色渐变 + 数值字号
3. `src/components/report/ScoreHeroCard.tsx` — 深色对比背景 + 光晕圆环
4. `src/pages/Report.tsx` — 去虚线、改 icon、调间距
5. `src/index.css` — glass-card 顶部高光线

