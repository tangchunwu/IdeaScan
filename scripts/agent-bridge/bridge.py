#!/usr/bin/env python3
"""
OpenClaw Agent Bridge — 多后端本地桥接脚本

支持三种后端模式：
  --backend openai   → 调用 OpenAI 兼容 HTTP API（默认）
  --backend claude   → 子进程调用 Claude Code CLI（有状态会话）
  --backend codex    → 子进程调用 Codex CLI

支持运行时切换：
  启动时用 --backends claude,codex 同时配置多个后端
  聊天中输入 /codex 或 /claude 即可实时切换

用法:
  # 同时配置 Claude + Codex，默认用 Claude
  python bridge.py \
    --supabase-url https://xxx.supabase.co \
    --connection-id <uuid> --token <token> \
    --backends claude,codex --backend claude \
    --work-dir ~/my-project --dangerously-skip-permissions

  # 单后端模式（向后兼容）
  python bridge.py \
    --supabase-url https://xxx.supabase.co \
    --connection-id <uuid> --token <token> \
    --backend claude --work-dir ~/my-project

  # OpenAI 兼容 API 后端
  python bridge.py \
    --supabase-url https://xxx.supabase.co \
    --connection-id <uuid> --token <token> \
    --backend openai --agent-url http://localhost:11434

依赖:
  pip install requests
"""

import argparse
import json
import os
import subprocess
import time
import sys
import threading
import requests

# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="OpenClaw Agent Bridge")
    p.add_argument("--supabase-url", required=True, help="Supabase project URL")
    p.add_argument("--connection-id", required=True, help="Connection UUID")
    p.add_argument("--token", required=True, help="Connection token")
    p.add_argument("--poll-interval", type=float, default=2.0, help="Poll interval in seconds")

    # Backend selection
    p.add_argument("--backend", choices=["openai", "claude", "codex"], default="claude",
                   help="Default agent backend type (default: claude)")
    p.add_argument("--backends", default=None,
                   help="Comma-separated list of available backends (e.g. claude,codex). "
                        "Enables runtime switching via /codex and /claude commands.")

    # OpenAI backend options
    p.add_argument("--agent-url", default=None, help="Local agent URL (OpenAI compatible, required for --backend openai)")
    p.add_argument("--model", default="default", help="Model name for OpenAI backend")
    p.add_argument("--stream", action="store_true", default=True, help="Enable streaming for OpenAI backend")
    p.add_argument("--no-stream", action="store_false", dest="stream", help="Disable streaming for OpenAI backend")

    # CLI backend options (claude / codex)
    p.add_argument("--work-dir", default=".", help="Working directory for CLI backends (default: current dir)")
    p.add_argument("--dangerously-skip-permissions", action="store_true",
                   help="Pass --dangerously-skip-permissions to Claude Code CLI / --full-auto to Codex CLI")
    p.add_argument("--cli-timeout", type=int, default=300, help="CLI subprocess timeout in seconds (default: 300)")

    args = p.parse_args()

    # Parse --backends into a set
    if args.backends:
        args.available_backends = set(b.strip() for b in args.backends.split(","))
        if args.backend not in args.available_backends:
            p.error(f"--backend '{args.backend}' must be in --backends '{args.backends}'")
    else:
        args.available_backends = {args.backend}

    if "openai" in args.available_backends and not args.agent_url:
        p.error("--agent-url is required when using openai backend")

    return args

# ---------------------------------------------------------------------------
# Remote communication helpers (poll / reply)
# ---------------------------------------------------------------------------

def poll_messages(base_url, connection_id, token):
    """Poll for pending messages from the server."""
    url = f"{base_url}/functions/v1/openclaw-poll"
    try:
        resp = requests.post(url, json={
            "connection_id": connection_id,
            "token": token,
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("messages", []), data.get("context", {})
        else:
            print(f"[poll] Error {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
    except requests.exceptions.RequestException as e:
        print(f"[poll] Network error: {e}", file=sys.stderr)
    return [], {}


def send_reply(base_url, connection_id, token, session_id, content,
               message_id=None, streaming=False, done=False):
    """Send a reply back to the server."""
    url = f"{base_url}/functions/v1/openclaw-reply"
    body = {
        "connection_id": connection_id,
        "token": token,
        "content": content,
    }
    if session_id:
        body["session_id"] = session_id
    if message_id:
        body["message_id"] = message_id
    if streaming:
        body["streaming"] = True
        body["done"] = done
    try:
        resp = requests.post(url, json=body, timeout=30)
        if resp.status_code != 200:
            print(f"[reply] Error {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            return None
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"[reply] Network error: {e}", file=sys.stderr)
        return None

# ---------------------------------------------------------------------------
# Backend: OpenAI-compatible HTTP API
# ---------------------------------------------------------------------------

def call_openai_streaming(agent_url, messages, model, base_url, connection_id, token,
                          session_id, user_message_id):
    url = f"{agent_url.rstrip('/')}/v1/chat/completions"
    try:
        resp = requests.post(url, json={
            "model": model, "messages": messages, "stream": True,
        }, stream=True, timeout=120)

        if resp.status_code != 200:
            send_reply(base_url, connection_id, token, session_id,
                       f"Agent 错误 {resp.status_code}: {resp.text[:200]}",
                       message_id=user_message_id)
            return

        result = send_reply(base_url, connection_id, token, session_id, "...", message_id=None)
        reply_msg_id = result.get("message_id") if result else None

        accumulated = ""
        last_update = time.time()

        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data = line[6:].strip()
            if data == "[DONE]":
                break
            try:
                parsed = json.loads(data)
                delta = parsed.get("choices", [{}])[0].get("delta", {}).get("content", "")
                if delta:
                    accumulated += delta
                    if reply_msg_id and (time.time() - last_update) >= 0.5:
                        send_reply(base_url, connection_id, token, session_id, accumulated,
                                   message_id=reply_msg_id, streaming=True, done=False)
                        last_update = time.time()
            except json.JSONDecodeError:
                continue

        if accumulated.strip() and reply_msg_id:
            send_reply(base_url, connection_id, token, session_id, accumulated.strip(),
                       message_id=reply_msg_id, streaming=True, done=True)
        elif accumulated.strip():
            send_reply(base_url, connection_id, token, session_id, accumulated.strip(),
                       message_id=user_message_id)

    except requests.exceptions.RequestException as e:
        send_reply(base_url, connection_id, token, session_id,
                   f"连接本地 Agent 失败: {e}", message_id=user_message_id)


def call_openai_non_streaming(agent_url, messages, model, base_url, connection_id, token,
                               session_id, user_message_id):
    url = f"{agent_url.rstrip('/')}/v1/chat/completions"
    try:
        resp = requests.post(url, json={
            "model": model, "messages": messages, "stream": False,
        }, timeout=120)

        if resp.status_code != 200:
            send_reply(base_url, connection_id, token, session_id,
                       f"Agent 错误 {resp.status_code}: {resp.text[:200]}",
                       message_id=user_message_id)
            return

        content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        if content:
            send_reply(base_url, connection_id, token, session_id, content,
                       message_id=user_message_id)

    except requests.exceptions.RequestException as e:
        send_reply(base_url, connection_id, token, session_id,
                   f"连接本地 Agent 失败: {e}", message_id=user_message_id)

# ---------------------------------------------------------------------------
# Backend: Claude Code CLI (stateful sessions via --continue)
# ---------------------------------------------------------------------------

# Maps OpenClaw session_id → local session directory (shared by Claude & Codex)
_session_dirs: dict[str, str] = {}

# Tracks whether a Codex session has been started (for resume logic)
_codex_session_started: dict[str, bool] = {}


def _get_session_dir(session_id: str, work_dir: str) -> str:
    """Get or create a working directory for a CLI session (Claude or Codex)."""
    if session_id not in _session_dirs:
        session_dir = os.path.join(work_dir, ".openclaw-sessions", session_id[:8])
        os.makedirs(session_dir, exist_ok=True)
        _session_dirs[session_id] = session_dir
    return _session_dirs[session_id]


def call_claude(message: str, session_id: str, work_dir: str, timeout: int,
                skip_permissions: bool,
                base_url: str, connection_id: str, token: str,
                user_message_id: str):
    """Call Claude Code CLI with streaming output relay."""
    session_dir = _get_session_dir(session_id, work_dir)

    cmd = ["claude", "-p", message, "--continue"]
    if skip_permissions:
        cmd.append("--dangerously-skip-permissions")

    try:
        proc = subprocess.Popen(
            cmd, cwd=session_dir,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )

        _stream_subprocess_output(
            proc, timeout,
            base_url, connection_id, token, session_id, user_message_id,
        )

    except FileNotFoundError:
        send_reply(base_url, connection_id, token, session_id,
                   "❌ 未找到 `claude` 命令，请确认已安装 Claude Code CLI 并在 PATH 中。",
                   message_id=user_message_id)
    except Exception as e:
        send_reply(base_url, connection_id, token, session_id,
                   f"❌ Claude 调用失败: {e}", message_id=user_message_id)

# ---------------------------------------------------------------------------
# Backend: Codex CLI
# ---------------------------------------------------------------------------

def call_codex(message: str, session_id: str, work_dir: str, timeout: int,
               skip_permissions: bool,
               base_url: str, connection_id: str, token: str,
               user_message_id: str):
    """Call Codex CLI with streaming output relay and session persistence."""
    abs_work_dir = os.path.abspath(work_dir)

    cmd = ["codex", "--skip-git-repo-check", "--quiet"]
    if skip_permissions:
        cmd.append("--full-auto")
    if session_id in _codex_session_started:
        cmd.append("--resume")
    else:
        _codex_session_started[session_id] = True
    cmd.append(message)

    try:
        proc = subprocess.Popen(
            cmd, cwd=abs_work_dir,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )

        _stream_subprocess_output(
            proc, timeout,
            base_url, connection_id, token, session_id, user_message_id,
        )

    except FileNotFoundError:
        send_reply(base_url, connection_id, token, session_id,
                   "❌ 未找到 `codex` 命令，请确认已安装 Codex CLI 并在 PATH 中。",
                   message_id=user_message_id)
    except Exception as e:
        send_reply(base_url, connection_id, token, session_id,
                   f"❌ Codex 调用失败: {e}", message_id=user_message_id)

# ---------------------------------------------------------------------------
# Shared: stream subprocess stdout → openclaw-reply
# ---------------------------------------------------------------------------

def _stream_subprocess_output(proc, timeout,
                              base_url, connection_id, token, session_id,
                              user_message_id):
    """Read subprocess stdout line-by-line and relay via openclaw-reply with streaming."""

    # Create a placeholder message for streaming updates
    result = send_reply(base_url, connection_id, token, session_id, "⏳ 处理中...",
                        message_id=None)
    reply_msg_id = result.get("message_id") if result else None

    accumulated = ""
    last_update = time.time()
    UPDATE_INTERVAL = 0.5

    # Read stderr in background so it doesn't block
    stderr_lines = []
    def _read_stderr():
        for line in iter(proc.stderr.readline, ""):
            stderr_lines.append(line)
    stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
    stderr_thread.start()

    try:
        for line in iter(proc.stdout.readline, ""):
            accumulated += line
            now = time.time()
            if reply_msg_id and (now - last_update) >= UPDATE_INTERVAL:
                send_reply(base_url, connection_id, token, session_id, accumulated,
                           message_id=reply_msg_id, streaming=True, done=False)
                last_update = now

        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        accumulated += "\n\n⚠️ 超时，进程已终止。"

    # Final content
    final_content = accumulated.strip()
    if not final_content:
        stderr_text = "".join(stderr_lines).strip()
        final_content = f"⚠️ 无输出。\nstderr: {stderr_text}" if stderr_text else "⚠️ 无输出。"

    if reply_msg_id:
        send_reply(base_url, connection_id, token, session_id, final_content,
                   message_id=reply_msg_id, streaming=True, done=True)
    else:
        send_reply(base_url, connection_id, token, session_id, final_content,
                   message_id=user_message_id)

# ---------------------------------------------------------------------------
# Slash command: runtime backend switching
# ---------------------------------------------------------------------------

BACKEND_LABELS = {
    "openai": "OpenAI API",
    "claude": "Claude Code CLI",
    "codex": "Codex CLI",
}

SWITCH_COMMANDS = {
    "/codex": "codex",
    "/claude": "claude",
    "/openai": "openai",
}


def try_handle_switch(user_content: str, available_backends: set,
                      current_backend: str,
                      base_url: str, connection_id: str, token: str,
                      session_id: str, msg_id: str) -> str | None:
    """Check if the message is a backend-switch slash command.
    Returns the new backend name if switched, or None if not a switch command."""
    cmd = user_content.strip().split()[0].lower() if user_content.strip() else ""
    target = SWITCH_COMMANDS.get(cmd)
    if not target:
        return None

    if target not in available_backends:
        send_reply(base_url, connection_id, token, session_id,
                   f"⚠️ 后端 `{target}` 未配置。可用后端: {', '.join(sorted(available_backends))}",
                   message_id=msg_id)
        return current_backend  # no change, but handled

    if target == current_backend:
        send_reply(base_url, connection_id, token, session_id,
                   f"ℹ️ 当前已经是 {BACKEND_LABELS.get(target, target)} 后端。",
                   message_id=msg_id)
        return current_backend

    send_reply(base_url, connection_id, token, session_id,
               f"✅ 已切换到 **{BACKEND_LABELS.get(target, target)}** 后端。",
               message_id=msg_id)
    return target

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    current_backend = args.backend

    print(f"🔗 OpenClaw Agent Bridge 启动")
    print(f"   默认后端: {BACKEND_LABELS.get(current_backend, current_backend)}")
    print(f"   可用后端: {', '.join(sorted(args.available_backends))}")
    if "openai" in args.available_backends:
        print(f"   Agent:    {args.agent_url}")
    if args.available_backends & {"claude", "codex"}:
        print(f"   工作目录: {os.path.abspath(args.work_dir)}")
    print(f"   连接ID:   {args.connection_id}")
    print(f"   轮询间隔: {args.poll_interval}s")
    if "claude" in args.available_backends:
        print(f"   跳过权限: {'是' if args.dangerously_skip_permissions else '否'}")
    print()

    while True:
        try:
            messages, context = poll_messages(args.supabase_url, args.connection_id, args.token)

            if not messages:
                time.sleep(args.poll_interval)
                continue

            print(f"📨 收到 {len(messages)} 条待处理消息")

            for msg in messages:
                session_id = msg["session_id"]
                user_content = msg["content"]
                msg_id = msg["id"]

                print(f"  → [{current_backend}] 处理消息 [{msg_id[:8]}]: {user_content[:50]}...")

                # Check for backend-switch slash commands
                switch_result = try_handle_switch(
                    user_content, args.available_backends, current_backend,
                    args.supabase_url, args.connection_id, args.token,
                    session_id, msg_id,
                )
                if switch_result is not None:
                    if switch_result != current_backend:
                        print(f"  🔄 后端切换: {current_backend} → {switch_result}")
                    current_backend = switch_result
                    continue

                # Dispatch to active backend
                if current_backend == "openai":
                    chat_messages = [
                        {"role": "system", "content": "你是用户的 AI Agent 助手。"},
                    ]
                    for h in context.get(session_id, []):
                        chat_messages.append({"role": h["role"], "content": h["content"]})
                    chat_messages.append({"role": "user", "content": user_content})

                    if args.stream:
                        call_openai_streaming(
                            args.agent_url, chat_messages, args.model,
                            args.supabase_url, args.connection_id, args.token,
                            session_id, msg_id,
                        )
                    else:
                        call_openai_non_streaming(
                            args.agent_url, chat_messages, args.model,
                            args.supabase_url, args.connection_id, args.token,
                            session_id, msg_id,
                        )

                elif current_backend == "claude":
                    call_claude(
                        user_content, session_id, args.work_dir, args.cli_timeout,
                        args.dangerously_skip_permissions,
                        args.supabase_url, args.connection_id, args.token,
                        msg_id,
                    )

                elif current_backend == "codex":
                    call_codex(
                        user_content, session_id, args.work_dir, args.cli_timeout,
                        args.supabase_url, args.connection_id, args.token,
                        msg_id,
                    )

                print(f"  ✓ 消息 [{msg_id[:8]}] 处理完成")

        except KeyboardInterrupt:
            print("\n🛑 Bridge 已停止")
            sys.exit(0)
        except Exception as e:
            print(f"[main] 未预期错误: {e}", file=sys.stderr)
            time.sleep(args.poll_interval)


if __name__ == "__main__":
    main()
