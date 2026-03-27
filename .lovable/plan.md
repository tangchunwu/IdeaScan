

## 改造 Bridge 脚本支持 CLI 子进程模式（Claude Code + Codex）

### 核心思路

当前 `bridge.py` 只支持调用 OpenAI 兼容的 HTTP API。改造为支持三种后端模式：

```text
--backend openai   → 现有逻辑，调用 /v1/chat/completions（保留）
--backend claude   → 子进程调用 claude -p "message" --continue
--backend codex    → 子进程调用 codex exec "message"
```

### Claude Code 的会话保持

Claude Code CLI 原生支持 `--continue` 和 `--resume` 标志：
- `claude -p "message" -c` — 自动续接当前目录下的最近会话
- `claude -p "message" -r <session-id>` — 恢复指定会话

Bridge 为每个 OpenClaw session 映射一个 Claude Code 本地 session，利用 `--continue` 实现有状态对话，无需手动管理上下文。

### Codex 的调用

Codex CLI 使用 `codex exec "message"` 执行单次任务，输出到 stdout。

### 实现方案

**只改一个文件：`scripts/agent-bridge/bridge.py`**

1. 新增 `--backend` 参数：`openai`（默认）、`claude`、`codex`
2. 新增 `--work-dir` 参数：CLI 工具的工作目录（默认当前目录）
3. 新增 `--dangerously-skip-permissions` 标志：透传给 claude，跳过权限确认

#### Claude 后端逻辑
```python
def call_claude(message, session_id, work_dir):
    # 每个 OpenClaw session 对应一个 work_dir 子目录
    session_dir = os.path.join(work_dir, f".openclaw-sessions/{session_id[:8]}")
    os.makedirs(session_dir, exist_ok=True)
    
    cmd = ["claude", "-p", message, "--continue"]
    # 可选: --dangerously-skip-permissions
    
    proc = subprocess.Popen(cmd, cwd=session_dir,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate(timeout=300)
    return stdout.decode("utf-8")
```

#### Codex 后端逻辑
```python
def call_codex(message, work_dir):
    cmd = ["codex", "exec", message]
    proc = subprocess.Popen(cmd, cwd=work_dir,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate(timeout=300)
    return stdout.decode("utf-8")
```

#### 流式输出
- 使用 `subprocess.Popen` + 逐行读取 `stdout`
- 每 0.5s 通过 `openclaw-reply` 推送增量内容
- CLI 输出完成后发送 `done=True` 最终更新

### 用法示例

```bash
# 使用 Claude Code 作为后端
python bridge.py \
  --supabase-url https://xxx.supabase.co \
  --connection-id <uuid> \
  --token <token> \
  --backend claude \
  --work-dir ~/my-project \
  --dangerously-skip-permissions

# 使用 Codex 作为后端
python bridge.py \
  --supabase-url https://xxx.supabase.co \
  --connection-id <uuid> \
  --token <token> \
  --backend codex \
  --work-dir ~/my-project

# 仍然支持 OpenAI API（现有逻辑）
python bridge.py \
  --supabase-url https://xxx.supabase.co \
  --connection-id <uuid> \
  --token <token> \
  --backend openai \
  --agent-url http://localhost:11434
```

### 文件变更

| 文件 | 操作 |
|------|------|
| `scripts/agent-bridge/bridge.py` | 重构：新增 claude/codex 子进程后端，保留 openai 后端 |

前端和 Edge Function 无需改动 — 传输层（poll/reply）已经完成，只是改变本地 bridge 调用 Agent 的方式。

