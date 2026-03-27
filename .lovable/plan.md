

# 修复 Codex CLI 两个问题

## 问题分析

从截图看到两个问题：

1. **"Not inside a trusted directory and --skip-git-repo-check was not specified"** — `call_codex()` 没有传 `--skip-git-repo-check` 标志，Codex CLI 要求工作目录是受信任的 git 仓库
2. **Codex CLI 命令格式可能不对** — 当前用的是 `codex exec message`，需要确认实际 CLI 语法

## 修改方案

### `scripts/agent-bridge/bridge.py` — `call_codex()` 函数

1. **添加 `--skip-git-repo-check`** 标志到所有 codex 命令中，解决目录信任问题
2. **修正 Codex CLI 调用语法** — 根据 OpenAI Codex CLI 实际用法，命令应为：
   - 首次：`codex --skip-git-repo-check --quiet "message"`
   - 续接：`codex --skip-git-repo-check --quiet --resume "message"`
3. **复用 `--dangerously-skip-permissions` 参数**（Codex 对应 `--full-auto`），让 codex 也能自动批准操作

```text
修改前:
  cmd = ["codex", "exec", message]
  cmd = ["codex", "exec", "resume", "--last", message]

修改后:
  cmd = ["codex", "--skip-git-repo-check", "--quiet", message]
  cmd = ["codex", "--skip-git-repo-check", "--quiet", "--resume", message]
  # 如果 skip_permissions: 加 --full-auto
```

### 同时修改

- `parse_args()` 中的帮助文本：说明 `--dangerously-skip-permissions` 也影响 Codex（映射为 `--full-auto`）
- `call_codex()` 函数签名：增加 `skip_permissions` 参数
- `main()` 中调用 `call_codex` 时传入 `args.dangerously_skip_permissions`

涉及文件：`scripts/agent-bridge/bridge.py`（约改 20 行）

