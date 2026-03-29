

# 皮肤系统完整还原 — 差距清单 & 实施计划

## 已完成 ✅

| 类别 | 内容 |
|------|------|
| CSS 变量 | 5 套皮肤配色（ghibli/street/drift/cotton/bamboo）light + dark |
| 字体 | 各皮肤专属字体已引入 |
| 背景 | PageBackground 5 套皮肤感知 |
| 进度条 | Cotton 暖杯 + Bamboo 竹筒（自定义组件），其他 3 套用默认 |
| 开关 | Cotton 兔耳 + Bamboo 竹扣（自定义组件），其他 3 套用默认 |
| 空状态 | Cotton + Bamboo 有专属 SVG 插画，其他 3 套共用默认 |
| 文案系统 | skinMessages.ts 5 套文案已定义 |
| BrandLoader / Logo / Navbar | 5 套皮肤感知 |

---

## 未完成 — 需要补齐的部分

### 一、Toast 通知未接入皮肤文案（18 个文件，约 55 处 toast 调用）

`useSkinToast` hook 已创建但 **零处引用**。所有页面仍使用原始 `useToast`，toast 文案是硬编码中文，没有走皮肤文案系统。

**方案**：批量替换关键页面的 toast 调用，使用 `useSkinToast` 包装，让 success/error/info 自动带上皮肤语气（如竹竹的"已记录！第48号样本入库"、棉棉的"好啦～要好好休息哦"）。

优先替换：Validate、Report、History、Discover、Settings（约 30 处核心 toast）。

---

### 二、Ghibli / Street / Drift 缺少专属自定义组件

目前 Cotton 和 Bamboo 有独立的 Progress/Switch/EmptyState 造型，但另外 3 套皮肤只走默认 UI：

| 组件 | Ghibli（默认） | Street | Drift |
|------|----------------|--------|-------|
| Progress | 默认横条 ✅ | 应有锐角 + 橘色条 | 应有流动水波条 |
| Switch | 默认圆形 ✅ | 应有方角最小化开关 | 应有缓漂式开关 |
| EmptyState | 默认猫猫 SVG ✅ | 应有极简无 emoji | 应有水獭漂浮 SVG |

**方案**：为 Street 和 Drift 分别创建专属组件（StreetProgress / DriftProgress / StreetSwitch / DriftSwitch），并在 SkinProgress/SkinSwitch/SkinEmptyState 中加分支。Ghibli 作为默认已够用。

---

### 三、GlassCard 皮肤差异不够

CSS 里只改了 `border-radius`。规范要求：
- **Cotton**：带白色内描边 + 粉紫微光（部分实现）
- **Bamboo**：竹纸纹理底（未实现）
- **Street**：锐角 + 无玻璃模糊 + 单像素边框（未实现）
- **Drift**：大圆角 + 水雾半透明（部分实现）

**方案**：在 index.css 中为各 `[data-skin]` 补充 `.glass-card` / `.glass-card-elevated` 的 `background`、`backdrop-filter`、`box-shadow`、`border` 覆盖。

---

### 四、按钮微交互未区分皮肤

规范要求：
- **Cotton**：按下沉入棉花垫（scale 0.96 + 粉紫波纹扩散）— 部分实现
- **Bamboo**：按下盖印章（scale 0.97 + 珍珠弹出）— 部分实现
- **Street**：无弹跳，干脆 scale 0.97 + 120ms — 已实现
- **Drift**：缓慢按压 scale 0.99 — 已实现
- **Ghibli**：猫爪弹跳 — 已实现

**方案**：完善 Cotton 的波纹动效（当前 `::after` 伪元素需要 `position: relative` 在按钮上）和 Bamboo 的珍珠弹出动效。

---

### 五、ValidationProgress 未使用 SkinProgress

验证进度页 `ValidationProgress.tsx` 内部直接用了原始 `Progress` 或自绘进度条，没走 SkinProgress。

**方案**：将验证流程中的进度条替换为 SkinProgress。

---

### 六、数据字体 `.number-highlight` 只有 Street 定义

规范中 Cotton 用 `DM Sans / Quicksand`，Bamboo 用 `JetBrains Mono`，但 `.number-highlight` 类只在 Street 皮肤定义了，Cotton/Bamboo/Drift 缺失。且页面中几乎没有使用 `.number-highlight` class。

**方案**：为各皮肤补齐 `.number-highlight` CSS，并在 Report 页的核心数据展示（分数、样本数、互动量等）上添加该 class。

---

### 七、Section 间距 1.2x 未生效

Cotton 规范要求所有间距放大 1.2 倍。CSS 里定义了 `.section-breathe` 但没有任何页面使用该 class。

**方案**：在主要页面容器上添加 `section-breathe` class，或改用 CSS 选择器自动对 `[data-skin="cotton"] main` 的子元素间距放大。

---

### 八、Hover 装饰适配不完整

- `cat-paw-hover::after` 在 Cotton 改成了 🐰，但 Bamboo 没改（应为 🐼）
- Drift 没改（应为 🦦）
- Street 已正确隐藏

**方案**：补齐 Bamboo 和 Drift 的 hover 装饰 emoji。

---

## 实施优先级建议

```text
P0 — Toast 接入皮肤文案（影响面最大，用户直接感知）
P0 — GlassCard 皮肤差异补齐（视觉骨架）
P1 — Street/Drift 专属 EmptyState SVG
P1 — 按钮微交互完善
P1 — Hover emoji 补齐
P2 — Street/Drift 专属 Progress/Switch 组件
P2 — ValidationProgress 替换 SkinProgress
P2 — .number-highlight 补齐 + 应用
P2 — Cotton section-breathe 自动生效
```

共约 **15 个文件修改 + 4 个新文件创建**，预计分 3-4 轮实施。

