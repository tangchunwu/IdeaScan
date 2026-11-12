# 多媒体与搜索提供商配置契约

系统配置池现在把“提供商地址”和“具体请求协议”分开保存。

## 协议

- `openai_chat`：OpenAI Chat Completions 风格文本接口。
- `openai_images`：OpenAI Images API，生成请求使用 `/v1/images/generations`。
- `openai_videos`：OpenAI Videos/Sora 风格异步任务接口预留。
- `openai_compatible`：兼容 OpenAI 的文本或多模态 Chat 接口。
- `search_tavily`、`search_bocha`、`search_you`：专用搜索 API。
- `custom`：需要单独适配的供应商协议。

## Base URL 规则

后台统一保存服务根地址，例如：

```text
https://api.openai.com/v1
https://api.perplexity.ai
https://ai.gateway.lovable.dev/v1
```

即使误填了下面这些完整路径，后端也会先规范化再拼接：

```text
/chat/completions
/images/generations
/images/edits
/videos
/models
```

因此不要把某个具体操作 endpoint 当成长期 Base URL。模型和协议决定最终请求路径。

## 图片配置示例

OpenAI 官方图片：

```text
Base URL: https://api.openai.com/v1
Protocol: openai_images
Model: gpt-image-2.5-flare
```

OpenAI 兼容的聊天式图片网关：

```text
Base URL: https://your-gateway.example/v1
Protocol: openai_compatible
Model: <网关提供的图片模型>
```

两者请求体和响应结构不同，不能只靠模型名称猜接口。图片池测试会先检查根 `/models`，真正生成时再按协议选择 Images API 或 Chat Completions。

## 视频预留

视频池已经支持保存 `openai_videos` 协议和模型配置，但具体创建、轮询、下载仍应由视频函数实现，不能把视频接口当成同步图片接口调用。
