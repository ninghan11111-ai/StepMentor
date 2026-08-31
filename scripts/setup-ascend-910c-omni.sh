#!/usr/bin/env bash

# Prepare the competition runtime on a Linux host equipped with Ascend 910C.
# This intentionally downloads the required F16 model from ModelScope only.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
RUNTIME_DIR="${MINICPM_RUNTIME_DIR:-$WORKSPACE_DIR/runtime}"
MODEL_DIR="${MINICPM_MODEL_DIR:-$WORKSPACE_DIR/models/MiniCPM-o-4_5-gguf}"
LLAMACPP_DIR="${MINICPM_LLAMACPP_DIR:-$RUNTIME_DIR/llama.cpp-omni}"
DEMO_DIR="${MINICPM_DEMO_DIR:-$RUNTIME_DIR/MiniCPM-o-Demo}"
BOOTSTRAP_PYTHON="${MINICPM_BOOTSTRAP_PYTHON:-python3}"
VENV_PYTHON="${MINICPM_PYTHON:-$DEMO_DIR/.venv/base/bin/python}"
MODELSCOPE_BIN="$(dirname "$VENV_PYTHON")/modelscope"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

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

for command_name in git cmake "$BOOTSTRAP_PYTHON" npu-smi; do
  require_command "$command_name"
done

source_cann_environment

if [[ -z "${ASCEND_TOOLKIT_HOME:-}" ]]; then
  printf 'CANN did not set ASCEND_TOOLKIT_HOME; check the CANN installation.\n' >&2
  exit 1
fi

printf '== Ascend device ==\n'
npu-smi info
printf '\n== CANN ==\nASCEND_TOOLKIT_HOME=%s\n' "$ASCEND_TOOLKIT_HOME"

mkdir -p "$RUNTIME_DIR" "$MODEL_DIR"

if [[ ! -d "$LLAMACPP_DIR/.git" ]]; then
  git clone --branch feat/web-demo --depth 1 \
    https://github.com/tc-mb/llama.cpp-omni.git "$LLAMACPP_DIR"
fi

if [[ ! -d "$DEMO_DIR/.git" ]]; then
  git clone --branch Comni --depth 1 \
    https://github.com/OpenBMB/MiniCPM-o-Demo.git "$DEMO_DIR"
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
  "$BOOTSTRAP_PYTHON" -m venv "$DEMO_DIR/.venv/base"
fi

"$VENV_PYTHON" -m pip install --upgrade pip
# The C++ worker does not import or run the PyTorch model.  Do not install a
# CUDA wheel here: the model is served by llama.cpp-omni through CANN.
"$VENV_PYTHON" -m pip install -r "$DEMO_DIR/requirements.txt" modelscope

"$MODELSCOPE_BIN" download \
  --model OpenBMB/MiniCPM-o-4_5-gguf \
  --local_dir "$MODEL_DIR" \
  MiniCPM-o-4_5-F16.gguf \
  audio/MiniCPM-o-4_5-audio-F16.gguf \
  tts/MiniCPM-o-4_5-projector-F16.gguf \
  tts/MiniCPM-o-4_5-tts-F16.gguf \
  token2wav-gguf/encoder.gguf \
  token2wav-gguf/flow_extra.gguf \
  token2wav-gguf/flow_matching.gguf \
  token2wav-gguf/hifigan2.gguf \
  token2wav-gguf/prompt_cache.gguf \
  vision/MiniCPM-o-4_5-vision-F16.gguf

required_models=(
  MiniCPM-o-4_5-F16.gguf
  audio/MiniCPM-o-4_5-audio-F16.gguf
  tts/MiniCPM-o-4_5-projector-F16.gguf
  tts/MiniCPM-o-4_5-tts-F16.gguf
  token2wav-gguf/encoder.gguf
  token2wav-gguf/flow_extra.gguf
  token2wav-gguf/flow_matching.gguf
  token2wav-gguf/hifigan2.gguf
  token2wav-gguf/prompt_cache.gguf
  vision/MiniCPM-o-4_5-vision-F16.gguf
)
for model_file in "${required_models[@]}"; do
  if [[ ! -s "$MODEL_DIR/$model_file" ]]; then
    printf 'Model download is incomplete: %s\n' "$MODEL_DIR/$model_file" >&2
    exit 1
  fi
done

cmake -S "$LLAMACPP_DIR" -B "$LLAMACPP_DIR/build-ascend" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CANN=ON \
  -DSOC_TYPE=Ascend910C
cmake --build "$LLAMACPP_DIR/build-ascend" --target llama-server -j "$(nproc)"

if [[ ! -x "$LLAMACPP_DIR/build-ascend/bin/llama-server" ]]; then
  printf 'CANN build did not produce llama-server.\n' >&2
  exit 1
fi

printf '\nCANN backend build completed. Detected llama.cpp devices:\n'
"$LLAMACPP_DIR/build-ascend/bin/llama-server" --list-devices
printf '\nStart the official demo with:\n'
printf '  cd %s && npm run ascend:omni:start\n' "$PROJECT_DIR"
