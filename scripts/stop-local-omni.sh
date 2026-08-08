#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
DEMO_DIR="${MINICPM_DEMO_DIR:-$WORKSPACE_DIR/runtime/MiniCPM-o-Demo}"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    printf 'Stopped %s (%s)\n' "$label" "$pid"
  fi
  rm -f "$pid_file"
}

stop_pid_file "$DEMO_DIR/tmp/local-gateway.pid" "gateway"
stop_pid_file "$DEMO_DIR/tmp/local-worker.pid" "worker"
