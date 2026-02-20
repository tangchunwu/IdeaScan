#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-local}"
DEPLOY_FUNCTIONS="${DEPLOY_FUNCTIONS:-false}"
FUNCTIONS_SCOPE="${FUNCTIONS_SCOPE:-core}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI 未安装，请先安装后重试。" >&2
  echo "参考: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

deploy_core_functions() {
  supabase functions deploy \
    validate-idea validate-idea-stream list-validations get-validation delete-validation \
    user-settings verify-config get-sample-reports re-analyze-validation \
    export-user-data import-user-data \
    generate-mvp submit-mvp-lead track-experiment-event \
    scan-trending-topics discover-topics \
    generate-discussion reply-to-comment generate-persona-image \
    crawler-dispatch crawler-callback crawler-health \
    crawler-auth-start crawler-auth-status crawler-auth-cancel \
    crawler-auth-import-cookies crawler-auth-sessions crawler-auth-revoke
}

deploy_all_functions() {
  # 排除共享目录 _shared
  local functions
  functions="$(find supabase/functions -mindepth 1 -maxdepth 1 -type d -not -name "_*" -exec basename {} \; | tr '\n' ' ')"
  # shellcheck disable=SC2086
  supabase functions deploy $functions
}

echo "==> 初始化模式: ${MODE}"
if [[ "$MODE" == "local" ]]; then
  echo "==> 启动本地 Supabase 容器"
  supabase start
  echo "==> 应用数据库迁移"
  supabase db reset
elif [[ "$MODE" == "remote" ]]; then
  echo "==> 应用数据库迁移到已 link 的远端项目"
  supabase db push
else
  echo "error: 不支持的模式 '${MODE}'，仅支持 local | remote" >&2
  exit 1
fi

if [[ "$DEPLOY_FUNCTIONS" == "true" || "$DEPLOY_FUNCTIONS" == "1" ]]; then
  echo "==> 部署 Edge Functions (${FUNCTIONS_SCOPE})"
  if [[ "$FUNCTIONS_SCOPE" == "all" ]]; then
    deploy_all_functions
  else
    deploy_core_functions
  fi
else
  echo "==> 跳过 Edge Functions 部署（设置 DEPLOY_FUNCTIONS=true 可开启）"
fi

echo "==> 完成"
if [[ "$MODE" == "local" ]]; then
  echo "下一步建议："
  echo "1) 运行: supabase status"
  echo "2) 前端 .env 填写本地 URL/Anon Key 后执行 npm run dev"
else
  echo "下一步建议："
  echo "1) 在 Supabase 项目 Secrets 补齐 CRAWLER / LLM / 搜索相关变量"
  echo "2) 启动前端并验证 crawler-health"
fi
