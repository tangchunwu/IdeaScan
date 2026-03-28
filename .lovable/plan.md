

## 小猫 IP 持续优化计划

在已有改造基础上，进一步深化小猫主题的细节和一致性。

---

### 1. Toast 通知增加猫咪表情 (`sonner.tsx`)
- 成功 toast 样式添加左侧绿色边框 + "🐱" 前缀图标
- 错误 toast 添加红色边框 + "😿" 前缀
- 圆角统一为 `rounded-xl`，与整体风格一致

### 2. Card 组件升级 (`card.tsx`)
- 圆角从 `rounded-lg` 升级为 `rounded-2xl`
- 添加 hover 时微上浮效果 (`hover:-translate-y-0.5 transition-all`)
- 边框改为半透明 `border-border/50`

### 3. GlassCard 猫爪悬浮效果 (`GlassCard.tsx`)
- hover 模式下添加微妙的猫爪印 CSS 装饰（伪元素圆点组合）
- 增强 hover 阴影的温暖感（偏 primary 色调）

### 4. BrandLoader 猫咪尾巴动画 (`BrandLoader.tsx`)
- 加载文字改为 "喵~ 加载中..."
- 进度条改为猫爪形状（圆润胶囊 + 小圆点装饰）
- 旋转环改为猫尾摆动效果（左右摆动而非旋转）

### 5. LoadingSpinner 猫爪 dots (`LoadingSpinner.tsx`)
- dots 变体改为 3 个大小不同的圆点模拟猫爪掌心+肉垫
- 弹跳动画保持，增加交错延迟

### 6. Navbar 品牌名称 (`Navbar.tsx`)
- 副标题 "需求验证" 旁添加小猫爪印装饰 `🐾`
- 活跃导航项的底部指示点改为猫爪形（3 个小圆点组合）

### 7. 全局 CSS 增强 (`index.css`)
- 新增 `.cat-paw-indicator` 样式（3 个圆点组合的猫爪指示器）
- Toast 相关样式覆盖
- glass-card hover 阴影微调为更温暖的色调

---

### 涉及文件（7个）

1. `src/components/ui/sonner.tsx` — Toast 猫咪表情 + 圆角
2. `src/components/ui/card.tsx` — 圆角 + hover 效果
3. `src/components/shared/GlassCard.tsx` — 猫爪悬浮装饰
4. `src/components/shared/BrandLoader.tsx` — 猫咪加载文案 + 尾巴动画
5. `src/components/shared/LoadingSpinner.tsx` — 猫爪 dots
6. `src/components/shared/Navbar.tsx` — 猫爪装饰 + 指示器
7. `src/index.css` — 猫爪指示器样式 + toast 样式

