

# IdeaScan 整体优化计划

## 一、问题诊断

通过全面审查代码库，发现以下几个层面的优化空间：

### 前端体验
- **Report.tsx 过于臃肿**：1700 行单文件，包含数据处理、图表渲染、多 Tab 切换，维护困难且首屏加载慢
- **重复的数据清洗逻辑**：`cleanDisplayText`、dimensions fallback、persona mapping 在多处重复
- **VC Circle 交互单薄**：回复后无加载动画，点赞状态不持久化（刷新丢失），无法查看对话是否有新回复
- **Report 页英中混杂**：Tab 内部标题使用英文（"Core Investment Thesis"、"Six-Dimension Evaluation"），与整体中文界面不一致

### 后端 & 数据
- **generate-discussion 不传 LLM 配置**：用户自定义的 LLM 设置（apiKey/model）没有从前端传到 generate-discussion，导致用户只能用系统默认模型
- **reply-to-comment 同样不传用户 LLM 配置**
- **socialService.ts 不传 config**：前端调用 `generateDiscussion` 和 `replyToComment` 时没有附带用户的 LLM 设置

### 性能
- **Report 页所有 Tab 内容同时渲染**：即使用户只看"概览"，7 个 Tab 的图表全部渲染
- **recharts 图表无懒加载**：大量图表组件一次性加载

---

## 二、优化方案

### Phase 1: Report 页拆分与国际化统一（影响最大）

**1.1 拆分 Report.tsx 为子组件**

将 1700 行的 Report.tsx 拆分为：
- `src/components/report/ReportHeader.tsx` -- 标题、标签、导出按钮区域（约 100 行）
- `src/components/report/ScoreHeroCard.tsx` -- 得分主卡片（约 60 行）
- `src/components/report/DemandDecisionCard.tsx` -- 需求验证结论大卡（约 180 行）
- `src/components/report/OverviewTab.tsx` -- 概览 Tab（趋势图 + 雷达图 + 内容分布 + 关键指标）
- `src/components/report/MarketTab.tsx` -- 市场分析 Tab
- `src/components/report/SentimentTab.tsx` -- 情感分析 Tab
- `src/components/report/CompetitorTab.tsx` -- 竞品 Tab
- `src/components/report/AIAnalysisTab.tsx` -- AI 深度点评 Tab
- `src/components/report/ShareTab.tsx` -- 分享 Tab
- `src/components/report/useReportData.ts` -- 抽取数据清洗和准备逻辑为自定义 Hook

每个子组件接收已清洗的 props，Report.tsx 只负责数据获取和路由。

**1.2 统一英文标题为中文**

| 当前英文 | 改为中文 |
|---|---|
| Six-Dimension Evaluation | 六维度深度评估 |
| Core Investment Thesis | 核心投资亮点 |
| Critical Risks & Deal Breakers | 关键风险与致命伤 |
| Strategic Roadmap (GTM & Product) | 战略路线图 |
| Pre-Mortem Analysis | 失败前瞻分析 |

### Phase 2: VC Circle 体验升级

**2.1 前端传递 LLM 配置**

修改 `src/services/socialService.ts`：
- `generateDiscussion()` 增加 `config` 参数，传递用户的 `llmBaseUrl`、`llmApiKey`、`llmModel`
- `replyToComment()` 同样增加 `config` 参数

修改 `src/components/social/VCFeed.tsx`：
- 引入 `useSettings`，将 LLM 配置传入 `generateDiscussion` 和 `replyToComment`

**2.2 交互细节优化**

- FeedItem 点赞后从数据库读取真实状态（当前是本地 toggle，刷新丢失）
- 回复提交时增加 typing 动画（"AI 正在思考..."）
- 回复完成后自动滚动到新评论

### Phase 3: 性能优化

**3.1 Tab 内容懒加载**

使用 React.lazy 或条件渲染，只有用户切换到某 Tab 时才渲染对应内容：

```typescript
// 只在 Tab 激活时渲染
<TabsContent value="sentiment">
  {activeTab === 'sentiment' && <SentimentTab data={sentimentAnalysis} />}
</TabsContent>
```

**3.2 图表组件懒加载**

将 recharts 重量级组件包装为懒加载：
```typescript
const LazyRadarChart = lazy(() => import('recharts').then(m => ({ default: m.RadarChart })));
```

---

## 三、技术实施顺序

| 序号 | 任务 | 改动文件 | 预估复杂度 |
|---|---|---|---|
| 1 | 抽取 useReportData Hook | 新建 `src/components/report/useReportData.ts` | 中 |
| 2 | 拆分 Report 子组件（7 个文件） | 新建 7 个组件 + 重构 Report.tsx | 高 |
| 3 | 统一中文标题 | Report 子组件中修改 | 低 |
| 4 | socialService 传递 LLM 配置 | `socialService.ts`, `VCFeed.tsx` | 低 |
| 5 | VC Circle 交互优化 | `FeedItem.tsx`, `VCFeed.tsx` | 中 |
| 6 | Tab 懒加载 | Report.tsx | 低 |

---

## 四、不在本次范围

- 数据库结构变更（当前表设计合理）
- 新增页面或功能模块
- 爬虫服务优化（独立子系统）
- i18n 全量翻译（当前中文为主，保持现状）

