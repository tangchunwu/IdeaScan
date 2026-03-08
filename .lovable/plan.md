

# 重构：从"拆散条目"到"洞察 + 来源"模式

## 当前问题

现在每次 Perplexity 调用，要求它返回 5-8 条独立的 JSON "信号"，然后逐条插入 `raw_market_signals`。但这些并不是真正的原始数据——它们是 Perplexity 基于 10+ 条来源信息合成出来的 AI 观点，被强行拆成了碎片。

**本质问题**：把 AI 的综合分析拆散成假的"原始信号"，丢失了整体洞察，同时来源引用（citations）也没有被系统化保存。

## 方案

每次 Perplexity Deep Scan 调用改为产出**两层数据**：

1. **洞察层**（1 条）：Perplexity 基于搜索结果生成的综合趋势分析、痛点总结、机会判断 → 存入 `raw_market_signals`，`content_type = 'insight'`
2. **来源层**（N 条）：Perplexity 返回的 citations（引用来源 URL + 摘要）→ 存入 `raw_market_signals`，`content_type = 'source_citation'`，通过新字段 `parent_signal_id` 关联到洞察

```text
Perplexity 调用
  │
  ├─ 1 条 insight（综合观点 + 趋势 + 痛点总结）
  │
  └─ N 条 source_citation（来源 URL + 简要摘要）
       └─ parent_signal_id → insight.id
```

### 具体改动

**数据库**：`raw_market_signals` 表新增 `parent_signal_id UUID` 列（nullable, 自引用外键），用于将 source_citation 关联到对应的 insight。

**`perplexity-scheduler/index.ts`**：
- 修改 `searchPerplexity()` 的 prompt：不再要求返回 5-8 条独立信号，改为要求返回一份**综合分析报告**（含趋势总结、核心痛点、机会判断、热度评估）
- 修改 `processKeyword()`：
  - 先插入 1 条 insight 记录（综合分析内容）
  - 再为每个 citation 插入 source_citation 记录，`parent_signal_id` 指向 insight
  - trending_topics 的统计数据从 insight 内容中提取，不再从碎片信号聚合

**Prompt 调整示例**：
```
关于"${keyword}"，请提供一份综合市场情报分析（400-600字）：
1. 趋势概要：这个领域当前的核心趋势是什么？
2. 用户痛点：最突出的 3-5 个用户痛点（引用具体场景）
3. 商业机会：最有潜力的 1-2 个切入点
4. 竞争格局：现有方案的主要短板

返回 JSON：
{
  "analysis": "综合分析文本...",
  "pain_points": ["痛点1", "痛点2"],
  "opportunity_score": 75,
  "heat_indicator": 80,
  "pain_level": "high",
  "sentiment": "negative",
  "topic_tags": ["标签1", "标签2"]
}
```

### 配额变化

- 之前：1 次 Perplexity 调用 → 5-8 条信号 → 消耗 5-8 配额
- 之后：1 次调用 → 1 条 insight + N 条 citation → 消耗 1 + N 配额（或只算 insight 为 1 条配额）
- `DAILY_QUOTA` 含义从"信号条数"改为"洞察条数"更合理，可调整为 50

### 文件变更

| 文件 | 变更 |
|------|------|
| 数据库迁移 | `raw_market_signals` 新增 `parent_signal_id` 列 |
| `supabase/functions/perplexity-scheduler/index.ts` | 重写 prompt + processKeyword 逻辑 |
| `signal-processor/index.ts` | 只处理 `content_type = 'insight'` 的记录，跳过 citation |

前端无需改动，`raw_market_signals` 的读取已有 RLS 允许所有人 SELECT。

