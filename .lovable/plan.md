

# 统一 Bridge 脚本 + `/codex` `/claude` 切换命令

## 概述
让一个 bridge 脚本同时配置好 Codex 和 Claude Code 两个后端，启动后默认用其中一个，用户在聊天中输入 `/codex` 或 `/claude` 即可实时切换。

## 实现步骤

### 1. 修改 bridge.py — 支持运行时切换后端
- 新增 `--backends` 参数，支持同时指定多个后端：`--backends claude,codex`
- 保留 `--backend` 作为默认启动后端
- 识别消息内容为 `/codex` 或 `/claude` 时，切换当前后端并回复确认，不转发给 CLI
- 用一个全局变量 `current_backend` 跟踪当前激活的后端

### 2. 前端添加斜杠命令（OpenClawChannel.tsx）
- 在 `SLASH_COMMANDS` 数组中新增：
  - `/codex` — 切换到 Codex 后端
  - `/claude` — 切换到 Claude Code 后端
- 这两个命令设为 `clientOnly: false`（发送到服务器，由 bridge 处理）

### 3. bridge.py 关键改动

```text
启动参数:
  python bridge.py \
    --supabase-url ... --connection-id ... --token ... \
    --backends claude,codex \
    --backend claude \        # 默认后端
    --work-dir ~/my-project \
    --dangerously-skip-permissions

消息处理流程:
  收到消息 → 检查是否为 /codex 或 /claude
    是 → 切换 current_backend, 回复 "✅ 已切换到 Codex CLI"
    否 → 用 current_backend 处理消息
```

### 技术细节

**bridge.py 改动点：**
- `parse_args()`: 新增 `--backends` 参数（逗号分隔），验证 `--backend` 在列表中
- `main()` 循环中：消息以 `/codex` 或 `/claude` 开头时，修改 `current_backend` 变量并直接 `send_reply` 确认
- 其余逻辑不变，只是从 `args.backend` 改为读 `current_backend`

**OpenClawChannel.tsx 改动点：**
- 导入 `Cpu` 图标（已有）或选用 `Terminal` / `Code` 图标
- 在 `SLASH_COMMANDS` 数组添加 `/codex` 和 `/claude` 两项，`clientOnly: false`

