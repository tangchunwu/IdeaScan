# IdeaScan 外部 API

API Key 在“API 配置中心 → 外部 API Key”创建。完整 Key 只在创建时显示一次，调用方只需要 IdeaScan Key；TikHub、Tavily、You.com 和系统 LLM Key 由服务端配置池读取。

## 认证

支持以下任一种方式：

```http
Authorization: Bearer is_live_...
```

或：

```http
X-IdeaScan-Key: is_live_...
```

## AI 直接接入（推荐）

把以下地址和 API Key 配给你的 AI 工具即可：

```text
POST {SUPABASE_URL}/functions/v1/external-api
Header: X-IdeaScan-Key: is_live_...
```

统一请求格式：

```json
{
  "operation": "discover_opportunities",
  "input": {
    "country": "South Korea",
    "countryCode": "KR",
    "language": "ko",
    "industry": "consumer apps",
    "keyword": "wish rituals",
    "platforms": ["tiktok", "reddit", "youtube"],
    "mode": "deep",
    "opportunityType": "ritual",
    "valueModel": "entertainment"
  }
}
```

需求验证只需要把 operation 改为 `validate_idea`：

```json
{
  "operation": "validate_idea",
  "input": {
    "idea": "A Korean wish ritual companion app",
    "tags": ["ritual", "Korea"],
    "config": { "mode": "deep", "marketContext": { "country": "South Korea", "countryCode": "KR", "language": "ko", "opportunityType": "ritual", "valueModel": "entertainment" } }
  }
}
```

这个统一入口返回稳定 JSON：`success`、`operation`、`data`、`error`。AI 不需要处理 SSE，也不需要知道内部有几个 Supabase Function。

OpenAPI 描述可直接读取：

```text
GET {SUPABASE_URL}/functions/v1/external-api
```

## 商机挖掘

```bash
curl -X POST "$SUPABASE_URL/functions/v1/opportunity-discover" \
  -H "Authorization: Bearer $IDEASCAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "country": "South Korea",
    "countryCode": "KR",
    "language": "ko",
    "industry": "consumer apps",
    "keyword": "wish rituals",
    "platforms": ["tiktok", "reddit", "youtube"],
    "mode": "deep",
    "opportunityType": "ritual",
    "valueModel": "entertainment"
  }'
```

返回内容与网页商机雷达一致，包括 `candidates`、原文 `evidence`、`support`、`counter`、`unknowns`、`quality` 和 `warnings`。

## 需求验证（底层 SSE 入口）

需求验证使用 SSE：

```bash
curl -N -X POST "$SUPABASE_URL/functions/v1/validate-idea-stream" \
  -H "Authorization: Bearer $IDEASCAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "A Korean wish ritual companion app",
    "tags": ["ritual", "Korea"],
    "config": {
      "mode": "deep",
      "overseasPlatforms": ["tiktok", "reddit"],
      "marketContext": {
        "country": "South Korea",
        "countryCode": "KR",
        "language": "ko",
        "opportunityType": "ritual",
        "valueModel": "entertainment"
      }
    }
  }'
```

响应是 `text/event-stream`，事件包括 `progress`、`complete` 和 `error`。API Key 默认拥有 `opportunity:read` 和 `validation:run` 两个 scope。

## 边界

- API 读取的是系统配置池，不会把供应商 Key 返回给调用方。
- `reported_purchase` 或 `paid_intent` 仍然只是公开资料中的付费信号，不代表 IdeaScan 已验证真实付款。
- 外部 API 请求会写入所属用户的验证记录，并继续使用该用户的额度和 RLS 边界。
