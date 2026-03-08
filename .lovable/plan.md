

# 两个问题的修复计划

## 问题 1：Citations 始终为 0

**根因**：Perplexity API 的 `citations` 字段在响应的顶层结构中（`data.citations`），但 `sonar` 模型有时不返回或返回空数组。根据 Perplexity 官方文档，`sonar-pro` 提供 2x 更多的 citations。

**方案**：
- 将 `deepAnalyze()` 中的模型从 `sonar` 改为 `sonar-pro`（discovery 阶段保持 `sonar` 即可）
- 增加日志：打印完整的 `data.citations` 以便调试
- 如果 `baseUrl` 不是官方 `https://api.perplexity.ai`（用户可能用了代理），检查代理是否转发了 `citations` 字段

## 问题 2：这些数据不应该在前端展示，而是作为后端数据层

用户明确说了：这些 raw signals / insights 是后端数据库层面的东西，用于后期需求分析和调研，不需要在 Hunter UI 里直接展示原始文本。未来需要做向量嵌入。

**当前方案（本次实施）**：
- Hunter 页面中移除"强烈痛点 (High Pain Signals)"和"全部信号"这两个直接展示 `raw_market_signals` 的 tab/区域
- 保留 **商机发现**（`niche_opportunities`）和 **扫描任务**（`scan_jobs`）的 UI，这些是用户需要看到的
- `raw_market_signals` 数据继续在后台采集，但不在前端暴露

**向量化（后续规划，本次不实施）**：
- `raw_market_signals` 表增加 `embedding vector(1536)` 列
- 使用 Lovable AI 或外部嵌入模型对 insight 内容生成向量
- 支持语义搜索、相似度匹配等高级分析功能

### 文件变更

| 文件 | 变更 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | `deepAnalyze()` 模型改为 `sonar-pro`，增加 citations 日志 |
| `src/components/discover/HunterSection.tsx` | 移除 SignalCard 和"强烈痛点"/"全部信号"展示区域，只保留商机卡片和扫描任务管理 |

