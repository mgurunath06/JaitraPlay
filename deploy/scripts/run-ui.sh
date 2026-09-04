#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
nvm_dir="${NVM_DIR:-${HOME}/.nvm}"

if [[ ! -s "${nvm_dir}/nvm.sh" ]]; then
  echo "NVM is required at ${nvm_dir}" >&2
  exit 1
fi

source "${nvm_dir}/nvm.sh"
cd "${repository_root}"
exec npm run electron:dev
