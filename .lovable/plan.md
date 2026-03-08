

# `crawler-scheduler` 的定位与新增 Perplexity 调度器

## 现状分析

**`crawler-scheduler` 的原始用途**：它是一个 pg_cron 定时任务函数，读取 `scan_jobs` 表中到期的任务，用 **TikHub API 爬取小红书** + **Reddit 免费 API** 获取真实帖子数据，写入 `raw_market_signals`。

但它目前是**失效状态**：第 146 行 `const tikhubToken: string | undefined = undefined;`，因为 TikHub token 是用户级别的（存在用户 settings 里），系统级 cron job 无法获取。所以小红书爬取从未真正工作过，只有 Reddit 那条路径可能跑通。

**`scan-trending-topics` 同理**：第 460 行也是 `undefined`，第 467 行直接 return，完全失效。

## 方案：保留 + 新建

| 函数 | 处理方式 |
|------|---------|
| `crawler-scheduler` | **保留不动**。它的 TikHub 爬取逻辑本身是正确的，只是缺少 token。未来如果解决了系统级 token 问题（如 admin 配置全局 token），它可以直接启用 |
| `perplexity-scheduler`（新建） | 新的定时调度函数，用 Perplexity 做全网情报搜索，写入 `raw_market_signals` + 更新 `trending_topics` |
| `scan-trending-topics` | 保留现有代码结构，但添加 Perplexity 回退路径：当 TikHub token 不可用时，用 Perplexity 搜索趋势数据而非直接 return |

## 新建 `perplexity-scheduler` 实现

### 核心逻辑

1. 读取到期的 `scan_jobs`（复用现有表）
2. 合并动态高优关键词（从 `user_topic_clicks` 取最近 7 天高频词）
3. **配额保护**：查询 `raw_market_signals` 当天 `source='perplexity'` 记录数，超 100 条跳过
4. **24h 去重**：跳过最近 24h 已有 perplexity 数据的关键词
5. 每次最多处理 3 个关键词，调用 Perplexity `sonar` 模型
6. 结构化输出写入 `raw_market_signals`（source="perplexity"）
7. 同时提取趋势信息 upsert 到 `trending_topics`
8. 更新 `scan_jobs` 的 `last_run_at` / `next_run_at`

### 文件变更

| 文件 | 变更 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | **新建**：Perplexity 定时调度函数 |
| `supabase/functions/hunter-scan/index.ts` | 添加每日配额检查 + 24h 关键词去重 |
| `supabase/functions/scan-trending-topics/index.ts` | 添加 Perplexity 回退：当 tikhubToken 不可用时，用 Perplexity 搜索而非直接 return |
| `supabase/config.toml` | 注册 `perplexity-scheduler` |

### 不变的部分

- `crawler-scheduler` — 完全不动，保留 TikHub + Reddit 逻辑
- `validate-idea`、`validate-idea-stream`、`recrawl-social` — 完全不动
- 前端 UI — 无需改动
- 数据库表结构 — 复用现有表

### 数据流

```text
验证流程（不动）:
  用户点验证 → validate-idea-stream → TikHub → 小红书/抖音真实帖子

TikHub 定时爬取（保留，待 token 问题解决后可启用）:
  pg_cron → crawler-scheduler → TikHub + Reddit → raw_market_signals

Perplexity 情报（新建）:
  pg_cron 每4h → perplexity-scheduler → Perplexity → raw_market_signals + trending_topics
  用户手动 → hunter-scan（配额保护） → Perplexity → raw_market_signals

趋势扫描（增强）:
  pg_cron 每12h → scan-trending-topics → TikHub 优先，Perplexity 回退 → trending_topics
```

### pg_cron 定时任务

需要通过数据库 SQL 创建两个定时任务（启用 `pg_cron` + `pg_net` 扩展）：
- `perplexity-scheduler`：每 4 小时
- `scan-trending-topics`：每 12 小时

预估日消耗：~24 次 Perplexity API 调用/天。

