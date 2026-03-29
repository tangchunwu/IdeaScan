

# 首屏布局优化

## 问题分析

从截图可以看到：
1. **标题断行丑陋** — `max-width: 8.2em` 导致"先判断这是不是"后面"是"单独一行，"值得做的真需求"又断成两行
2. **左栏内容堆叠过密** — badge、标题、描述、pills、输入框、proof、metrics 6层内容挤在一起，缺少呼吸感
3. **左右比例失衡** — 左侧 1.05fr 太窄，右侧面板过宽
4. **元素间层级不清** — 所有元素间距均匀，没有视觉分组

## 修改方案

### 1. `src/index.css` — 布局与间距修复

- `.hero-title`: `max-width` 从 `8.2em` 改为 `12em`，让标题自然断为两行：「先判断这是不是」+「值得做的真需求」
- `.hero-grid`: 调整为 `lg:grid-cols-[1.15fr_0.85fr]`，左侧更宽
- `.hero-copy`: 添加 `space-y` 或 `gap` 让子元素间距更均匀（约 `gap: 1.75rem`）
- `.hero-surface`: 增加内边距 `py-8 lg:py-12` 让整体不贴边

### 2. `src/components/landing/HeroSection.tsx` — 结构微调

- 标题文案改为更自然的断行：「先判断这是不是」一行 +「值得做的真需求」一行（去掉中间的 `<br>`，靠 max-width 自然断）
- hero-copy 容器加 `flex flex-col gap-7` 替代目前无间距的纯堆叠
- proof block 和 sample link 合并为一行（flex-row），减少纵向占用
- metric cards 间距微调

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/index.css` | 调整 `.hero-title` max-width、`.hero-grid` 列比、`.hero-surface` padding、`.hero-copy` gap |
| `src/components/landing/HeroSection.tsx` | hero-copy 加 gap class、proof block 改为横排、标题断行优化 |

