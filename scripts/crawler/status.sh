#!/usr/bin/env bash
set -euo pipefail

echo "launchd jobs:"
launchctl list | rg "com\\.ideascan\\.crawler-(service|tunnel)" || true

echo
echo "crawler port:"
lsof -iTCP:8100 -sTCP:LISTEN -n -P || true

echo
echo "local crawler health:"
curl -sS "http://127.0.0.1:8100/health" || true
echo

echo
echo "latest tunnel URL:"
cat "${HOME}/.crawler-service/tunnel_url" 2>/dev/null || echo "(none)"

echo
echo "crawler health via supabase:"
if [[ -f ".env" ]]; then
  # shellcheck disable=SC1091
  source .env
  if [[ -n "${VITE_SUPABASE_URL:-}" && -n "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
    curl -sS "${VITE_SUPABASE_URL}/functions/v1/crawler-health" \
      -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}" || true
    echo
  fi
fi
