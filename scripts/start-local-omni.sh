#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
DEMO_DIR="${MINICPM_DEMO_DIR:-$WORKSPACE_DIR/runtime/MiniCPM-o-Demo}"
LLAMACPP_DIR="${MINICPM_LLAMACPP_DIR:-$WORKSPACE_DIR/runtime/llama.cpp-omni}"
MODEL_DIR="${MINICPM_MODEL_DIR:-$WORKSPACE_DIR/models/MiniCPM-o-4_5-gguf}"
PYTHON_BIN="${MINICPM_PYTHON:-$DEMO_DIR/.venv/base/bin/python}"
GATEWAY_PORT="${MINICPM_GATEWAY_PORT:-8040}"
WORKER_PORT="${MINICPM_WORKER_PORT:-22440}"
CPP_PORT="${MINICPM_CPP_PORT:-19080}"
CTX_SIZE="${MINICPM_CTX_SIZE:-4096}"
MODEL_FILE="${MINICPM_MODEL_FILE:-MiniCPM-o-4_5-Q4_K_M.gguf}"

require_file() {
  if [[ ! -f "$1" ]]; then
    printf 'Missing required file: %s\n' "$1" >&2
    exit 1
  fi
}

require_file "$PYTHON_BIN"
require_file "$DEMO_DIR/config.example.json"
require_file "$LLAMACPP_DIR/build/bin/llama-server"
require_file "$MODEL_DIR/$MODEL_FILE"

mkdir -p "$DEMO_DIR/tmp"

if curl -fsS "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null 2>&1; then
  printf 'MiniCPM-o gateway is already running: http://127.0.0.1:%s\n' "$GATEWAY_PORT"
  exit 0
fi

"$PYTHON_BIN" - "$DEMO_DIR" "$LLAMACPP_DIR" "$MODEL_DIR" "$MODEL_FILE" "$GATEWAY_PORT" "$WORKER_PORT" "$CPP_PORT" "$CTX_SIZE" <<'PY'
import json
import pathlib
import sys

demo_dir, llamacpp_dir, model_dir, model_file, gateway_port, worker_port, cpp_port, ctx_size = sys.argv[1:]
source = pathlib.Path(demo_dir) / "config.example.json"
target = pathlib.Path(demo_dir) / "config.json"
config = json.loads(source.read_text(encoding="utf-8"))
config["backend"] = "cpp"
config["service"].update({
    "gateway_port": int(gateway_port),
    "worker_base_port": int(worker_port),
    "num_workers": 1,
    "request_timeout": 600.0,
})
config["cpp_backend"].update({
    "llamacpp_root": llamacpp_dir,
    "model_dir": model_dir,
    "llm_model": model_file,
    "cpp_server_port": int(cpp_port),
    "ctx_size": int(ctx_size),
    "n_gpu_layers": 99,
})
target.write_text(json.dumps(config, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
PY

cd "$DEMO_DIR"

nohup env PYTHONPATH=. PYTHONUNBUFFERED=1 "$PYTHON_BIN" worker.py \
  --host 127.0.0.1 \
  --port "$WORKER_PORT" \
  --gpu-id 0 \
  --worker-index 0 \
  > tmp/local-worker.log 2>&1 &
WORKER_PID=$!
printf '%s\n' "$WORKER_PID" > tmp/local-worker.pid

printf 'Loading MiniCPM-o 4.5 on Metal'
for _ in $(seq 1 360); do
  if curl -fsS "http://127.0.0.1:$WORKER_PORT/health" 2>/dev/null \
    | "$PYTHON_BIN" -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin).get("model_loaded") else 1)' 2>/dev/null; then
    printf ' ready\n'
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    printf '\nWorker exited during startup. Last log lines:\n' >&2
    tail -80 tmp/local-worker.log >&2
    exit 1
  fi
  printf '.'
  sleep 2
done

if ! curl -fsS "http://127.0.0.1:$WORKER_PORT/health" 2>/dev/null \
  | "$PYTHON_BIN" -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin).get("model_loaded") else 1)' 2>/dev/null; then
  printf '\nWorker did not become ready within 12 minutes. See %s/tmp/local-worker.log\n' "$DEMO_DIR" >&2
  exit 1
fi

nohup env PYTHONPATH=. PYTHONUNBUFFERED=1 "$PYTHON_BIN" gateway.py \
  --http \
  --host 127.0.0.1 \
  --port "$GATEWAY_PORT" \
  --workers "127.0.0.1:$WORKER_PORT" \
  > tmp/local-gateway.log 2>&1 &
GATEWAY_PID=$!
printf '%s\n' "$GATEWAY_PID" > tmp/local-gateway.pid

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null 2>&1; then
    printf 'Gateway ready: http://127.0.0.1:%s\n' "$GATEWAY_PORT"
    printf 'Full-duplex audio demo: http://127.0.0.1:%s/audio_duplex\n' "$GATEWAY_PORT"
    printf 'Omni camera demo: http://127.0.0.1:%s/omni\n' "$GATEWAY_PORT"
    exit 0
  fi
  if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    printf 'Gateway exited during startup. Last log lines:\n' >&2
    tail -80 tmp/local-gateway.log >&2
    exit 1
  fi
  sleep 1
done

printf 'Gateway did not become healthy. See %s/tmp/local-gateway.log\n' "$DEMO_DIR" >&2
exit 1
