#!/usr/bin/env bash
set -euo pipefail
umask 077
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
# Serialize scheduled and on-demand checks, including report replacement.
mkdir -p "${repository_root}/.local/state"
exec 9>"${repository_root}/.local/state/provider-health.lock"
flock -n 9 || { echo "A provider health check is already running." >&2; exit 2; }
exec python3 "${repository_root}/apps/core/jaitra_core/providers/healthcheck.py" "$@"
