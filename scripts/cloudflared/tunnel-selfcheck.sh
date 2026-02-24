#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
LOCAL_HEALTH_URL=""
TOKEN="${MCP_TOKEN:-}"
CLOUDFLARED_CONTAINER=""

usage() {
  cat <<'EOF'
Usage:
  tunnel-selfcheck.sh --domain <fqdn> [options]

Options:
  --domain <fqdn>                    Public domain, for example: perplexity.us.ci
  --local-health-url <url>           Local origin health URL (default: http://127.0.0.1:8000/health)
  --token <token>                    Bearer token for /v1/models check (optional)
  --cloudflared-container <name>     Cloudflared container name for metrics check (optional)
  -h, --help                         Show this help message

Examples:
  ./scripts/cloudflared/tunnel-selfcheck.sh \
    --domain perplexity.us.ci \
    --local-health-url http://127.0.0.1:8000/health \
    --token "$MCP_TOKEN" \
    --cloudflared-container cloudflared-perplexity
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --local-health-url)
      LOCAL_HEALTH_URL="${2:-}"
      shift 2
      ;;
    --token)
      TOKEN="${2:-}"
      shift 2
      ;;
    --cloudflared-container)
      CLOUDFLARED_CONTAINER="${2:-}"
      shift 2
      ;;
    -h|--help)
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

if [[ -z "$DOMAIN" ]]; then
  echo "[ERROR] --domain is required" >&2
  usage
  exit 2
fi

if [[ -z "$LOCAL_HEALTH_URL" ]]; then
  LOCAL_HEALTH_URL="http://127.0.0.1:8000/health"
fi

PUBLIC_HEALTH_URL="https://${DOMAIN}/health"
PUBLIC_MODELS_URL="https://${DOMAIN}/v1/models"

echo "== Tunnel Self Check =="
echo "domain: ${DOMAIN}"
echo "local health: ${LOCAL_HEALTH_URL}"
echo "public health: ${PUBLIC_HEALTH_URL}"

echo
echo "[1/4] Local origin health"
LOCAL_CODE="$(curl -sS -o /tmp/tunnel-local-health.json -w '%{http_code}' --max-time 12 "${LOCAL_HEALTH_URL}")"
echo "local status: ${LOCAL_CODE}"
if [[ "${LOCAL_CODE}" != "200" ]]; then
  echo "[FAIL] local origin is unhealthy"
  exit 1
fi

echo
echo "[2/4] Public health through Cloudflare"
PUBLIC_CODE="$(curl -sS -o /tmp/tunnel-public-health.json -w '%{http_code}' --max-time 18 "${PUBLIC_HEALTH_URL}")"
echo "public status: ${PUBLIC_CODE}"
if [[ "${PUBLIC_CODE}" != "200" ]]; then
  echo "[FAIL] public health check failed"
  exit 1
fi

echo
echo "[3/4] Authenticated models endpoint"
if [[ -n "${TOKEN}" ]]; then
  MODELS_CODE="$(curl -sS -o /tmp/tunnel-public-models.json -w '%{http_code}' --max-time 18 "${PUBLIC_MODELS_URL}" -H "Authorization: Bearer ${TOKEN}")"
  echo "models status: ${MODELS_CODE}"
  if [[ "${MODELS_CODE}" != "200" ]]; then
    echo "[FAIL] public authenticated models check failed"
    exit 1
  fi
else
  echo "skip (no token provided)"
fi

echo
echo "[4/4] Cloudflared metrics"
if [[ -n "${CLOUDFLARED_CONTAINER}" ]]; then
  HA_CONNECTIONS="$(docker run --rm --network "container:${CLOUDFLARED_CONTAINER}" curlimages/curl:8.12.1 -s http://127.0.0.1:20241/metrics | awk '$1=="cloudflared_tunnel_ha_connections" {print $2}' | tail -n 1)"
  TOTAL_REQUESTS="$(docker run --rm --network "container:${CLOUDFLARED_CONTAINER}" curlimages/curl:8.12.1 -s http://127.0.0.1:20241/metrics | awk '$1=="cloudflared_tunnel_total_requests" {print $2}' | tail -n 1)"
  echo "ha connections: ${HA_CONNECTIONS:-unknown}"
  echo "total requests: ${TOTAL_REQUESTS:-unknown}"
else
  echo "skip (no cloudflared container provided)"
fi

echo
echo "[PASS] Tunnel and service checks passed"
