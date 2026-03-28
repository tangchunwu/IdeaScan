

## 小猫 IP 组件改造计划（保留现有配色）

用小猫 🐱 作为品牌吉祥物，改造组件交互风格，配色体系不变。

---

### 改造内容

**1. 品牌 Logo (`BrandLogo.tsx`)**
- 图标从 `Sparkles` 换为 Lucide `Cat`
- 渐变和配色保持不变

**2. 按钮珍珠点击动效 (`button.tsx` + `index.css`)**
- 新增 `@keyframes paw-press` 动画：点击时短暂缩放 + 柔光扩散
- 按钮圆角加大到 `rounded-xl`
- hover 微上浮已有，保持

**3. 输入框 / 文本域 (`input.tsx` + `textarea.tsx`)**
- 圆角加大到 `rounded-xl`
- 聚焦时添加渐变发光边框效果（通过 `index.css` 的 focus 样式）
- 添加轻微内阴影增加凹陷质感

**4. 开关 (`switch.tsx`)**
- 滑块过渡改为弹跳曲线 `cubic-bezier(0.68, -0.55, 0.265, 1.55)`
- 轨道添加内阴影增加质感

**5. 进度条 (`progress.tsx`)**
- 容器改为胶囊形 + 更圆润
- 填充条添加 primary→secondary 渐变
- CSS 伪元素添加 2-3 颗小圆点装饰

**6. 空状态 (`EmptyState.tsx`)**
- 默认描述改为小猫主题文案："喵~ 这里空空的，小猫还在探索中..."
- 图标容器改为猫爪风格装饰
- 保留 props 可覆盖

**7. 全局动画 (`index.css`)**
- 新增 `paw-press` 关键帧
- glass-card hover 添加更柔和的阴影过渡

---

### 涉及文件（7个）

1. `src/index.css` — 新增动画 + 输入框聚焦样式
2. `src/components/ui/button.tsx` — 圆角 + 动效 class
3. `src/components/ui/input.tsx` — 圆角 + 聚焦样式
4. `src/components/ui/textarea.tsx` — 同上
5. `src/components/ui/switch.tsx` — 弹跳过渡
6. `src/components/ui/progress.tsx` — 胶囊形 + 渐变
7. `src/components/shared/BrandLogo.tsx` — Cat 图标
8. `src/components/shared/EmptyState.tsx` — 小猫主题文案

