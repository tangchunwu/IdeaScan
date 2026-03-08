

# 修复「来源引用」统计为 0 的问题

## 原因
`hunter-scan` 当前将 Perplexity 返回的 citations URL 直接存入 `intelligence` 记录的 `source_url` 字段，不再生成独立的 `source_citation` 类型记录。因此 `getSignalStats()` 查询 `content_type = 'source_citation'` 永远返回 0。

## 方案
修改 `hunterService.getSignalStats()` 中 `citations` 的统计逻辑：从「统计 content_type 为 source_citation 的记录数」改为「统计 source_url 非空的记录数」，即有来源链接的信号数量。

| 文件 | 改动 |
|------|------|
| `src/services/hunterService.ts` | `getSignalStats` 中 citations 查询改为 `.not("source_url", "is", null)` |

1 个文件，1 行逻辑改动。

