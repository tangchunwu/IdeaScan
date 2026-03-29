

# 首屏精简 + 滚动渐显

## 改动

### 1. `src/components/landing/HeroSection.tsx`
- **删除右侧「创意情报面板」**：移除整个 right stage panel（L276-L376），包括 SignalBar 组件、heroSignals 数据、panelVariants、mouse parallax 相关代码
- **布局改为居中单栏**：hero-copy 居中展示（`text-center mx-auto max-w-3xl`），不再使用 hero-grid 双栏
- highlight pills 居中排列，command panel 居中
- 清理不再需要的 imports（GlassCard、useMotionValue/useTransform 等）

### 2. `src/index.css`
- `.hero-grid` 改为单栏居中布局（移除 `lg:grid-cols-[1.15fr_0.85fr]`）
- 移除 `.hero-stage*` 相关样式（不再需要）
- 移除 `.hero-signal-*`、`.hero-verdict-card`、`.hero-status-*` 等右侧面板样式

### 3. `src/pages/Index.tsx` — 增强滚动渐显
- 将「创意情报面板」内容（3 个信号条 + 判断/建议卡片）移到首屏下方作为独立 section，用 `ScrollReveal` 包裹，滚动时渐显入场
- 各 section 之间加统一的 `ScrollReveal` stagger 效果

最终效果：首屏只保留 badge → 标题 → 描述 → pills → 输入框，干净聚焦；向下滚动时信号面板、social proof、features 依次渐显浮入。

