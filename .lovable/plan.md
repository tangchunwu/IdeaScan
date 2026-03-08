

# 修复空白 + 字体过小

## 问题

从截图看到两个箭头指向的问题：
1. **ScoreHeroCard 右侧**：idea 标题下方 `overallVerdict` 只显示了"已完成综合评估"一小行，下面大片空白直到按钮区 — 内容没有撑满
2. **字体全面偏小**：`text-[10px]` 用了多处（"基于20条数据"、"/100"），痛点/诉求/进度条标签都是 `text-xs`（12px），在大屏上阅读体验差

## 方案

### 1. ScoreHeroCard 字体放大 + 填满空间
| 元素 | 当前 | 改为 |
|------|------|------|
| "需求真实度" 标签 | `text-[10px]` | `text-xs` |
| 分数数字 | `text-3xl` | `text-4xl` |
| "/100" | `text-[10px]` | `text-xs` |
| "基于N条数据" | `text-[10px]` | `text-xs` |
| idea 标题 | `text-lg sm:text-xl` | `text-xl sm:text-2xl` |
| overallVerdict | `text-sm` | `text-base` |
| overallVerdict 行限制 | `line-clamp-4` | 去掉 line-clamp，完整显示 |
| 建议标题 | `text-sm` | `text-base` |
| 按钮文字 | `text-xs` | `text-sm` |

### 2. PersonaCard 字体放大
| 元素 | 当前 | 改为 |
|------|------|------|
| 人名 | `text-lg` | `text-xl` |
| 角色 badge | `text-xs` | `text-sm` |
| 年龄/收入 | `text-xs` | `text-sm` |
| User Story blockquote | `text-sm` + `line-clamp-3` | `text-base` + 去掉 line-clamp |
| 痛点/诉求标题 | `text-xs` | `text-sm` |
| 痛点/诉求内容 | `text-xs` | `text-sm` |
| 进度条标签 | `text-xs` | `text-sm` |

### 3. 文件清单

| 文件 | 改动 |
|------|------|
| `ScoreHeroCard.tsx` | 全面放大字号，去掉 overallVerdict 行限制 |
| `PersonaCard.tsx` | 全面放大字号，去掉 description 行限制 |

2 个文件，纯字号/样式调整。

