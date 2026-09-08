#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${repository_root}"

umask 077
mkdir -p .local/logs
run_dir="$(mktemp -d "${repository_root}/.local/logs/run-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
printf '%s\n' "${run_dir##*/}" > .local/logs/latest-run
exec > >(tee -a "${run_dir}/launcher.log") 2>&1
core_pid=""
stage="initialization"
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "${core_pid}" ]]; then
    kill "${core_pid}" 2>/dev/null || true
    wait "${core_pid}" 2>/dev/null || true
  fi
  echo "Finished: $(date -u +%FT%TZ) | stage=${stage} | exit=${status}"
  echo "Logs: ${run_dir}"
  echo "Create a shareable report: python3 deploy/scripts/collect-diagnostics.py"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'echo "ERROR: stage=${stage} line=${LINENO} exit=$?" >&2' ERR

echo "=== Starting JAITRA Play ==="
echo "Started: $(date -u +%FT%TZ)"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Logs: ${run_dir}"

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

if [[ ! -f config.yaml ]]; then
  cp deploy/config/config.example.yaml config.yaml
fi

echo "[1] Building UI..."
stage="build"
npm run build

echo "[2] Starting JAITRA Core..."
stage="core startup"
ln -sfn "${run_dir##*/}/core.log" .local/logs/core.log
bash deploy/scripts/run-core.sh > "${run_dir}/core.log" 2>&1 &
core_pid=$!

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
stage="electron"
env -u ELECTRON_RUN_AS_NODE -u JAITRA_UI_DEV_URL \
  JAITRA_CORE_URL=http://127.0.0.1:8765 \
  ./node_modules/.bin/electron .
