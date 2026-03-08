

# 报告顶部布局修复

## 问题分析

从截图看到几个问题：
1. **ScoreHeroCard 右侧** — idea 标题字号过大（text-2xl），长文本换行后占据大量空间，视觉不平衡
2. **缺少 overallVerdict** — 右侧只有一个巨大标题，下面直接就是建议按钮，信息层次断裂
3. **整体间距过松** — 三个全宽卡片纵向堆叠，`mb-4 sm:mb-6` + `padding="lg"` 导致页面拉得很长
4. **PersonaCard description** 作为 blockquote 又重复了一大段，和上方 ScoreHeroCard 内容感觉冗余

## 方案

### 1. ScoreHeroCard 布局收紧
- idea 标题：`text-xl sm:text-2xl` → `text-lg sm:text-xl`，`line-clamp-2` → `line-clamp-1`
- overallVerdict：确保显示，`line-clamp-4` → `line-clamp-3`
- 整体 padding：`lg` → `md`
- 评分圆环：120px → 100px，减少左侧占比

### 2. PersonaCard 收紧
- padding `lg` → `md`
- blockquote description `line-clamp-3` 限制最大行数
- 底部 grid gap 从 `gap-4` → `gap-3`

### 3. Report.tsx 间距
- 卡片间距 `mb-4 sm:mb-6` → `mb-3 sm:mb-4`

| 文件 | 改动 |
|------|------|
| `ScoreHeroCard.tsx` | 缩小标题字号、圆环尺寸、padding |
| `PersonaCard.tsx` | 收紧 padding 和间距，限制 description 行数 |
| `Report.tsx` | 减小卡片间距 |

3 个文件，纯样式微调。

