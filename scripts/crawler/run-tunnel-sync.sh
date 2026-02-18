#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME}/.crawler-service.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required in ~/.crawler-service.env}"
: "${CRAWLER_API_TOKEN:?CRAWLER_API_TOKEN is required in ~/.crawler-service.env}"

CRAWLER_PORT="${CRAWLER_PORT:-8100}"
TUNNEL_PROVIDER="${TUNNEL_PROVIDER:-cloudflared}"
SUPABASE_BIN="${SUPABASE_BIN:-$(command -v supabase || true)}"
if [[ -z "$SUPABASE_BIN" && -x "/opt/homebrew/bin/supabase" ]]; then
  SUPABASE_BIN="/opt/homebrew/bin/supabase"
fi
if [[ -z "$SUPABASE_BIN" ]]; then
  echo "supabase CLI not found; set SUPABASE_BIN in ~/.crawler-service.env" >&2
  exit 1
fi

STATE_DIR="${HOME}/.crawler-service"
STATE_FILE="${STATE_DIR}/tunnel_url"
LOG_FILE="${STATE_DIR}/tunnel.log"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-$(command -v cloudflared || true)}"
CLOUDFLARED_HOME="${CLOUDFLARED_HOME:-${STATE_DIR}/cloudflared-home}"
mkdir -p "$STATE_DIR"
mkdir -p "$CLOUDFLARED_HOME"

touch "$LOG_FILE"

update_secret() {
  local url="$1"
  if [[ -z "$url" ]]; then
    return 0
  fi

  local current=""
  if [[ -f "$STATE_FILE" ]]; then
    current="$(cat "$STATE_FILE" 2>/dev/null || true)"
  fi
  if [[ "$current" == "$url" ]]; then
    return 0
  fi

  "$SUPABASE_BIN" secrets set \
    "CRAWLER_SERVICE_BASE_URL=${url}" \
    "CRAWLER_SERVICE_TOKEN=${CRAWLER_API_TOKEN}" \
    --project-ref "$SUPABASE_PROJECT_REF" >>"$LOG_FILE" 2>&1

  echo "$url" >"$STATE_FILE"
  echo "[$(date '+%F %T')] updated CRAWLER_SERVICE_BASE_URL=${url}" >>"$LOG_FILE"
}

run_cloudflared() {
  if [[ -z "$CLOUDFLARED_BIN" ]]; then
    return 1
  fi

  local candidate_url=""
  echo "[$(date '+%F %T')] starting cloudflared tunnel..." >>"$LOG_FILE"
  HOME="$CLOUDFLARED_HOME" "$CLOUDFLARED_BIN" tunnel \
    --url "http://127.0.0.1:${CRAWLER_PORT}" \
    --protocol quic \
    --no-autoupdate 2>&1 | while IFS= read -r line; do
      echo "$line" >>"$LOG_FILE"
      if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.trycloudflare\.com ]]; then
        candidate_url="${BASH_REMATCH[0]}"
      fi
      if [[ -n "$candidate_url" && "$line" == *"Registered tunnel connection"* ]]; then
        update_secret "$candidate_url" || true
      fi
    done
}

run_localhost_run() {
  echo "[$(date '+%F %T')] starting localhost.run tunnel..." >>"$LOG_FILE"
  /usr/bin/ssh -N \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=no \
    -R "80:localhost:${CRAWLER_PORT}" \
    localhost.run 2>&1 | while IFS= read -r line; do
      echo "$line" >>"$LOG_FILE"
      if [[ "$line" =~ https://[a-zA-Z0-9-]+\.localhost\.run ]]; then
        update_secret "${BASH_REMATCH[0]}" || true
      fi
    done
}

while true; do
  if [[ "$TUNNEL_PROVIDER" == "cloudflared" ]]; then
    run_cloudflared || run_localhost_run
  else
    run_localhost_run
  fi

  echo "[$(date '+%F %T')] tunnel exited, retry in 3s" >>"$LOG_FILE"
  sleep 3
done
