

## 为 Codex 后端添加会话保持能力

### 现状

- Claude 后端：每个 OpenClaw session 映射一个本地子目录，使用 `--continue` 自动续接会话
- Codex 后端：每次调用 `codex exec "message"`，无状态，上下文丢失

### Codex 会话保持机制

Codex CLI 支持 `codex exec resume --last "follow-up prompt"` 来续接上一次 exec 会话。方案：

1. **维护 session 映射**：用一个 `_codex_session_started` 字典记录每个 OpenClaw session_id 是否已发起过 Codex exec
2. **首次调用**：使用 `codex exec "message"` 启动新会话，设在对应 work_dir 子目录下执行
3. **后续调用**：使用 `codex exec resume --last "message"` 续接同目录下最近的会话
4. **目录隔离**：与 Claude 后端相同策略，每个 session 使用 `.openclaw-sessions/{session_id[:8]}` 子目录，确保 `--last` 能正确定位到该 session 的会话

### 文件变更

| 文件 | 操作 |
|------|------|
| `scripts/agent-bridge/bridge.py` | 修改 `call_codex`：添加 session 目录映射 + 首次/续接判断逻辑 |

### 关键代码逻辑

```python
_codex_session_started: dict[str, bool] = {}

def call_codex(message, session_id, work_dir, ...):
    session_dir = _get_codex_session_dir(session_id, work_dir)
    
    if session_id in _codex_session_started:
        # 续接：resume --last + 追加 prompt
        cmd = ["codex", "exec", "resume", "--last", message]
    else:
        # 首次：正常 exec
        cmd = ["codex", "exec", message]
        _codex_session_started[session_id] = True
    
    proc = subprocess.Popen(cmd, cwd=session_dir, ...)
    _stream_subprocess_output(proc, ...)
```

复用现有的 `_get_claude_session_dir` 逻辑提取为通用的 `_get_session_dir`，供两个 CLI 后端共用。

