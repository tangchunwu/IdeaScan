

# 修复计划

## 1. 模型修复：`sonar-pro` → `sonar`

你的代理支持 `sonar` 但不支持 `sonar-pro`。将 `perplexity-scheduler/index.ts` line 215 的 `sonar-pro` 改回 `sonar`。

## 2. signal-processor 自动聚合 niche_opportunities

当前 `signal-processor` 只标记高分信号但从不写入 `niche_opportunities`，导致前端"潜力机会"永远为空。

在 `signal-processor/index.ts` 处理完所有信号后（line 192 附近），增加聚合逻辑：
- 查询最近 7 天 `opportunity_score >= 70` 且已处理的信号
- 按第一个 `topic_tag` 分组
- 每组计算 avg score、signal count、取前 3 条内容拼成 description
- Upsert 到 `niche_opportunities`（`keyword` 作为冲突键）
- `urgency_score` = avg opportunity_score，`title` = tag 名，`top_sources` = 去重的 source_url 列表

## 3. 管理员专属"数据监控"Tab

在 `HunterSection.tsx` 中：
- 引入 `useAdminAuth` hook
- 当 `isAdmin` 时增加第三个 tab "📊 数据监控"
- 该 tab 显示：
  - 信号统计卡片（总信号数、insight 数、高分信号数）
  - 最近 10 条 raw_market_signals（带 content_type 标签，可展开全文）

在 `hunterService.ts` 中增加：
- `getSignalStats()`: 查 raw_market_signals 按 content_type 分组计数
- `getRecentSignalsForAdmin(limit)`: 获取最近信号（所有 content_type）

### 文件变更

| 文件 | 变更 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | line 215: `sonar-pro` → `sonar` |
| `supabase/functions/signal-processor/index.ts` | 末尾增加 niche_opportunities 聚合逻辑 |
| `src/components/discover/HunterSection.tsx` | 增加管理员"数据监控"tab |
| `src/services/hunterService.ts` | 增加 `getSignalStats()` 和 `getRecentSignalsForAdmin()` |

