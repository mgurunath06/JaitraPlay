#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
export PATH="${HOME}/.local/bin:${PATH}"
export JAITRA_REPOSITORY_ROOT="${repository_root}"
export JAITRA_CONFIG="${JAITRA_CONFIG:-${repository_root}/config.yaml}"
cd "${repository_root}"
exec uv run --extra voice jaitra-core
