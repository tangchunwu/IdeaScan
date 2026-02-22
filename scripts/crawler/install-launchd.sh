#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALL_BIN_DIR="${HOME}/.crawler-service/bin"
RUNTIME_BASE_DIR="${HOME}/.crawler-service/runtime"
RUNTIME_APP_DIR="${RUNTIME_BASE_DIR}/crawler-service"
RUNTIME_VENV_DIR="${RUNTIME_BASE_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"

if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 is required" >&2
  exit 1
fi

mkdir -p "$INSTALL_BIN_DIR"
mkdir -p "$RUNTIME_APP_DIR"

echo "Syncing crawler runtime to ${RUNTIME_APP_DIR}..."
rsync -a --delete \
  --exclude ".venv" \
  --exclude "__pycache__" \
  --exclude "*.pyc" \
  "${ROOT_DIR}/crawler-service/" "${RUNTIME_APP_DIR}/"

if [[ ! -x "${RUNTIME_VENV_DIR}/bin/python" ]]; then
  echo "Creating runtime venv at ${RUNTIME_VENV_DIR}..."
  "$PYTHON_BIN" -m venv "$RUNTIME_VENV_DIR"
fi

echo "Installing runtime dependencies..."
"${RUNTIME_VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
"${RUNTIME_VENV_DIR}/bin/pip" install -r "${RUNTIME_APP_DIR}/requirements.txt"

cp "$ROOT_DIR/scripts/crawler/run-service.sh" "$INSTALL_BIN_DIR/run-service.sh"
chmod +x "$INSTALL_BIN_DIR/run-service.sh"

SERVICE_SCRIPT="$INSTALL_BIN_DIR/run-service.sh"

PLIST_DIR="${HOME}/Library/LaunchAgents"
mkdir -p "$PLIST_DIR"

LOG_DIR="${HOME}/Library/Logs/ideascan-crawler"
mkdir -p "$LOG_DIR"

SERVICE_PLIST="${PLIST_DIR}/com.ideascan.crawler-service.plist"

cat >"$SERVICE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ideascan.crawler-service</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SERVICE_SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$HOME</string>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/service.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/service.err.log</string>
</dict>
</plist>
PLIST

chmod 644 "$SERVICE_PLIST"
chmod +x "$SERVICE_SCRIPT"

launchctl unload "$SERVICE_PLIST" >/dev/null 2>&1 || true
# 清理历史遗留：彻底移除自动 tunnel 同步任务，避免覆盖线上域名
TUNNEL_PLIST="${PLIST_DIR}/com.ideascan.crawler-tunnel.plist"
launchctl unload "$TUNNEL_PLIST" >/dev/null 2>&1 || true
rm -f "$TUNNEL_PLIST" "$INSTALL_BIN_DIR/run-tunnel-sync.sh"
launchctl load "$SERVICE_PLIST"

echo "Installed and loaded:"
echo "  - $SERVICE_PLIST"
echo "Logs:"
echo "  - $LOG_DIR/service.out.log"
echo "  - $LOG_DIR/service.err.log"
