

# 首屏动效升级计划

参照 ui-ux-pro-max-skill 的动效规范（spring-physics、stagger-sequence 30-50ms、exit-faster-than-enter、scale-feedback、hierarchy-motion），对首屏 Hero 进行系统性动效升级。

## 当前状态

已有基础的 CSS 动画：`hero-copy-in`（translateY stagger）、`hero-panel-in`、`hero-signal-shine`、`hero-grid-pan`、`hero-drift` 等。但都是纯 CSS keyframes，缺少：
- 物理弹簧曲线（spring physics）
- 交互式动效（hover scale feedback、input focus 动画）
- 数字滚动（counter animation）
- 信号条动态填充
- 视差层次感
- `prefers-reduced-motion` 适配

## 实施方案

### 1. 创建 `src/components/landing/HeroSection.tsx`（从 Index.tsx 抽取 hero）

将 hero 区块提取为独立组件，使用 framer-motion 替换 CSS 动画：

- **hero-copy stagger**: 用 `motion.div` + `staggerChildren: 0.1s` + `spring` 弹簧曲线（stiffness 100, damping 12），替代当前 CSS `hero-copy-in`
- **hero-title 文字**: 逐字/逐行 spring 入场（`variants` 嵌套 stagger）
- **hero-stage-panel**: `motion.div` 从 `y: 40, scale: 0.96, opacity: 0` 弹入，delay 0.3s，spring 曲线
- **信号条填充动画**: 用 `motion.div` 的 `initial={{ width: 0 }}` → `animate={{ width: value + "%" }}`，配合 `useInView` 触发
- **数字滚动**: heroMetrics 的数字用 `useMotionValue` + `useTransform` + `animate` 做计数器效果
- **heroSignals 数值**: 百分比数字从 0 滚动到目标值

### 2. 增强交互式微动效

- **输入框 focus**: 命令面板在 focus 时 `scale: 1.02` + border glow 加强（framer-motion `whileFocus`）
- **CTA 按钮**: `whileHover={{ scale: 1.05 }}` + `whileTap={{ scale: 0.97 }}`，spring 弹簧
- **highlight pills**: hover 时 `y: -2` 微浮
- **metric cards**: hover 时 `y: -4, scale: 1.02` 升起
- **signal cards**: hover 时微微亮起（border opacity 变化）
- **scroll cue**: 替换 CSS bob 为 framer-motion spring bounce

### 3. 视差与层次（CSS + framer-motion）

- **hero-stage glow blobs**: 给两个 glow 添加基于鼠标位置的微弱视差移动（`useMotionValue` 追踪鼠标 x/y，`useTransform` 映射为 translate），增强空间感
- **hero-stage-grid**: 保持 CSS 平移但加上鼠标视差偏移

### 4. `prefers-reduced-motion` 适配

在组件层用 `useReducedMotion()` hook，当用户开启减弱动效时：
- 所有 spring/stagger 变为 `duration: 0`
- 数字直接显示最终值
- 视差效果禁用

### 5. 更新 `src/pages/Index.tsx`

- 替换 hero 区块为 `<HeroSection />`，传入 `heroIdea`、`validationCount` 等 props
- 下方 features/testimonials/steps/CTA 区块使用 `ScrollReveal` + framer-motion `whileInView` 增强

### 6. CSS 清理

- 保留 `.hero-*` CSS 结构类（布局/颜色/玻璃效果）
- 移除被 framer-motion 替代的 `animation` 属性（`hero-copy-in`、`hero-panel-in` 的 CSS animation 声明）
- 保留 `hero-signal-shine`、`hero-grid-pan`、`hero-dot-pulse` 等持续循环动画

## 涉及文件

| 操作 | 文件 |
|------|------|
| 新建 | `src/components/landing/HeroSection.tsx` |
| 修改 | `src/pages/Index.tsx`（hero 区块替换为组件引用） |
| 修改 | `src/index.css`（移除被 framer-motion 替代的 CSS animation 声明） |

## 遵循的 ui-ux-pro-max 规范

- `spring-physics`: 弹簧曲线替代 cubic-bezier
- `stagger-sequence`: 30-50ms 逐项入场
- `duration-timing`: 微交互 150-300ms
- `scale-feedback`: 按下 0.95-1.05
- `exit-faster-than-enter`: 退出 60-70% 进入时长
- `transform-performance`: 只动 transform/opacity
- `reduced-motion`: 尊重系统偏好
- `hierarchy-motion`: translate 方向表达层级
- `no-blocking-animation`: 动画不阻塞交互

