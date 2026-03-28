

## 添加滚动渐显效果

创建一个通用的 `ScrollReveal` 组件，基于 IntersectionObserver，元素滚入视口时触发淡入+上滑动画。然后在报告页等关键页面包裹各 section 使用。

---

### 1. 新建 `ScrollReveal` 组件 (`src/components/shared/ScrollReveal.tsx`)
- 使用 `IntersectionObserver`（threshold: 0.15）检测元素进入视口
- 初始状态：`opacity: 0, translateY: 30px`
- 进入视口后：过渡到 `opacity: 1, translateY: 0`，带 `600ms ease-out` 过渡
- 支持 `delay` prop 实现交错动画（如列表中第2个延迟100ms、第3个200ms）
- 支持 `direction` prop：`up`（默认）、`left`、`right` 方向滑入
- 触发一次后不再重置（`once: true`）

```tsx
// 使用方式
<ScrollReveal>
  <GlassCard>...</GlassCard>
</ScrollReveal>

<ScrollReveal delay={100} direction="left">
  <SomeComponent />
</ScrollReveal>
```

### 2. Report.tsx 集成
- 用 `ScrollReveal` 包裹各主要 section（QuickInsights、ScoreHero、MultiPersona、Tabs 等）
- 各 section 之间加递增 delay，形成自上而下逐个浮现的效果
- 替换部分现有的 `animate-slide-up`（它是页面加载时立即播放的，不是滚动触发的）

### 3. Discover 页面集成
- 用户当前在 Discover 页面，给卡片列表的每个 item 包裹 `ScrollReveal` + 交错 delay
- 统计区域、筛选器区域也加上滚动渐显

---

### 涉及文件（3个）

1. `src/components/shared/ScrollReveal.tsx` — 新建通用滚动渐显组件
2. `src/pages/Report.tsx` — 各 section 包裹 ScrollReveal
3. `src/pages/Discover.tsx` — 卡片列表滚动渐显

