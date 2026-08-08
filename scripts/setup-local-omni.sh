#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
RUNTIME_DIR="${MINICPM_RUNTIME_DIR:-$WORKSPACE_DIR/runtime}"
MODEL_DIR="${MINICPM_MODEL_DIR:-$WORKSPACE_DIR/models/MiniCPM-o-4_5-gguf}"
LLAMACPP_DIR="$RUNTIME_DIR/llama.cpp-omni"
DEMO_DIR="$RUNTIME_DIR/MiniCPM-o-Demo"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing command: %s\n' "$1" >&2
    printf 'Install prerequisites with: brew install cmake git-lfs uv\n' >&2
    exit 1
  fi
}

for command_name in cmake git git-lfs uv; do
  require_command "$command_name"
done

if ! command -v hf >/dev/null 2>&1; then
  uv tool install huggingface_hub
fi

if command -v python3.12 >/dev/null 2>&1; then
  PYTHON_BIN="python3.12"
else
  PYTHON_BIN="python3"
fi

"$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || {
  printf 'Python 3.10 or newer is required.\n' >&2
  exit 1
}

mkdir -p "$RUNTIME_DIR" "$MODEL_DIR"
git lfs install

if [[ ! -d "$LLAMACPP_DIR/.git" ]]; then
  git clone --branch feat/web-demo --depth 1 \
    https://github.com/tc-mb/llama.cpp-omni.git "$LLAMACPP_DIR"
fi

if [[ ! -d "$DEMO_DIR/.git" ]]; then
  git clone --branch Comni --depth 1 \
    https://github.com/OpenBMB/MiniCPM-o-Demo.git "$DEMO_DIR"
fi

cmake -S "$LLAMACPP_DIR" -B "$LLAMACPP_DIR/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$LLAMACPP_DIR/build" --target llama-server -j "$(sysctl -n hw.logicalcpu)"

if [[ ! -x "$DEMO_DIR/.venv/base/bin/python" ]]; then
  "$PYTHON_BIN" -m venv "$DEMO_DIR/.venv/base"
fi

VENV_PYTHON="$DEMO_DIR/.venv/base/bin/python"
PIP_INDEX_URL=https://pypi.org/simple "$VENV_PYTHON" -m pip install --upgrade pip
PIP_INDEX_URL=https://pypi.org/simple "$VENV_PYTHON" -m pip install \
  'torch==2.8.0' \
  'torchaudio==2.8.0' \
  'transformers==4.51.0' \
  'accelerate==1.12.0' \
  'safetensors>=0.7.0' \
  'fastapi>=0.128.0' \
  'uvicorn>=0.40.0' \
  'httpx>=0.28.0' \
  'websockets>=16.0' \
  python-multipart \
  'pydantic>=2.11.0' \
  'numpy>=2.2.0' \
  'tqdm>=4.67.0' \
  requests \
  'pillow>=10.4.0' \
  'soundfile>=0.12.1' \
  'librosa>=0.11.0'

hf download openbmb/MiniCPM-o-4_5-gguf \
  MiniCPM-o-4_5-Q4_K_M.gguf \
  audio/MiniCPM-o-4_5-audio-F16.gguf \
  tts/MiniCPM-o-4_5-projector-F16.gguf \
  tts/MiniCPM-o-4_5-tts-F16.gguf \
  token2wav-gguf/encoder.gguf \
  token2wav-gguf/flow_extra.gguf \
  token2wav-gguf/flow_matching.gguf \
  token2wav-gguf/hifigan2.gguf \
  token2wav-gguf/prompt_cache.gguf \
  vision/MiniCPM-o-4_5-vision-F16.gguf \
  --local-dir "$MODEL_DIR" \
  --max-workers 4

printf '\nLocal runtime is installed. Start it with:\n'
printf '  cd %s && npm run local:omni:start\n' "$PROJECT_DIR"
