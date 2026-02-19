#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME}/.crawler-service.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RUNTIME_BASE_DIR="${CRAWLER_RUNTIME_DIR:-${HOME}/.crawler-service/runtime}"
CRAWLER_DIR="${RUNTIME_BASE_DIR}/crawler-service"
VENV_DIR="${CRAWLER_VENV_DIR:-${RUNTIME_BASE_DIR}/.venv}"
REPO_DIR="${CRAWLER_REPO_DIR:-}"
AUTO_SYNC_ON_START="${CRAWLER_AUTO_SYNC_ON_START:-false}"

: "${CRAWLER_API_TOKEN:?CRAWLER_API_TOKEN is required in ~/.crawler-service.env}"
: "${CRAWLER_CALLBACK_SECRET:?CRAWLER_CALLBACK_SECRET is required in ~/.crawler-service.env}"

export CRAWLER_INLINE_MODE="${CRAWLER_INLINE_MODE:-true}"
export CRAWLER_PORT="${CRAWLER_PORT:-8100}"
export CRAWLER_ENABLE_DAILY_BUDGET="${CRAWLER_ENABLE_DAILY_BUDGET:-false}"
export CRAWLER_DAILY_BUDGET_UNITS="${CRAWLER_DAILY_BUDGET_UNITS:-6000}"
# Avoid inheriting an unrelated virtualenv from caller environment,
# which can make Python resolve the wrong pyvenv.cfg and crash-loop.
unset VIRTUAL_ENV
unset PYTHONHOME
unset PYTHONPATH
unset CONDA_PREFIX
export PYTHONNOUSERSITE=1

if [[ ! -d "$CRAWLER_DIR" ]]; then
  echo "crawler runtime not found: $CRAWLER_DIR" >&2
  echo "run scripts/crawler/install-launchd.sh to prepare runtime files" >&2
  exit 1
fi

# Optional: keep runtime code in sync with workspace repo.
# Disabled by default because launchd can hit macOS permission limits on Desktop.
if [[ "$AUTO_SYNC_ON_START" == "1" || "$AUTO_SYNC_ON_START" == "true" || "$AUTO_SYNC_ON_START" == "yes" || "$AUTO_SYNC_ON_START" == "on" ]]; then
  if [[ -n "$REPO_DIR" && -d "$REPO_DIR/crawler-service" ]]; then
    if command -v rsync >/dev/null 2>&1; then
      if ! rsync -a --delete \
        --exclude ".venv" \
        --exclude "__pycache__" \
        --exclude "*.pyc" \
        "$REPO_DIR/crawler-service/" "$CRAWLER_DIR/"; then
        echo "warning: runtime sync failed, keep existing runtime snapshot" >&2
      fi
    else
      echo "warning: rsync not found, skip runtime sync" >&2
    fi
  else
    echo "warning: CRAWLER_REPO_DIR is not set or invalid, skip runtime sync" >&2
  fi
fi

if [[ ! -x "${VENV_DIR}/bin/uvicorn" ]]; then
  echo "uvicorn missing in ${VENV_DIR}. run scripts/crawler/install-launchd.sh" >&2
  exit 1
fi

cd "$CRAWLER_DIR"
exec "${VENV_DIR}/bin/uvicorn" app.main:app --host 0.0.0.0 --port "$CRAWLER_PORT"
