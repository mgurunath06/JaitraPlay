# Camera baseline and face evaluation

This measures the existing face-api path before changing recognition. Live detector size (320), CPU backend, 640-pixel analysis canvas, 45-pixel minimum box, top-three Euclidean distance threshold (0.42), and tracking rules stay unchanged. Earlier unfinished enrollment changes are preserved locally in `.local/identity-drafts/`.

## 0. Observe the current build

Open **Remember Jaitra → Camera experiment**, start recognition, give the session an ID, and click **Start diagnostics**. Reproduce failures, then **Stop and save diagnostics**. The local JSONL contains:

Before reproducing a multi-person failure, use **Who is in view?** to assign
Jaitra, Father, Mother, or Other to each numbered live track. These annotations
follow only the current track, reset when the camera restarts, and are written to
the opt-in diagnostic log. They do not override the recognizer or train a profile.
If tracking is lost or people cross and the numbers change, assign the labels again.

- Capture timestamp and video time; actual source and analysis dimensions.
- Every detected box in analysis pixels, confidence, crop luminance and variance of the four-neighbour Laplacian. Even detections rejected by the baseline's 45-pixel cutoff are logged.
- Nearest Euclidean distance and mean of the three nearest distances (lower is better), threshold, and per-face match. No enrollment gives null scores.
- Final tracker decision, target, match counts, enrollment phase, face inference latency, and total processing latency.
- Empty face lists for detector misses, plus camera/pipeline failure events.

Only processed frames are logged: the baseline deliberately waits 200 ms after inference and is not a 25-fps recognizer. Video timestamps reveal sampling gaps. Metrics add overhead, included in latency; no instrumentation work runs when logging is off except a cheap inactive check. The in-memory buffer stops at 20,000 rows; stop/save periodically and before closing the app. It is not crash-persistent. Exports contain no descriptors or images and do not use the general application telemetry channel.

```bash
python3 deploy/face_eval/summarize.py .local/face-eval/evening-01-diagnostics.jsonl
```

Interpretation: small/missing detections suggest geometry, resolution, detector or occlusion issues; clean detections with poor matching can indicate alignment, gallery mismatch or embedder problems; wrong-person matches suggest threshold/gallery/association problems. These are hypotheses, may coexist, and require labelled observations. An empty detector result cannot reveal the size of a missed face; that requires annotation.

## 1. Collect and label

Use **Record 30-second evaluation clip** to save video locally without audio. This records the current camera stream at its actual resolution; it deliberately does not raise resolution before baseline measurement. Downloads must be kept in a private local folder, preferably `.local/face-eval/` (ignored by Git). Raw clips are retained on disk for repeatable evaluation; live logging itself retains no video.

Collect 15–20 clips, 20–30 seconds each: entry, floor play, seated, turning away, walking, close/far, daylight/evening, parent alone, child and parent together, and an available consenting visitor. Use separate capture sessions for enrollment, calibration and held-out testing. All clips from one session belong to one split. Do not use frames adjacent in time as supposedly independent examples.

Open `label.html` in a browser to annotate clips locally. Select a video, choose its session and split, seek to a time, draw a box around each visible face, choose `jaitra` or `other`, then save that frame. Explicitly save empty frames when no face is visible. Annotate at integer seconds to start. Save the manifest together with the original clips; the scorer requires predictions for every annotated evaluation frame. Reopen the manifest in the label tool to continue. Parent confirms enrollment boxes; choose diverse enrollment timestamps rather than every near-duplicate.

Boxes are normalized **source-image** xywh. Labels cover all visible faces, including faces the detector misses. Back-only views have an empty face list and are not counted as face-recognition misses. Body continuity will be evaluated separately after the baseline. An example manifest is `manifest.example.json`; its boxes are illustrative, not real labels.

## 2. Run the baseline and candidate on the same annotations

Pause live recognition. In **Benchmark manifest and clips**, select the manifest JSON and every referenced clip together. The browser builds a temporary face-api gallery only from labelled enrollment frames, evaluates calibration/test annotations, and exports `dataset-face-api.jsonl`. It does not overwrite the saved child profile. File basenames must be unique. **Replay evaluation clip** separately checks the currently saved profile; do not confuse that diagnostic with the session-separated model comparison.

On the Ubuntu GPU machine:

```bash
bash deploy/scripts/setup-face-eval.sh
.local/face-eval-venv/bin/python deploy/face_eval/arcface.py \
  .local/face-eval/manifest.json .local/face-eval/buffalo-calibration.jsonl \
  --threshold 0.4
```

`0.4` is an explicit exploratory starting threshold, not a validated operating point. The runner processes both calibration/test clips; only inspect calibration results while selecting thresholds. It uses L2-normalized embeddings and maximum cosine similarity over the enrollment gallery. face-api retains its actual mean-top-three Euclidean rule; this comparison measures complete detector/embedder/matcher pipelines, not an isolated embedder swap. Output records the gallery size because either detector may fail to enroll some annotated views.

The `Embedder` protocol keeps model changes isolated. `--model` selects an InsightFace pack. CPU is opt-in via `--cpu` for functional checks; do not compare its latency to the GPU target. Default analysis width is 640 for both paths. Later test `--analysis-width 0` as a **separate native-resolution experiment**, not a silent change to the baseline. Detector size is recorded separately. A high-resolution camera alone does not help if the analysis pipeline discards its pixels.

The CUDA setup uses a separate Python 3.12 environment and pinned ONNX Runtime/CUDA/cuDNN packages. It runs a matrix multiplication and checks ONNX profiling evidence that a CUDA kernel actually executed. The model runner also refuses a CPU-only provider fallback. The NVIDIA driver is reused, not replaced. Reference: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html

## 3. Score and choose geometry from evidence

```bash
python3 deploy/face_eval/score.py .local/face-eval/manifest.json \
  .local/face-eval/dataset-face-api.jsonl --split calibration
python3 deploy/face_eval/score.py .local/face-eval/manifest.json \
  .local/face-eval/buffalo-calibration.jsonl --split calibration --threshold 0.4
```

Scores use larger-is-better values: negative mean-top-three Euclidean for face-api and cosine for ArcFace. Sweep candidate thresholds on calibration only. Choose the operating point according to the cost of false identification versus misses. Then freeze it and score `--split test`. The CLI prints counts, miss rates, detection recall, unmatched accepted detections and latency. Face-width bins use labelled source pixels so both pipelines and detector misses share the same denominators: <40, 40–60, 60–90, 90–130, 130+. Compare analysis widths alongside that table.

Prediction-to-label association is greedy descending IoU with a 0.3 cutoff and one-to-one assignments. Inspect overlapping faces manually. Face-level misses include detection failures; unmatched accepted detections are separate because their true identity is not assigned. Missing prediction rows fail the run. Hundreds of adjacent frames are not hundreds of independent trials; report session coverage and raw counts, not an unsupported population accuracy claim.

These first measurements are face-level. Live logs include existing tracker decisions, but the scorer does not yet measure body identity switches or time-spread track voting. Geometry changes, temporal aggregation, threshold deployment, and the setup wizard follow the baseline evidence.

For a separate historical-photo experiment, pass `--secondary-photos /path/to/parent-confirmed-child-only-photos` and write a different predictions file. The runner requires exactly one detected face per image and records the additional gallery size. Use only photos confirmed by the parent, keep them out of held-out sessions, and compare calibration/test results with the primary-only run. No family photos have been accessed or enrolled by these tools.
