

# 三个问题修复计划

## 问题分析

### 问题一：离线状态不准确
**根因**：`OpenClawChannel` 中的 `useOpenClawConnections` 只在组件挂载时加载一次连接数据，`last_synced_at` 永远是初始值。虽然 `statusNow` 每 5 秒更新，但 `activeConnection.last_synced_at` 始终是旧数据，所以总是显示离线。对比 `OpenClawSettings` 中有 `setInterval(() => reload(), 10_000)` 定时刷新。

**修复**：在 `OpenClawChannel` 中也添加定时 reload 逻辑 — 从 `useOpenClawConnections` 解构出 `reload`，当有 relay 连接时每 10 秒刷新一次。

### 问题二：连的 Codex 但回复说是 Claude
**根因**：这不是代码 bug。OpenAI Codex CLI 底层可以调用不同模型。当你运行 `codex exec` 时，Codex CLI 内部路由到了 Claude Opus 4.6（Codex 支持多种模型后端）。这是 Codex CLI 自身的配置问题，不是 bridge 脚本的问题。

**解决方案**：在 bridge 启动时传入 `--model` 参数或设置 Codex 的 `CODEX_MODEL` 环境变量来指定实际使用的模型。同时可以在 UI 的连接头部显示当前后端类型（如 "Codex CLI"）而非模型自报的名字。

### 问题三：UI 对话框布局问题
从截图看，用户气泡和 AI 气泡之间有过大的空白间距，且整体对话区域利用率不高。

**修复**：
- 减小消息间距（`space-y-5` → `space-y-3`）
- 用户消息气泡增加 `max-w` 约束，确保短消息不会过于靠右
- AI 消息气泡的宽度约束优化

---

## 实现步骤

### 1. 修复离线状态（OpenClawChannel.tsx）
- 从 `useOpenClawConnections` 解构 `reload`
- 添加 `useEffect`：当 `isActiveRelay` 为 true 时，每 10 秒调用 `reload()`

### 2. 显示后端类型标识（OpenClawChannel.tsx）
- 在连接名称旁添加后端模式标签（如 "中继"），让用户知道当前是中继模式
- 这不能解决 Codex vs Claude 的问题（那是 CLI 配置），但能提高透明度

### 3. 优化对话布局（OpenClawChannel.tsx）
- 调整消息区域间距
- 优化气泡最大宽度和对齐

