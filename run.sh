#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${repository_root}"

echo "=== Starting JAITRA Play ==="

for command in uv npm curl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "ERROR: ${command} is missing. Run from the configured Ubuntu desktop account." >&2
    exit 1
  fi
done

if [[ ! -x node_modules/.bin/electron ]]; then
  echo "ERROR: Electron is missing. Install dependencies with npm ci first." >&2
  exit 1
fi

mkdir -p .local/logs
if [[ ! -f config.yaml ]]; then
  cp deploy/config/config.example.yaml config.yaml
fi

echo "[1] Building UI..."
npm run build

echo "[2] Starting JAITRA Core..."
bash deploy/scripts/run-core.sh > .local/logs/core.log 2>&1 &
core_pid=$!

cleanup() {
  kill "${core_pid}" 2>/dev/null || true
  wait "${core_pid}" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[3] Waiting for Core..."
core_ready=false
for ((attempt = 0; attempt < 120; attempt++)); do
  if ! kill -0 "${core_pid}" 2>/dev/null; then
    echo "ERROR: Core stopped. See ${repository_root}/.local/logs/core.log" >&2
    exit 1
  fi
  if curl --max-time 1 -fsS http://127.0.0.1:8765/api/v1/snapshot >/dev/null 2>&1; then
    core_ready=true
    break
  fi
  sleep 0.25
done

if [[ "${core_ready}" != true ]]; then
  echo "ERROR: Core did not become ready. See ${repository_root}/.local/logs/core.log" >&2
  exit 1
fi

echo "[4] Launching JAITRA Play..."
env -u ELECTRON_RUN_AS_NODE -u JAITRA_UI_DEV_URL \
  JAITRA_CORE_URL=http://127.0.0.1:8765 \
  ./node_modules/.bin/electron .
