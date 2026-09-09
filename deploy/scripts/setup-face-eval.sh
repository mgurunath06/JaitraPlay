#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
eval_uv="${JAITRA_EVAL_UV:-uv}"
if ! command -v "$eval_uv" >/dev/null && [[ -x "$repo_dir/.local/face-eval-tools/uv" ]]; then
  eval_uv="$repo_dir/.local/face-eval-tools/uv"
fi
command -v nvidia-smi >/dev/null || { echo "NVIDIA driver unavailable; run this on the Ubuntu GPU target." >&2; exit 1; }
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
"$eval_uv" venv --python 3.12 --allow-existing "$repo_dir/.local/face-eval-venv"
"$eval_uv" pip install --python "$repo_dir/.local/face-eval-venv/bin/python" -r "$repo_dir/deploy/face_eval/requirements-gpu.txt"
"$repo_dir/.local/face-eval-venv/bin/python" "$repo_dir/deploy/face_eval/check_cuda.py"
"$repo_dir/.local/face-eval-venv/bin/python" "$repo_dir/deploy/face_eval/check_models.py"
