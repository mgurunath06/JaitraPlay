# Step Zero — measure before reworking live recognition

This addendum takes precedence over the implementation order in
[Brief v2](../../docs/FACE_RECOGNITION_REWORK_V2.md). Do not implement its live
changes until the comparison below supplies evidence. Live detector, geometry,
tracking, galleries, pacing and backend are unchanged by this measurement work.

## Scope clarification

The supplied addendum called selectable replay width its only required code change,
but also required per-person labels before collecting the dataset. The old label
and scoring tools supported only `jaitra` and `other`. Step Zero therefore includes
necessary **offline-only** per-person labelling, galleries, scoring, joint sweeps
and comparison reports. It does not introduce the v2 runtime or core service.

The experiment panel now offers 640 (default), 1280 and 0/native width for both
replay and dataset benchmarking. Prediction files have a separate offline session
header and actual source/analysis dimensions on each frame. Live diagnostic
headers identify their unchanged 640 width; the offline selector does not relabel
a live session. Filenames include the requested width.

**Interpretation limits:**

- The face-api detector stays at input 320, score threshold .65 and absolute minimum
  box 45. Increasing analysis width also lowers that gate relative to the source.
  It is a width-only configuration experiment, not an isolated descriptor-quality
  experiment. Detector input remains 320; inspect detection versus identification.
- Compare complete pipelines. face-api uses top-three Euclidean distance and needs
  three gallery samples; the existing ArcFace runner uses maximum cosine with at
  least one sample. Both export actual per-person gallery counts. Account for
  failed enrollment and differing gallery sizes when interpreting results.
- Offline latency includes detection, embedding, metrics and matching, excluding
  clip decoding/seeking, resize and UI/IPC. It cannot establish live FPS or transport
  cost. Keep the later transport experiment conditional on choosing a core path.
- Source face-width buckets alone cannot establish metres or acquisition time.
  Record camera/distance notes and measure acquisition on temporal sequences.
  Per-frame recall observations are correlated; do not infer timing guarantees
  by treating successive frames as independent Bernoulli trials.
- The decision table gives hypotheses, not proof that hardware/model/lighting is
  the sole cause. Compare recall alongside false identifications and raw counts.

## Recording and labelling

Record 15–20 clips of 20–30 seconds, at full capture resolution. Use three separate
sittings (not minute subdivisions): A enrollment; B calibration; C held-out test,
preferably another day. Include Jaitra and each parent, near/far views at measured
positions, frontal/turned views, walking, floor play, entry, seated play, daylight,
lamp light and two people together. If available with consent, include an unenrolled
visitor in B or C. Without unknown faces, unknown-person false accepts are unmeasured.

Use **Remember Jaitra → Camera experiment → Record 30-second evaluation clip**.
Save downloads under `.local/face-eval/`; browsers do not enforce this directory.
Keep camera model, height, angle, position and distance/lighting notes beside clips.
Do not upload raw clips or descriptors to source control.

Open `label.html` locally. Draw every visible face at integer seconds, including
faces detectors miss. Save explicit empty frames when no face is visible. Label
visible faces of others even if one person is turned away. Use stable IDs such as
`jaitra`, `father`, `mother`, `visitor_1`. Set **Enrolled person IDs** to the people
you intend to recognize; leave `visitor_1` out. `other` remains a legacy unknown
label. Only enrollment-split annotations may build galleries.

Save `manifest.json` beside the clips. Resume it to preserve IDs and splits. The
updated tools accept legacy manifests; explicit `enrolledPeople` is recommended
for new ones. Named people whose gallery fails to build still count as enrolled
in scoring, so failed enrollment cannot artificially remove their misses.

## Run protocol

Run all pipelines against exactly the same manifest and recordings. Pause live
recognition for browser benchmarks. Select the manifest and all referenced files
together using **Benchmark manifest and clips**; run first at 640, then at 1280.
Downloads: `dataset-face-api-640.jsonl`, `dataset-face-api-1280.jsonl`.
The detector, CPU backend and default threshold stay unchanged. The added family
benchmark stores all per-person scores and rejects exact identity ties; this is
explicitly a multi-person extension, not a claim the old live app named everybody.

On the RTX machine use the **existing admin2-owned evaluation environment**.
See [claude.md](../../claude.md) for account and permission facts. From remoteadmin,
run commands as admin2; remoteadmin cannot traverse the interpreter's uv-managed
location under `/home/admin2`. Do not reinstall uv or chmod the home directory.

GPU inference command, after files and updated tools are present:

```bash
sudo -iu admin2 /opt/jaitraplay/.local/face-eval-venv/bin/python /opt/jaitraplay/deploy/face_eval/arcface.py /opt/jaitraplay/.local/face-eval/manifest.json /opt/jaitraplay/.local/face-eval/buffalo-1280.jsonl --analysis-width 1280 --threshold 0.4
```

The starting .4 cosine threshold and zero margin are exploratory, not calibrated.
CPU fallback must fail the GPU check. `--analysis-width 0` is an optional separate
native run. Secondary child-only photos are opt-in via `--secondary-photos`; use a
separate output, parent-confirmed photos and no test-session material. Do not
search a personal photo library automatically.

From the repository directory, score each run on calibration only:

```bash
python3 deploy/face_eval/score.py .local/face-eval/manifest.json .local/face-eval/dataset-face-api-640.jsonl --split calibration --json > .local/face-eval/face-api-640.calibration.json
```

Repeat with the 1280 and buffalo files, using distinct output names. The scorer
rejects mixed widths/configurations, session leakage and missing predictions.
It reads the new session headers and remains compatible with old frame-only JSONL.

Joint sweeps accept calibration only. For example (exploratory grid):

```bash
python3 deploy/face_eval/sweep.py .local/face-eval/manifest.json .local/face-eval/dataset-face-api-640.jsonl --thresholds=-0.5,-0.46,-0.42,-0.38 --margins=0,0.03,0.06,0.09 > .local/face-eval/face-api-640.sweep.csv
```

ArcFace requires a cosine grid rather than negative Euclidean values. Choose both
threshold and margin from calibration under declared false-identification costs;
then regenerate each calibration report with explicit `--threshold` and `--margin`.
The sweep never chooses or deploys a setting automatically. Leave test scoring
until all choices are frozen.

Combine the three JSON reports into one Markdown comparison:

```bash
python3 deploy/face_eval/compare.py .local/face-eval/face-api-640.calibration.json .local/face-eval/face-api-1280.calibration.json .local/face-eval/buffalo-1280.calibration.json > .local/face-eval/step-zero-results.md
```

The comparison verifies identical manifest fingerprints and coverage, retains run
configuration and raw counts, and leaves camera geometry and conclusions pending.
No synthetic or placeholder accuracy results are supplied as real measurements.

## Readout and decision

For each source-width bucket (<40, 40–60, 60–90, 90–130, 130+), report:

- detected / all labelled faces;
- correctly identified / detected enrolled faces (conditional identification recall);
- wrong-family identifications;
- unknown-person accepts / labelled unknown faces;
- confusion pairs in JSON reports, unmatched accepted detections, latency and coverage.

A missing detector result counts against detection recall; a detected face rejected
by the size or identity gate counts against conditional identification recall.
Unknown faces are evaluated for false acceptance, not for knowing their names.
Always include total enrolled faces as well, so conditional recall does not conceal
poor detection. Zero unknown examples means unknown false-accept performance is N/A.

| Calibration evidence | Next action to assess |
| --- | --- |
| 1280 face-api little better; ArcFace clearly better | Core model path may be justified. |
| 1280 face-api clearly better; ArcFace similar | Prefer browser improvements; reassess whether core migration is needed. |
| Strong recall and low false IDs down to smaller faces | Simpler entry/exit handling may suffice; verify temporal behavior. |
| All pipelines weak on small faces | Investigate mounting, lighting and close-range acquisition; do not conclude software cannot help from this alone. |
| Detection poor, identification conditional on detection good | Investigate detector/input/gate and geometry before replacing the embedder. |
| Identification good, false IDs high | Sweep threshold and margin before changing architecture. |
| Father/mother confusion dominates | Inspect gallery diversity and labels before changing models. |

Fill the generated results note with camera geometry, selected row, evidence,
calibration settings, and revised acquisition/FPS targets. Preserve manifest/results
privately under `.local/`; commit a reviewed, sanitized note and manifest reference
only when requested. Never force-add raw private data merely to accompany a report.
The original v2 acceptance figures remain provisional until measured, not silently
replaced by estimates. Update v2's scope and acceptance from the completed note.

## Execution status

The owner's September 11 SSH output verified an RTX 3050 6144 MiB with driver
595.84, and a CUDA kernel with ONNX Runtime 1.23.2 when invoked as admin2. This is
installation evidence, not an accuracy/FPS run. The owner also verified that
buffalo_l detection and recognition load with CUDA providers and produce a finite
512-dimensional synthetic embedding. The roughly 574 ms cold synthetic smoke time
is not steady-state latency. Recording location, labelled data, comparison results
and architecture selection remain pending.
