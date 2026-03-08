

# 改进 OpenClaw 集成：利用 Agent 内置能力

## 核心理念

当前集成把 OpenClaw 当成简单聊天代理。实际上 OpenClaw 是一个完整的 AI Agent，内置了发帖、生图、搜索、文件读写等工具。我们应该：
- **不在 IdeaScan 重建这些能力**，而是发送正确的任务指令让 Agent 自主编排
- 支持 Agent 返回的工具调用结果（图片、状态更新等）在聊天中展示

## 修改方案

### 1. 升级快捷任务模板 — `OpenClawChannel.tsx`

替换现有 3 个简单 prompt 为更完整的任务流模板：

| 模板 | Prompt 内容 |
|------|------------|
| 📝 一键发小红书 | "请基于我的验证数据，完成以下任务流：1) 写一篇小红书种草文案 2) 生成配图 3) 发布到小红书。请依次使用你的工具完成。" |
| 🎨 生成营销图 | "请为我的产品生成一组适合小红书/朋友圈的营销配图，风格现代简洁。" |
| 🔍 竞品深度调研 | "请联网搜索我的竞品信息，分析差异化机会，输出调研报告并保存到 workspace。" |
| 💡 头脑风暴 | "请头脑风暴 5 个产品变体方向，评估可行性，将结果保存为 workspace/ideas.md。" |

### 2. 支持 Agent 工具调用结果展示 — `useOpenClawChat.ts` + `OpenClawChannel.tsx`

OpenClaw 流式返回中可能包含 tool_calls 和图片结果。需要：

- **解析 SSE 中的 tool_calls delta**：当 `delta.tool_calls` 存在时，累积并展示工具调用状态（如 "正在生成图片..."、"正在发布帖子..."）
- **渲染图片结果**：当消息内容包含 base64 图片或 URL 时，在聊天气泡中渲染 `<img>`
- **工具状态指示器**：在流式过程中显示当前 Agent 正在使用的工具名称

### 3. 报告页任务选择器 — `ReportHeader.tsx`

当前 `handleSendToAgent` 固定发小红书文案 prompt。改为弹出一个选择菜单：
- 📝 写小红书文案并发布
- 🎨 生成营销素材
- 📊 深度竞品调研
- 💡 头脑风暴变体

每个选项调用 `buildOpenClawPrompt(context, taskType)` 生成不同的任务指令。

### 4. 更新 Prompt 模板 — `buildOpenClawContext.ts`

在 `buildOpenClawPrompt` 中增加任务类型，prompt 明确告知 Agent 使用内置工具：

```text
// xiaohongshu_publish 任务示例
请基于以上数据完成完整发布流程：
1. 撰写小红书种草文案（标题+正文+标签）
2. 使用你的图片生成工具，为文案生成 1-3 张配图
3. 使用你的小红书发布工具，将文案和配图发布
每完成一步请告诉我进度。
```

### 5. 边缘函数适配 — `openclaw-chat/index.ts`

当前只透传 `delta.content`。需要同时透传 `delta.tool_calls` 数据，让前端能展示工具调用过程。无需修改请求格式，只需确保 SSE 完整透传（当前已经是 chunk 直传，理论上已支持）。

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/components/openclaw/OpenClawChannel.tsx` | 升级任务模板、添加图片/工具状态渲染 |
| `src/hooks/useOpenClawChat.ts` | 解析 tool_calls delta、支持图片消息 |
| `src/lib/buildOpenClawContext.ts` | 增加任务类型 prompt（publish、image、research） |
| `src/components/report/ReportHeader.tsx` | 任务选择菜单替代单一按钮 |

共修改 4 个文件，无后端变更（SSE 已完整透传）。

