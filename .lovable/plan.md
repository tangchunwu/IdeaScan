

# 多皮肤切换系统方案

支持当前宫崎骏猫咪 + 阿橘街头风 + 漂漂水獭 + 未来更多皮肤的动态切换。

---

## 架构

```text
data-skin="ghibli" (默认)
data-skin="street" (阿橘)
data-skin="drift"  (漂漂)
data-skin="xxx"    (未来扩展)
         │
         ▼
  CSS Variable Overrides per [data-skin]
         │
         ▼
  useTheme store (Zustand + persist)
  → 持久化到 localStorage
  → 应用 data-skin 到 <html>
```

核心原则：**所有皮肤差异通过 CSS 变量 + `[data-skin]` 选择器解决**，组件代码改动最小化。仅少数组件（PageBackground、BrandLoader、EmptyState）需要读取当前皮肤做条件渲染。

---

## 步骤一：创建主题 Store

**新建** `src/hooks/useTheme.ts`

```ts
type Skin = 'ghibli' | 'street' | 'drift';
// Zustand + persist
// setSkin() → document.documentElement.dataset.skin = skin
```

定义皮肤元数据（名称、描述、emoji）供 UI 展示。

---

## 步骤二：CSS 多皮肤变量

**修改** `src/index.css`

在现有 `:root` 和 `.dark` 之后，新增两组 `[data-skin]` 覆盖块：

**`[data-skin="street"]`** — 阿橘街头风：
- `--primary: 22 78% 60%` (橘猫橙)
- `--background: 240 5% 11%` (深夜沥青)
- `--accent: 43 90% 61%` (限定金)
- `--radius: 0.25rem` (直角)
- 动效覆盖：`.paw-press` → scale(0.97) 120ms，禁止 bounce

**`[data-skin="drift"]`** — 漂漂水獭风：
- `--primary: 199 30% 51%` (河面蓝)
- `--background: 200 22% 96%` (水雾白)
- `--accent: 26 29% 49%` (湿石棕)
- `--radius: 0.75rem` (柔和圆角)
- 动效覆盖：所有动效 350-600ms，曲线 cubic-bezier(0.25, 0.46, 0.45, 0.94)

每套皮肤同时覆盖 light + dark 变量、glass 效果、ghibli 特色色映射。

---

## 步骤三：字体引入

**修改** `index.html`

添加 Google Fonts：`Bebas Neue`、`Space Mono`（街头用）、`Lora`、`Fraunces`（水獭用）

**修改** `src/index.css`

```css
[data-skin="street"] body { font-family: 'Inter', system-ui, sans-serif; }
[data-skin="street"] h1,h2,h3 { font-family: 'Bebas Neue', sans-serif; }

[data-skin="drift"] body { font-family: 'Source Han Serif SC', Georgia, serif; line-height: 2.0; }
[data-skin="drift"] h1,h2,h3 { font-family: 'Lora', serif; }
```

---

## 步骤四：皮肤切换 UI

**修改** `src/components/shared/SettingsDialog.tsx`

在设置面板顶部新增"皮肤主题"区域，展示皮肤卡片网格：

| 皮肤 | 预览色块 | 描述 |
|------|---------|------|
| 🐱 宫崎骏猫咪 | 天蓝+草绿 | 柔和自然（默认）|
| 🐱 阿橘街头风 | 橘+深灰 | 暗色潮酷 |
| 🦦 漂漂水獭 | 河蓝+浮萍绿 | 慢节奏漂流 |

点击切换，实时生效。

---

## 步骤五：组件皮肤适配

少量组件需要根据皮肤做条件渲染：

**`PageBackground.tsx`**：
- ghibli → 云朵 + ghibli-gradient
- street → 纯深色 + 橘色光晕，无云朵
- drift → 浮萍装饰 + 河面渐变

**`BrandLoader.tsx`**：
- ghibli → "喵~ 加载中..." + 🐾
- street → "加载中..." 无 emoji
- drift → "漂着呢，不急..." + 🦦

**`BrandLogo.tsx`**：
- street → 圆角改为 rounded-md
- drift → hover 改为横向漂移

**`Navbar.tsx`**：
- 副标题 emoji 随皮肤切换

---

## 步骤六：App 初始化

**修改** `src/App.tsx`

顶层调用 `useTheme()` 确保 `data-skin` 在首次渲染时应用。

---

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/hooks/useTheme.ts` | 新建 |
| `src/index.css` | 添加两组皮肤变量 + 字体 + 动效覆盖 |
| `index.html` | Google Fonts |
| `tailwind.config.ts` | 字体栈更新 |
| `src/components/shared/SettingsDialog.tsx` | 皮肤选择 UI |
| `src/components/shared/PageBackground.tsx` | 皮肤感知背景 |
| `src/components/shared/BrandLoader.tsx` | 皮肤感知文案 |
| `src/components/shared/BrandLogo.tsx` | 皮肤感知样式 |
| `src/components/shared/Navbar.tsx` | 皮肤感知 emoji |
| `src/App.tsx` | 初始化皮肤 |

纯前端改造，不涉及数据库。未来新增皮肤只需：① 加一组 CSS 变量 ② 在皮肤元数据数组加一项 ③ 需要的话在少量组件加条件分支。

