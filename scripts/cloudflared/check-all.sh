#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SELFCHECK_SCRIPT="${SCRIPT_DIR}/tunnel-selfcheck.sh"

PERPLEXITY_DOMAIN="${PERPLEXITY_DOMAIN:-perplexity.us.ci}"
PERPLEXITY_LOCAL_HEALTH_URL="${PERPLEXITY_LOCAL_HEALTH_URL:-http://127.0.0.1:8000/health}"
PERPLEXITY_CLOUDFLARED_CONTAINER="${PERPLEXITY_CLOUDFLARED_CONTAINER:-cloudflared-perplexity}"
PERPLEXITY_APP_CONTAINER="${PERPLEXITY_APP_CONTAINER:-perplexity-mcp}"

declare -a CHECK_SPECS=()

usage() {
  cat <<'EOF'
Usage:
  check-all.sh [options]

Options:
  --check-spec "name|domain|localHealthUrl|cloudflaredContainer|token"
      Add one custom check item. Repeatable.
      token is optional and can be empty.

  --help
      Show help.

Defaults:
  If no --check-spec is provided, run one default check for perplexity using:
    domain:                    $PERPLEXITY_DOMAIN (default: perplexity.us.ci)
    local health URL:          $PERPLEXITY_LOCAL_HEALTH_URL (default: http://127.0.0.1:8000/health)
    cloudflared container:     $PERPLEXITY_CLOUDFLARED_CONTAINER (default: cloudflared-perplexity)
    MCP token source container $PERPLEXITY_APP_CONTAINER (default: perplexity-mcp)

Examples:
  # Run default perplexity check
  ./scripts/cloudflared/check-all.sh

  # Run crawler + flow2api checks
  ./scripts/cloudflared/check-all.sh \
    --check-spec "crawler|cenima.us.ci|http://127.0.0.1:8100/health|cloudflared-crawler|" \
    --check-spec "flow2api|flow2api.us.ci|http://127.0.0.1:38000/health|cloudflared-flow2api|"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-spec)
      CHECK_SPECS+=("${2:-}")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! -x "${SELFCHECK_SCRIPT}" ]]; then
  echo "[ERROR] Selfcheck script not executable: ${SELFCHECK_SCRIPT}" >&2
  exit 1
fi

get_env_from_container() {
  local container="$1"
  local key="$2"
  python3 - "$container" "$key" <<'PY'
import json
import subprocess
import sys

container_name = sys.argv[1]
key = sys.argv[2]
try:
    out = subprocess.check_output(
        ["docker", "inspect", container_name, "--format", "{{json .Config.Env}}"],
        text=True,
        stderr=subprocess.DEVNULL,
    )
except Exception:
    print("")
    sys.exit(0)

try:
    envs = json.loads(out)
except Exception:
    print("")
    sys.exit(0)

prefix = f"{key}="
for item in envs:
    if isinstance(item, str) and item.startswith(prefix):
        print(item[len(prefix):])
        sys.exit(0)

print("")
PY
}

if [[ ${#CHECK_SPECS[@]} -eq 0 ]]; then
  DEFAULT_TOKEN="$(get_env_from_container "${PERPLEXITY_APP_CONTAINER}" "MCP_TOKEN")"
  CHECK_SPECS+=("perplexity|${PERPLEXITY_DOMAIN}|${PERPLEXITY_LOCAL_HEALTH_URL}|${PERPLEXITY_CLOUDFLARED_CONTAINER}|${DEFAULT_TOKEN}")
fi

total=0
passed=0
failed=0

echo "== Cloudflared Batch Check =="

for spec in "${CHECK_SPECS[@]}"; do
  total=$((total + 1))
  IFS='|' read -r name domain local_url container token <<<"${spec}"

  name="${name:-check-${total}}"
  domain="${domain:-}"
  local_url="${local_url:-}"
  container="${container:-}"
  token="${token:-}"

  if [[ -z "${domain}" || -z "${local_url}" ]]; then
    echo
    echo "[FAIL] ${name}: invalid check spec (${spec})"
    failed=$((failed + 1))
    continue
  fi

  echo
  echo "---- ${name} ----"
  cmd=("${SELFCHECK_SCRIPT}" "--domain" "${domain}" "--local-health-url" "${local_url}")
  if [[ -n "${container}" ]]; then
    cmd+=("--cloudflared-container" "${container}")
  fi
  if [[ -n "${token}" ]]; then
    cmd+=("--token" "${token}")
  fi

  if "${cmd[@]}"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
done

echo
echo "== Summary =="
echo "total: ${total}"
echo "passed: ${passed}"
echo "failed: ${failed}"

if [[ ${failed} -gt 0 ]]; then
  exit 1
fi

echo "[PASS] All checks passed"
