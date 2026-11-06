# TikTok 与 Threads 采集验证

研究工具直接使用产品里的 `TikHubClient`，不另写响应解析器。避免“网页正常、临时采集脚本为空”被误报为平台失效。

## 已核实的接口合同

- TikTok 搜索：`GET /api/v1/tiktok/app/v3/fetch_video_search_result`，参数 `keyword`、`region`；正文位于 `data.search_item_list[].aweme_info`。`aweme_list` 同时为空不代表没有结果；显式空 `search_item_list` 则保留为空。
- Threads 搜索：`GET /api/v1/threads/web/search_posts`，必填 `query`；错传 `keyword` 会返回 422，缺失字段为 `query.query`。
- Threads 评论：`GET /api/v1/threads/web/fetch_post_comments`，必填数字 `post_id`，新响应为 `data.edges[].node.thread_items[].post`；兼容旧 `comments/items/replies`。官方明确该接口不支持分页，`end_cursor` 不提供翻页能力。
- Threads 的 `pk` 用于评论查询，`code` 与用户名用于公开原文链接，二者不能混用。

官方合同来源：<https://api.tikhub.io/openapi.json>（2026-11-06 实时读取）。

## 本地真实验证

Node.js 22.6+，较早版本需要显式启用 TypeScript 类型擦除：

```bash
node --experimental-strip-types --env-file=.env.local \
  scripts/collect-tikhub-overseas.mjs \
  --out outputs/tikhub-tiktok-threads-verification.json
```

默认验证韩国 TikTok `사주` 和 Threads `kahve falı`。每个关键词最多一次搜索、两个帖子各一次评论请求；单次请求 30 秒超时，不重试。TikTok 使用供应商默认页大小 20，最多保存五条完整正文；Threads 同样最多保存五条。生成 JSON 和 Markdown，保留原文、原文链接、互动和评论，逐查询落盘。

可以指定自定义计划：

```json
[
  { "platform": "tiktok", "query": "kahve falı", "region": "TR" },
  { "platform": "threads", "query": "ofrenda mascotas" }
]
```

```bash
node --experimental-strip-types --env-file=.env.local \
  scripts/collect-tikhub-overseas.mjs \
  --plan /absolute/path/plan.json --out outputs/custom-research.json
```

Key 只从环境读取，不保存在脚本、命令示例或采集报告中。报告采用字段白名单，不保存完整供应商 envelope、账号元数据或内部追踪令牌。

## 本次真实结果

2026-11-06 修正后使用上述客户端和脚本：

| 平台 | 解析帖子数 | 保存正文数 | 已取得评论数 | API 调用数 |
| --- | ---: | ---: | ---: | ---: |
| TikTok | 20 | 5 | 10 | 3 |
| Threads | 19 | 5 | 5 | 3 |

这是有限采样；空评论、失败、正文为空分别记录，不根据 HTTP 200 推断采集完成。此前 Python 研究脚本造成的 TikTok 空解析和 Threads 422 不能作为平台不支持的证据；历史报告保留为旧采集快照，后续使用本工具复采。

本次 Threads 两个评论探测中，一个取得五条评论，另一个上游返回 HTTP 400，已在 JSON 和 Markdown 中保留失败状态；不能声称所有帖子的评论均通过。

## 部署

研究脚本在本机执行即可；Threads 评论代码需重新部署引用共享客户端的函数：

```bash
supabase functions deploy opportunity-discover validate-idea-stream verify-config \
  validate-idea recrawl-social crawler-scheduler scan-trending-topics
```

本次无数据库迁移，无前端变更。代码推送不等于线上函数已经部署。
