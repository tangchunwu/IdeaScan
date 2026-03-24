

## 问题分析

你说得对。看了 `openclaw-chat/index.ts` 的代码，问题很清楚：

**第 154-159 行**：系统消息把你在"设置"里配置的生图 API（`imageGenBaseUrl`, `imageGenApiKey`, `imageGenModel`）注入到了发给 OpenClaw Agent 的 system prompt 里，指示 Agent 用这个 API 去生图。

```
systemContent += `\n\n## 图片生成配置\n用户已配置图片生成服务...
- API 地址: ${imageGenConfig.baseUrl}
- 模型: ${imageGenConfig.model}
- API Key: ${imageGenConfig.apiKey}
请通过 OpenAI 兼容的 chat/completions 接口调用...`
```

这导致：
1. Agent 不用自己内置的生图能力，而是去调用你配置的那个外部 API
2. 那个外部 API 有限流/503 问题，所以生图经常失败
3. 你的 OpenClaw Agent 本身就有生图模型，根本不需要这个注入

网络日志也证实了这一点 — Agent 回复"图生接口刚刚 503 了一次，我换个方式再试"，说明它在用注入的 API 而非自己的能力。

## 修复方案

**移除 system prompt 中的图片生成配置注入**（`openclaw-chat/index.ts`）

- 删除 `getImageGenConfig()` 调用及相关的 system prompt 拼接逻辑（第 155-159 行）
- 保持 system prompt 简洁：`你是用户的 AI Agent 助手。`
- 让 OpenClaw Agent 使用自己内置的生图能力

`getImageGenConfig` 函数本身保留（`generate-persona-image` 等其他功能可能用到），只是不在 openclaw-chat 中调用。

### 改动文件

| 文件 | 改动 |
|------|------|
| `supabase/functions/openclaw-chat/index.ts` | 移除第 155-159 行的 imageGenConfig 注入逻辑 |

