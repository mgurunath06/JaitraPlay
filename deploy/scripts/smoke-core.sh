#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
export PATH="${HOME}/.local/bin:${PATH}"
export JAITRA_CONFIG="${repository_root}/deploy/config/config.example.yaml"
export JAITRA_REPOSITORY_ROOT="${repository_root}"

cd "${repository_root}"
uv run jaitra-core &
core_pid=$!
trap 'kill "${core_pid}" 2>/dev/null || true' EXIT

for _attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8765/api/v1/health > /dev/null; then
    curl --fail --silent http://127.0.0.1:8765/api/v1/snapshot
    echo
    exit 0
  fi
  sleep 0.25
done

echo "JAITRA Core did not become ready" >&2
exit 1
