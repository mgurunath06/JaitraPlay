# Ubuntu verification — September 9, 2026

Verified over SSH on the existing Ubuntu deployment machine:

- NVIDIA GeForce RTX 3050, 6144 MiB VRAM, driver 595.84.
- Existing core Python environment had neither ONNX Runtime nor InsightFace.
- Installed separate `/opt/jaitraplay/.local/face-eval-venv` using Python 3.12.14.
- Installed ONNX Runtime GPU 1.23.2, InsightFace 0.7.3, CUDA 12 runtime libraries and cuDNN 9 through Python packages. The driver and live core environment were not changed.
- `check_cuda.py`: numerical matrix-multiplication result passed; ONNX profiler recorded CUDA kernel execution.
- `check_models.py`: buffalo_l detector completed on a synthetic blank frame; recognizer returned a finite 1×512 embedding for a synthetic crop. Both model sessions selected CUDAExecutionProvider with CPU fallback available for unsupported operations.
- Models cached under `/opt/jaitraplay/.local/models/insightface/models/buffalo_l`.
- Standalone evaluation scripts copied under `/opt/jaitraplay/.local/face-eval-tools` for verification. Source versions belong under `deploy/face_eval` after the normal application update.

These are installation and inference smoke tests, not face-recognition accuracy measurements or steady-state latency benchmarks. No child images or live camera were used. Real evaluation remains dependent on the labelled household clips. The live app still uses its original face-api baseline.
