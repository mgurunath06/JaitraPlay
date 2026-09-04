#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
export PATH="${HOME}/.local/bin:${PATH}"
export JAITRA_CONFIG="${repository_root}/deploy/config/config.example.yaml"
export JAITRA_REPOSITORY_ROOT="${repository_root}"

cd "${repository_root}"
smoke_log="$(mktemp -t jaitra-core-smoke.XXXXXX.log)"
uv run --no-sync jaitra-core >"${smoke_log}" 2>&1 &
core_pid=$!
cleanup() {
  kill "${core_pid}" 2>/dev/null || true
  wait "${core_pid}" 2>/dev/null || true
  rm -f "${smoke_log}"
}
trap cleanup EXIT

for _attempt in {1..120}; do
  if curl --fail --silent http://127.0.0.1:8765/api/v1/health > /dev/null; then
    curl --fail --silent http://127.0.0.1:8765/api/v1/snapshot
    echo
    exit 0
  fi
  if ! kill -0 "${core_pid}" 2>/dev/null; then
    echo "JAITRA Core exited before becoming ready" >&2
    sed -n '1,160p' "${smoke_log}" >&2
    exit 1
  fi
  sleep 0.5
done

echo "JAITRA Core did not become ready" >&2
sed -n '1,160p' "${smoke_log}" >&2
exit 1
