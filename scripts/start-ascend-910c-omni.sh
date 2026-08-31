#!/usr/bin/env bash

# Start the MiniCPM-o C++ gateway on a CANN-enabled Ascend 910C host.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

source_cann_environment() {
  if [[ -n "${ASCEND_TOOLKIT_HOME:-}" && -f "$ASCEND_TOOLKIT_HOME/set_env.sh" ]]; then
    # shellcheck disable=SC1090
    source "$ASCEND_TOOLKIT_HOME/set_env.sh"
    return
  fi

  local candidate
  for candidate in \
    /usr/local/Ascend/ascend-toolkit/latest \
    /usr/local/Ascend/ascend-toolkit; do
    if [[ -f "$candidate/set_env.sh" ]]; then
      # shellcheck disable=SC1090
      source "$candidate/set_env.sh"
      return
    fi
  done

  printf 'Cannot find CANN set_env.sh. Set ASCEND_TOOLKIT_HOME, then retry.\n' >&2
  exit 1
}

source_cann_environment

export MINICPM_LLAMACPP_DIR="${MINICPM_LLAMACPP_DIR:-$WORKSPACE_DIR/runtime/llama.cpp-omni}"
export MINICPM_DEMO_DIR="${MINICPM_DEMO_DIR:-$WORKSPACE_DIR/runtime/MiniCPM-o-Demo}"
export MINICPM_MODEL_DIR="${MINICPM_MODEL_DIR:-$WORKSPACE_DIR/models/MiniCPM-o-4_5-gguf}"
export MINICPM_PYTHON="${MINICPM_PYTHON:-$MINICPM_DEMO_DIR/.venv/base/bin/python}"
export MINICPM_MODEL_FILE="${MINICPM_MODEL_FILE:-MiniCPM-o-4_5-F16.gguf}"
export MINICPM_CPP_DEVICE="${MINICPM_CPP_DEVICE:-CANN0}"
export MINICPM_CPP_SERVER_BIN="${MINICPM_CPP_SERVER_BIN:-$MINICPM_LLAMACPP_DIR/build-ascend/bin/llama-server}"
export ASCEND_RT_VISIBLE_DEVICES="${ASCEND_RT_VISIBLE_DEVICES:-0}"

# The shared Mac build is intentionally never used on Linux/Ascend.
if [[ ! -x "$MINICPM_CPP_SERVER_BIN" ]]; then
  printf 'Missing CANN binary: %s\nRun npm run ascend:omni:setup first.\n' \
    "$MINICPM_CPP_SERVER_BIN" >&2
  exit 1
fi

exec "$SCRIPT_DIR/start-local-omni.sh"
