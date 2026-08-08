#!/usr/bin/env bash

set -euo pipefail

GATEWAY_PORT="${MINICPM_GATEWAY_PORT:-8040}"
WORKER_PORT="${MINICPM_WORKER_PORT:-22440}"
CPP_PORT="${MINICPM_CPP_PORT:-19080}"

check_endpoint() {
  local label="$1"
  local url="$2"

  if response="$(curl -fsS --max-time 3 "$url" 2>/dev/null)"; then
    printf '%-12s OK  %s\n' "$label" "$response"
  else
    printf '%-12s DOWN  %s\n' "$label" "$url"
    return 1
  fi
}

status=0
check_endpoint "gateway" "http://127.0.0.1:$GATEWAY_PORT/health" || status=1
check_endpoint "worker" "http://127.0.0.1:$WORKER_PORT/health" || status=1
check_endpoint "llama-server" "http://127.0.0.1:$CPP_PORT/health" || status=1
exit "$status"
