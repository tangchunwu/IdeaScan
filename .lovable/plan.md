

# 修复两处空白区域

## 问题分析

从截图看到两个红圈标注的空白：

1. **ScoreHeroCard 右侧空白** — idea 标题被 `line-clamp-1` 截断后，右侧大量留白；`overallVerdict` 虽然存在但 `line-clamp-3` 不够填满空间，整体右侧内容不饱满
2. **DataConfidenceCard 右侧空白** — 被限制为 `lg:max-w-sm`（约 384px），在大屏上右侧 2/3 完全空白

## 方案

### 1. ScoreHeroCard — 让内容撑满右侧
- idea 标题：`line-clamp-1` → `line-clamp-2`，允许长标题自然换行
- overallVerdict：`line-clamp-3` → `line-clamp-4`，展示更多总结内容
- 减小左右 gap：`gap-6 md:gap-10` → `gap-5 md:gap-8`

### 2. DataConfidenceCard — 去掉宽度限制，改为全宽
- Report.tsx 第 468 行：去掉 `lg:max-w-sm`，让 DataConfidenceCard 全宽展示
- DataConfidenceCard 内部已经是自适应布局，全宽后指标会水平铺开，信息密度更高

| 文件 | 改动 |
|------|------|
| `ScoreHeroCard.tsx` | line-clamp-1→2, line-clamp-3→4, 缩小 gap |
| `Report.tsx` | 第468行去掉 `lg:max-w-sm` |

2 个文件，纯样式调整。

