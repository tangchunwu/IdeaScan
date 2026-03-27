

## 中继模式（Relay Mode）实现计划

### 概述
让没有公网 IP 的本地电脑也能作为 Agent 服务器，通过数据库消息队列 + 长轮询实现双向通信。

### 架构

```text
当前（直连）: 网页 → Edge Function → HTTP → Agent(需公网IP)
新增（中继）: 网页 → Edge Function → 写DB(pending) → 本地脚本轮询拉取
                                                          ↓
              网页 ← Realtime订阅 ← 本地脚本写回DB(delivered)
```

---

### 第一步：数据库改造

1. `openclaw_connections` 加 `mode` 列（`direct` | `relay`，默认 `direct`）
2. `openclaw_messages` 加 `status` 列（`delivered` | `pending` | `processing`，默认 `delivered`）
3. 开启 `openclaw_messages` 的 Realtime 推送
4. 给 `openclaw_messages` 加 service_role 的 ALL 权限策略（供 poll/reply Edge Function 使用）

### 第二步：新建 Edge Function — `openclaw-poll`

- **无 JWT 验证**（Agent 用 connection token 认证）
- 接收 `connection_id` + `token`，校验匹配
- 查询 `status='pending'` 的消息，标记为 `processing`，返回消息列表
- 同时返回该 session 的历史消息作为上下文

### 第三步：新建 Edge Function — `openclaw-reply`

- **无 JWT 验证**（Agent 用 connection token 认证）
- 接收 `connection_id` + `token` + `message_id` + `content`
- 写入 assistant 消息到 `openclaw_messages`（status=`delivered`）
- 支持 `streaming: true` 参数做增量更新（Agent 分块写入 content）

### 第四步：修改 `openclaw-chat` Edge Function

- 解析连接的 `mode` 字段
- `mode='direct'`：保持现有逻辑不变
- `mode='relay'`：只写入用户消息到数据库（status=`pending`），立即返回 `{ relay: true }`

### 第五步：修改前端 `useOpenClawChat.ts`

- 当 `mode='relay'` 时，发送消息后不等待 SSE 流
- 使用 Supabase Realtime 订阅 `openclaw_messages` 表的 INSERT 事件
- 过滤 `session_id` 匹配的 assistant 消息，实时追加到聊天列表
- 支持流式效果（监听 UPDATE 事件，Agent 分块更新 content）

### 第六步：修改前端 `OpenClawSettings.tsx`

- 添加连接表单增加"模式"单选：直连 / 中继
- 中继模式下隐藏 URL 输入（不需要），显示 `connection_id` 和自动生成的 token
- 提供"复制启动命令"按钮

### 第七步：本地 Bridge 脚本

创建 `scripts/agent-bridge/bridge.py`：
- 命令行参数：`--supabase-url`, `--connection-id`, `--token`, `--agent-url`（本地 Agent 地址）
- 循环长轮询 `openclaw-poll`，拿到 pending 消息
- 调用本地 Agent 的 `/v1/chat/completions`
- 通过 `openclaw-reply` 写回结果
- 支持流式转发（Agent 流式返回 → 分块调用 reply）

---

### 文件变更清单

| 文件 | 操作 |
|------|------|
| 数据库迁移 | `openclaw_connections` 加 `mode`；`openclaw_messages` 加 `status`；开启 Realtime；加 service_role 策略 |
| `supabase/functions/openclaw-poll/index.ts` | 新建 |
| `supabase/functions/openclaw-reply/index.ts` | 新建 |
| `supabase/functions/openclaw-chat/index.ts` | 修改：支持 relay 模式 |
| `supabase/config.toml` | 添加 poll/reply 的 `verify_jwt = false` |
| `src/hooks/useOpenClawChat.ts` | 修改：加 Realtime 订阅 |
| `src/hooks/useOpenClawConnections.ts` | 修改：类型加 `mode` 字段 |
| `src/components/openclaw/OpenClawSettings.tsx` | 修改：模式选择 UI |
| `scripts/agent-bridge/bridge.py` | 新建 |
| `scripts/agent-bridge/requirements.txt` | 新建 |

### 安全设计

- `openclaw-poll` 和 `openclaw-reply` 通过 `connection_id` + `token` 双重验证
- 只能操作属于该连接的消息
- 使用 service_role client 在 Edge Function 内部操作，RLS 不影响
- 中继模式下自动生成 token（如果用户未设置）

