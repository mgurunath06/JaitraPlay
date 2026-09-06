#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/../.." && pwd)"
output_dir="${1:-${repository_root}/.local/systemd}"
mkdir -p "${output_dir}"

for unit in jaitra-core.service jaitra-ui.service jaitra-provider-health.service jaitra-provider-health.timer; do
  sed "s|@REPOSITORY_ROOT@|${repository_root}|g" \
    "${repository_root}/deploy/systemd/${unit}.in" > "${output_dir}/${unit}"
done

echo "Rendered development units in ${output_dir}"
echo "Review them before copying to the kiosk user's systemd directory."
