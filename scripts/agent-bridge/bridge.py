#!/usr/bin/env python3
"""
OpenClaw Agent Bridge — 中继模式本地桥接脚本

将本地 Agent（OpenAI 兼容 API）连接到远程 IdeaScan，无需公网 IP。

用法:
  python bridge.py \
    --supabase-url https://xxx.supabase.co \
    --connection-id <uuid> \
    --token <your-token> \
    --agent-url http://localhost:11434  # 本地 Agent 地址

依赖:
  pip install requests
"""

import argparse
import json
import time
import sys
import requests

def parse_args():
    p = argparse.ArgumentParser(description="OpenClaw Agent Bridge")
    p.add_argument("--supabase-url", required=True, help="Supabase project URL")
    p.add_argument("--connection-id", required=True, help="Connection UUID")
    p.add_argument("--token", required=True, help="Connection token")
    p.add_argument("--agent-url", required=True, help="Local agent URL (OpenAI compatible)")
    p.add_argument("--poll-interval", type=float, default=2.0, help="Poll interval in seconds")
    p.add_argument("--model", default="default", help="Model name to send to agent")
    p.add_argument("--stream", action="store_true", default=True, help="Enable streaming (default)")
    p.add_argument("--no-stream", action="store_false", dest="stream", help="Disable streaming")
    return p.parse_args()

def poll_messages(base_url, connection_id, token):
    """Poll for pending messages."""
    url = f"{base_url}/functions/v1/openclaw-poll"
    try:
        resp = requests.post(url, json={
            "connection_id": connection_id,
            "token": token,
        }, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("messages", []), data.get("context", {})
        elif resp.status_code != 200:
            print(f"[poll] Error {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
    except requests.exceptions.RequestException as e:
        print(f"[poll] Network error: {e}", file=sys.stderr)
    return [], {}

def send_reply(base_url, connection_id, token, session_id, content, message_id=None,
               streaming=False, done=False):
    """Send a reply back."""
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

def call_agent_streaming(agent_url, messages, model, base_url, connection_id, token,
                         session_id, user_message_id):
    """Call local agent with streaming, relay chunks back."""
    url = f"{agent_url.rstrip('/')}/v1/chat/completions"
    try:
        resp = requests.post(url, json={
            "model": model,
            "messages": messages,
            "stream": True,
        }, stream=True, timeout=120)

        if resp.status_code != 200:
            error_msg = f"Agent 错误 {resp.status_code}: {resp.text[:200]}"
            send_reply(base_url, connection_id, token, session_id, error_msg,
                       message_id=user_message_id)
            return

        # Create a placeholder assistant message for streaming updates
        result = send_reply(base_url, connection_id, token, session_id, "...",
                           message_id=None)
        reply_msg_id = result.get("message_id") if result else None

        accumulated = ""
        last_update = time.time()
        UPDATE_INTERVAL = 0.5  # Send updates every 0.5s

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
                    now = time.time()
                    if reply_msg_id and (now - last_update) >= UPDATE_INTERVAL:
                        send_reply(base_url, connection_id, token, session_id, accumulated,
                                   message_id=reply_msg_id, streaming=True, done=False)
                        last_update = now
            except json.JSONDecodeError:
                continue

        # Final update
        if accumulated.strip() and reply_msg_id:
            send_reply(base_url, connection_id, token, session_id, accumulated.strip(),
                       message_id=reply_msg_id, streaming=True, done=True)
        elif accumulated.strip():
            send_reply(base_url, connection_id, token, session_id, accumulated.strip(),
                       message_id=user_message_id)

    except requests.exceptions.RequestException as e:
        error_msg = f"连接本地 Agent 失败: {e}"
        send_reply(base_url, connection_id, token, session_id, error_msg,
                   message_id=user_message_id)

def call_agent_non_streaming(agent_url, messages, model, base_url, connection_id, token,
                              session_id, user_message_id):
    """Call local agent without streaming."""
    url = f"{agent_url.rstrip('/')}/v1/chat/completions"
    try:
        resp = requests.post(url, json={
            "model": model,
            "messages": messages,
            "stream": False,
        }, timeout=120)

        if resp.status_code != 200:
            error_msg = f"Agent 错误 {resp.status_code}: {resp.text[:200]}"
            send_reply(base_url, connection_id, token, session_id, error_msg,
                       message_id=user_message_id)
            return

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if content:
            send_reply(base_url, connection_id, token, session_id, content,
                       message_id=user_message_id)

    except requests.exceptions.RequestException as e:
        error_msg = f"连接本地 Agent 失败: {e}"
        send_reply(base_url, connection_id, token, session_id, error_msg,
                   message_id=user_message_id)

def main():
    args = parse_args()
    print(f"🔗 OpenClaw Agent Bridge 启动")
    print(f"   Supabase: {args.supabase_url}")
    print(f"   Agent:    {args.agent_url}")
    print(f"   连接ID:   {args.connection_id}")
    print(f"   轮询间隔: {args.poll_interval}s")
    print(f"   流式模式: {'是' if args.stream else '否'}")
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

                print(f"  → 处理消息 [{msg_id[:8]}]: {user_content[:50]}...")

                # Build messages array with history context
                chat_messages = [
                    {"role": "system", "content": "你是用户的 AI Agent 助手。"},
                ]

                # Add history from context
                history = context.get(session_id, [])
                for h in history:
                    chat_messages.append({"role": h["role"], "content": h["content"]})

                # Add current user message
                chat_messages.append({"role": "user", "content": user_content})

                if args.stream:
                    call_agent_streaming(
                        args.agent_url, chat_messages, args.model,
                        args.supabase_url, args.connection_id, args.token,
                        session_id, msg_id,
                    )
                else:
                    call_agent_non_streaming(
                        args.agent_url, chat_messages, args.model,
                        args.supabase_url, args.connection_id, args.token,
                        session_id, msg_id,
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
