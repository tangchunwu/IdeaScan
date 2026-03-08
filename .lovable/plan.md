

# 核心能力打磨：报告页数据展示 + 验证流程体验

## 一、报告页数据展示打磨

### 1. ScoreHeroCard — 增加动画入场 & 评分解读
当前评分圆圈是静态渲染。改进：
- 分数从 0 **计数动画**到实际值（useEffect + requestAnimationFrame）
- 圆环 stroke 从 0 动画填充到对应角度
- 评分下方增加一行**简洁解读语句**（如"超过 78% 的同类创意"），基于分数区间生成

### 2. QuickInsightsCards — 进度条入场动画 & 微交互
当前进度条静态。改进：
- 进度条从 0% **动画过渡**到目标值（CSS transition + IntersectionObserver 触发）
- hover 时展示 tooltip 解释该指标的含义
- 卡片增加微妙的 hover 上浮效果（translateY -2px）

### 3. RadarDimensionSection — 维度卡片可交互展开
当前维度原因 `line-clamp-2` 截断，hover 展开体验不明显。改进：
- 点击维度卡片**展开/收起**完整分析（Collapsible 动画）
- 低分维度（<50）增加**红色警告图标**和「重点关注」标签
- 高分维度（≥80）增加**绿色标记**

### 4. DemandDecisionCard — 证据列表可展开 & 数据高亮
当前 `topEvidence` 和 `evidenceItems` 展示不够突出。改进：
- 顶部增加**关键数据飞入动画**（数字从 0 递增）
- 证据列表增加展开/收起交互，默认展示前 3 条
- AI verdict 区域增加引号样式装饰

### 5. 报告页整体 — 滚动进度指示器
- 页面右侧或顶部增加**阅读进度条**（细线），让用户感知报告阅读位置
- Tab 切换增加 **framer-motion 过渡动画**（fade + slide）

## 二、验证流程体验打磨

### 1. 验证页输入 — 字数计数 & 智能提示
- 输入框右下角增加**实时字数统计**（如 "23/500 字"）
- 当描述过短（<20字）时，显示**橙色提示**"描述越详细，验证越精准"
- 当描述包含"我想"但没有具体痛点/用户时，弱提示补充

### 2. ValidationProgress — 步骤完成时间 & 预估
- 每个步骤完成后显示**耗时**（如"✓ 3.2s"）
- 当前步骤显示**预估剩余时间**（基于已完成步骤的平均耗时推算）
- 步骤描述支持**实时更新**（已有 progressMessage，优化展示）

### 3. 验证完成 — 跳转前预览
- 验证完成后不直接跳转，先在原位显示**评分预览卡**（分数 + 一句话结论）
- 提供「查看完整报告」按钮，点击后带 slide-out 动画跳转
- 3 秒后自动跳转（可取消）

### 4. 表单记忆 — 上次输入恢复
- 将用户上次填写的 idea 和 tags 存入 localStorage
- 下次进入验证页时，如果是空表单，弱提示"恢复上次输入？"

## 文件清单

| 文件 | 改动 |
|------|------|
| `src/components/report/ScoreHeroCard.tsx` | 计数动画、圆环动画、评分解读 |
| `src/components/report/QuickInsightsCards.tsx` | 进度条动画、hover 交互 |
| `src/components/report/RadarDimensionSection.tsx` | 可展开维度、低/高分标记 |
| `src/components/report/DemandDecisionCard.tsx` | 数字动画、证据展开 |
| `src/pages/Report.tsx` | 滚动进度条、Tab 过渡动画 |
| `src/pages/Validate.tsx` | 字数统计、输入提示、表单记忆 |
| `src/components/validate/ValidationProgress.tsx` | 步骤耗时、预估时间 |
| `src/hooks/useValidationStream.ts` | 记录步骤完成时间戳 |

共修改 8 个文件，无后端变更，纯前端体验优化。

