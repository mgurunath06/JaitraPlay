# Ubuntu deployment handoff

Last updated: September 11, 2026. This record combines the earlier verified
deployment handoff with command output supplied by the owner in this conversation.
It is not evidence of a new remote inspection. See also `README.md` and `cloud.md`
for application behavior and general setup.

## Working with the owner

- Give **one step at a time**, then wait for the result.
- This is an existing Ubuntu installation: update it in place, not a fresh install.
- Use this record before asking the owner to rediscover deployment details.
- Maintenance is performed remotely as `remoteadmin`; graphical app startup runs
  in `admin2`'s Ubuntu desktop session. Do not launch Electron from an ordinary SSH
  session or assume that `systemctl --user` as `remoteadmin` controls `admin2`.
- Preserve configuration, secrets, runtime data, local launchers, and permissions.

## Host, accounts, and paths

- Host: `admin2-B550M-H-ARGB`; Ubuntu 26.04 LTS, x86-64.
- Hardware reported by owner: Ryzen 5 5500, 14 GiB usable RAM, RTX 3050 6 GB.
- Repository: `https://github.com/mgurunath06/JaitraPlay.git`, branch `main`.
- Shared checkout: `/opt/jaitraplay`, owned by `remoteadmin:jaitra`, mode `2775`.
- `remoteadmin`: SSH/maintenance account, in `sudo` and `jaitra`.
- `admin2`: graphical desktop/runtime account, in `jaitra`.
- Checkout has group-write and default ACLs for `jaitra`; setgid preserves group.
- `.venv` and `.local/state` are owned by `admin2:jaitra`.

| Path relative to checkout | Purpose |
| --- | --- |
| `config.yaml` | Existing appliance configuration; do not overwrite |
| `.venv` | Python environment |
| `node_modules` | JavaScript/Electron dependencies |
| `dist/ui`, `dist-electron` | Built application |
| `.local/models` | Cached voice, pose, and face models |
| `.local/state` | Database, generated content, identity profile, health reports |
| `.local/logs/core.log` | Core log used by local launchers |
| `.claude` | Existing provider profiles |
| `.local/secrets/elevenlabs.env` | Installed ElevenLabs secret; never commit |

The ElevenLabs secret was previously installed as `admin2:jaitra`, mode `600`,
inside a mode `700` directory. Its contents were not inspected. Do not recursively
loosen permissions or ask the owner to paste secrets. Local config, profiles,
models, secrets, and saved state do not transfer through Git.

## Face evaluation: verified account and interpreter access (September 11)

Read this before suggesting SSH, uv, Python or GPU setup commands. The owner
requires **one command or one command block at a time**, followed by waiting for
its output. Do not infer a missing installation from remoteadmin's PATH.

- SSH login is `remoteadmin`; the Python/uv owner and desktop account is `admin2`.
- `uv` already exists at `/home/admin2/.local/bin/uv`. No reinstall is needed just
  because `command -v uv` is empty as `remoteadmin`.
- Shared evaluation interpreter: `/opt/jaitraplay/.local/face-eval-venv/bin/python`.
  It is a symlink to
  `/home/admin2/.local/share/uv/python/cpython-3.12-linux-x86_64-gnu/bin/python3.12`.
- `/home/admin2` is mode `750`, owned by `admin2:admin2`. Thus remoteadmin gets
  `Permission denied` following this symlink even though the shared venv directory
  is accessible. This is expected account isolation, not a broken Python install.
- Run evaluation commands as `admin2` through sudo. Do not chmod the home directory,
  change ownership recursively, recreate the environment, or use remoteadmin's
  system Python 3.14 as a substitute for the existing evaluation Python 3.12.
- Owner-confirmed CUDA check on September 11: `cuda_kernel_verified: true`,
  ONNX Runtime `1.23.2`, providers `CUDAExecutionProvider`, `CPUExecutionProvider`.
  CPU appearing second is normal: the test verified a CUDA kernel actually ran.
- Owner-reported GPU: NVIDIA GeForce RTX 3050, 6144 MiB, driver `595.84`.
- Latest owner-reported remote HEAD: `84f06dc`. Untracked local files to preserve:
  `config.yaml.before-storybook`, `run-jaitra.sh`, `run.sh.backup-20260908-183514`.
- `.local/models/insightface` and `.local/face-eval-venv` exist. At that check,
  `.local/face-eval` did not exist. No new recordings have been confirmed.

Verified command, from remoteadmin's SSH terminal:

```bash
sudo -iu admin2 /opt/jaitraplay/.local/face-eval-venv/bin/python /opt/jaitraplay/deploy/face_eval/check_cuda.py
```

Owner-confirmed model smoke check on September 11: buffalo_l detection and
recognition loaded with CUDA/CPU providers, the recognizer returned a finite
512-dimensional embedding, and `buffalo_l_inference_verified` was true. The
reported synthetic cold smoke time was about 574 ms. This is model-installation
evidence, not measured recognition accuracy, steady-state latency or end-to-end FPS.

## Installed tools: confirmed by owner output

- `uv` is at `/home/admin2/.local/bin/uv`, version `0.12.9`.
- `remoteadmin` does not have `uv` on PATH, even after adding its own `.local/bin`.
- Node is system-wide at `/usr/bin/node`, version `22.22.1`.
- npm is at `/usr/bin/npm`; installation output reported version `9.2.0`.
- `/home/admin2/.nvm/nvm.sh` **does not exist**. Do not assume NVM is installed.
- `apt update` succeeded; installed and candidate Node packages were both
  `22.22.1+dfsg+~cs22.19.15-1ubuntu1`. No newer Node was offered by configured repos.
- `npm ci` warned that `jsdom@30.0.1` needs Node `^22.22.2 || ^24.15.0 || >=26.0.0`.
  Installation and the production build succeeded. Ubuntu tests have not been
  validated under this Node version; do not claim the warning is resolved.

## Deployment progress on September 8

Earlier handoff recorded Ubuntu at `226b896` and GitHub at `1f6b59d` (persistent
Jaitra recognition and voice capture fixes). During this conversation:

1. Owner reported successful Python dependency sync as `admin2`:
   `sudo -u admin2 -H /home/admin2/.local/bin/uv sync --locked --dev --extra voice`
2. `npm ci` as `admin2` succeeded: 243 packages added, zero reported vulnerabilities.
3. Production build as `admin2` succeeded with Vite 8.2.2, 37 modules transformed,
   and a face-recognition asset. A large-chunk warning was nonfatal.

Commands were run from `/opt/jaitraplay`. Exact current Ubuntu HEAD has not been
shown after the update; do not equate successful build output with a verified Git
commit. Subsequent owner logs proved a successful build and CORE_READY, followed
by Electron's chrome-sandbox ownership/mode failure. Owner confirmed applying
root:root ownership and mode 4755 to `node_modules/electron/dist/chrome-sandbox`.
Subsequent interactive feedback establishes app use, but saved recognition and
reboot acceptance remain unverified. `npm ci` may replace that helper; if the same
sandbox error returns, repair its ownership/mode again rather than disabling the
production sandbox.

## Repository launcher and Ubuntu transition

`run.sh` is now tracked in the repository, based on the owner's existing Ubuntu
launcher. It resolves the checkout from its own location, adds the runtime user's
`.local/bin` to PATH, checks dependencies, preserves existing config, builds the
UI, starts `deploy/scripts/run-core.sh` (which preserves `--extra voice`), waits
for snapshot readiness with bounded requests, and launches installed production
Electron with both development environment overrides cleared. It stops its core
process on exit and fails if the core exits or readiness times out. No NVM is
required. Shell syntax was checked locally; graphical Ubuntu execution remains
unverified. Run as `admin2` in the Ubuntu desktop session.

**Ubuntu now uses the tracked launcher:** owner acknowledged backing up the old
local script and pulling, and supplied a report from the new logger. Future updates
use a normal fast-forward pull; do not repeat the untracked-file migration.
Give the owner one step at a time.

`run-jaitra.sh` remains a separate local/untracked Ubuntu launcher, owned by
`remoteadmin:jaitra`; it is not available in this development checkout. Earlier
handoff says it checks dependencies, runs `uv sync --dev`, builds, starts core,
waits for API, launches production Electron, and cleans up core on exit. Its
missing voice extra has not been corrected; prefer the tracked `run.sh` after
updating. The earlier proposed sed change to the appliance's local `run.sh` was
not confirmed executed before the owner requested a tracked replacement.

Do not substitute `deploy/scripts/run-ui.sh`: it starts development Electron and
expects a separate Vite server. App autostart, desktop shortcuts, and `admin2`
user services were not verified. Do not assume repository app units are installed.

## Known manual startup commands (fallback, not yet run for this update)

Core can run remotely as the runtime user, with the terminal left open:

```bash
sudo -u admin2 -H bash -lc 'cd /opt/jaitraplay && bash deploy/scripts/run-core.sh'
```

Production Electron must be launched in `admin2`'s graphical desktop terminal:

```bash
cd /opt/jaitraplay
env -u ELECTRON_RUN_AS_NODE -u JAITRA_UI_DEV_URL \
  JAITRA_CORE_URL=http://127.0.0.1:8765 \
  ./node_modules/.bin/electron .
```

Core endpoint: `http://127.0.0.1:8765`; health and snapshot paths are
`/api/v1/health` and `/api/v1/snapshot`. Keep the loopback boundary.
For manual startup, exit Electron and stop core with Ctrl+C before restarting.
Prefer the corrected existing launcher once its update is verified.

## Launch logs and sharing failures

The tracked `run.sh` now creates a private, timestamped `.local/logs/run-*`
directory for each launch. `launcher.log` captures terminal output including build
and Electron errors, commit, stage, and final exit status. `core.log` captures the
core separately. `.local/logs/latest-run` points the collector to the most recent
run; `.local/logs/core.log` is a compatibility symlink to that run's core log.
Logs remain local and Git-ignored; no automatic upload or deletion is performed.

After a failure, from `/opt/jaitraplay`, run as `admin2` (or remotely using sudo):

```bash
sudo -u admin2 -H python3 /opt/jaitraplay/deploy/scripts/collect-diagnostics.py
```

This prints the path of a `share-diagnostics-*.txt` file containing at most the
last 1 MiB of each latest-run log. It excludes config, environment dumps,
provider profiles, recordings, and identity files. Common credential patterns
and URLs are redacted, but this is best effort: review the report before sharing.
The report has mode 600. To read it remotely, use `sudo -u admin2 cat` with the
exact printed path, then copy the text into chat; alternatively attach the file
from the Ubuntu desktop. Give these actions one at a time to the owner.

Original logging/collector use was verified by owner-supplied output. Expanded
structured diagnostics described below require pulling the new update.

## Provider timer details

Previously verified installed and enabled system units:

- `/etc/systemd/system/jaitra-provider-health.service`
- `/etc/systemd/system/jaitra-provider-health.timer`
- Runtime override: `/etc/systemd/system/jaitra-provider-health.service.d/user.conf`
- Runs as `admin2:jaitra`, executing
  `/opt/jaitraplay/deploy/scripts/check-provider-health.sh`.
- Runs at minutes 00 and 30, with `Persistent=true`, independently of the app.
- Checks configured text providers and ElevenLabs. No new timer is needed.
- Last observed run in the earlier handoff exited 1; individual current provider
  status is not established. ElevenLabs is monitoring-only, not interactive voice.

Diagnostics, when needed (provide individually to the owner):

```bash
systemctl list-timers jaitra-provider-health.timer --no-pager
sudo journalctl -u jaitra-provider-health.service -n 100 --no-pager
sudo -u admin2 cat /opt/jaitraplay/.local/state/provider-health.json
```

An on-demand `sudo systemctl start jaitra-provider-health.service` makes real API
requests and consumes usage. Pulling checker code does not require reinstalling
the timer. If installed unit definitions change, update the installed files before
daemon-reload/restart; daemon-reload alone does not copy repository templates.


## September 8 feedback fixes and current acceptance boundary

Owner reported: logo missing in games, controls at top-right, EMEET speech not
recognised despite normal external recordings, tracked hand/person but no gesture,
and repeated storybook failure. Implemented changes:

- Persistent bottom-left logo on every screen, opacity 0.4 in games (60%
  transparency). App controls and Setup/identity close controls are left-aligned.
- Voice: live input meter, browser noise-cleanup toggle (off by default for
  hardware-processed speakerphones), strongest-channel capture, bounded quiet PCM
  gain up to 8x, 6.5-second answer window, and explicit missing-device errors.
  Setup starts with `blue` rather than the model-unfriendly proper name `Mimo`.
  Recognition remains local Vosk. No acoustic voice training or cloud audio upload.
- Gestures: shoulder-relative distances for raised hands and waves, chest-height
  waves, a three-second movement history, and shorter camera scheduling delay.
  Identity enrollment uses the same raised-hand rule. Multiple-person ambiguity
  and explicit enrollment confirmation remain. Supported gestures are raised
  hand(s) and side-to-side waving, not arbitrary finger signs.
- Storybook: accept PNG/JPEG/WebP with matching file extension and HTTP MIME type,
  normalize OpenRouter profile base URL, accept OpenAI-style profile keys, avoid
  duplicated `/v1` on text requests, and stop queued page work on failure.
  Requests still use the configured model and canonical reference; no silent
  substitute illustrations. Provider HTTP status, story/page IDs, and stages are
  logged without response bodies or story prompts. Error screens identify the
  stage and a support reference. Live paid generation has not been tested here.
- Diagnostics: renderer errors, capture levels/rate/gain, recognition word count,
  gesture summaries and inference time, request ID correlation across Electron
  and core, and provider stage/status. No raw audio/video, face descriptors,
  device IDs, transcripts, or prompts are emitted by the new diagnostic events.
  `diagnostics.jsonl` rotates at 2 MiB with one backup per run. Existing launcher
  and core stdout logs remain local and unrotated.

One-command report creation AND display, from the remote maintenance terminal:

```bash
sudo -u admin2 -H python3 /opt/jaitraplay/deploy/scripts/collect-diagnostics.py --print
```

Review then paste the output into chat (or attach the generated file). This does
not automatically upload to a chat; no authenticated chat-upload integration is
configured. The collector includes latest launcher/core logs and both structured
diagnostic segments, last 1 MiB each, with best-effort redaction.

Tests cover quiet gain, missing selected microphone, multichannel worklet capture,
distant chest-height waves, body-motion rejection, image format handling, profile
normalization, provider status redaction, and report export. Local Electron visual
checks use mock APIs and a temporary WSL-only harness; they do not establish Ubuntu
camera/microphone performance. Across-room EMEET recognition and the actual
storybook provider failure still require a physical retry with the new diagnostics.

Next deployment: fast-forward pull as `remoteadmin`, then run `./run.sh` from
`admin2`'s graphical desktop. No dependency changes require `npm ci` for this update.
If failures remain, use the report command above before proposing further fixes.

## Face and body recognition strategy — agreed September 9

The current recognition behavior is a baseline to measure, not the target design.
Do not replace it, tune its threshold, enlarge its detector, change camera geometry,
or build the final enrollment wizard until the baseline evaluation below exists.
The earlier proposed 24-view guided-enrollment implementation was set aside under
the Git-ignored `.local/identity-drafts/`; it is not part of the application.

### Product and identity rules

- Use computer vision locally. OpenRouter and other language-model services have
  no role in face detection, embeddings, matching, pose estimation, or tracking.
- Face is the identity evidence. Body pose follows an already face-confirmed child
  and supports gestures, position, and continuity. Clothing, body shape, or height
  must never independently confirm identity. Height may only reject implausible
  candidates or prioritize work.
- Show three distinct states in the eventual product: **face confirmed**,
  **following a previously confirmed track**, and **identity uncertain**. Do not
  present hand-raise selection as facial recognition.
- Never silently learn from a live or uncertain match. Parent confirmation is
  required for enrollment and any later gallery update.
- Let the parent assign Jaitra, Father, Mother, or Other to numbered live tracks
  during an evaluation. These labels are session annotations: show them in the
  overlay and diagnostic log, clear them when the camera restarts, and require
  reassignment after a track-number change. They must not override automatic face
  decisions, persist as identity profiles, or count as recognition success.
- The instrumented baseline retains recent tracks for up to 2.4 seconds and can
  associate a face-only observation when pose loses the shoulders. This is a
  narrow fix for stationary-person renumbering and brief detector gaps. It is not
  the final time-spread identity tracker, and ambiguous crossings must still create
  uncertainty rather than transfer a label.
- Store embeddings and calibration locally. Normal recognition saves no frames.
  Evaluation recording is explicit and opt-in; its raw videos contain sensitive
  biometric data and stay in the Git-ignored `.local/face-eval/` directory.
- Jaitra is four years old, so plan for appearance drift. Re-enrollment must be
  triggered by measured degradation in held-out checks or similarity distributions,
  not a guessed calendar interval. A short periodic recognition check can reveal
  drift; parent-approved targeted enrollment can then repair missing conditions.

### Model architecture

- Preserve the current `@vladmandic/face-api` detector, 128-value descriptor,
  640-pixel analysis width, CPU backend, and current mean-of-top-three Euclidean
  threshold as the browser baseline. Request a 1920×1080 camera source and require
  at least 1280×720 for evaluation recordings, while continuing to downsample live
  inference to 640 pixels. This retains source detail for later resolution tests
  without changing the baseline model input.
- Benchmark InsightFace `buffalo_l`: SCRFD detection plus ArcFace R50 512-value
  embeddings, L2 normalization, and cosine similarity. It is allowed for this
  family build. Run it locally through ONNX Runtime GPU on the Ubuntu appliance.
- Keep the candidate embedder behind a thin interface solely so the benchmark can
  swap model packs without rewriting clip loading, gallery construction, scoring,
  or reports. This is an evaluation boundary, not a licensing abstraction.
- Keep detection, embedding, gallery scoring, and track aggregation distinct.
  Report which complete pipeline is tested. A stronger embedder cannot recover a
  face that was never detected or image detail discarded before inference.
- The primary gallery comes from curated frames recorded by the deployment camera
  in the actual room. Score against retained normalized embeddings; the current
  ArcFace experiment uses maximum cosine similarity. Compare this deliberately
  with centroid or other aggregation only if the labelled evaluation justifies it.
- Historical parent-confirmed photos may form a separately named secondary-gallery
  experiment. Never mix them silently into the primary gallery or held-out test.

### Required order of work

1. **Instrument the unchanged build.** Opt-in logging records each processed
   timestamp, source/analysis dimensions, every detected face box in pixels,
   detector confidence, variance of Laplacian, mean crop luminance, nearest and
   mean-top-three Euclidean distances, match decision, tracker decision, and
   detector/total latency. Empty detections and pipeline errors must remain visible.
   Descriptors and images must not enter the JSONL log.
2. **Observe real failures.** Reproduce the existing problem before interpreting
   it. A missing or very small face suggests geometry/detection/occlusion; a clean
   face with persistently weak similarity suggests alignment, gallery mismatch, or
   embedder limitations; a strong wrong-person score suggests gallery/threshold or
   association failure. These signatures may coexist and are diagnoses to test,
   not automatic conclusions.
3. **Build a labelled evaluation set.** Record 15–20 clips of 20–30 seconds:
   entering, floor play, sitting, turning away, walking across the frame, near and
   far, daylight and evening light, parent alone, parent and child together, and a
   consenting visitor if available. Label all visible faces, including misses.
   Explicitly label no-face frames. Split by independent capture session into
   enrollment, calibration, and test. Never split adjacent frames across sets.
4. **Benchmark the two complete pipelines.** Use the same labelled clips and the
   same 640-pixel analysis width first. Build each gallery only from enrollment
   sessions. Compare face-api and buffalo_l by ground-truth source face width:
   `<40`, `40–60`, `60–90`, `90–130`, and `130+` pixels. Report detection recall,
   child misses, false accepts, unmatched accepted detections, gallery size, and
   latency. Raw correlated frame counts are not independent accuracy trials.
5. **Run resolution and geometry experiments.** After the equal-input comparison,
   evaluate source-resolution processing separately. Use results to choose capture
   resolution, analysis width, camera position, and the part of the room where
   recognition is supported. Prefer placement near the child's usual eye height
   when the measurements show steep pitch or distance is damaging results.
6. **Calibrate on calibration sessions only.** Sweep thresholds using higher-is-
   better scores: negative Euclidean for face-api and cosine for ArcFace. The cost
   of incorrectly identifying someone as Jaitra must determine the operating point;
   the small family dataset cannot prove a population-scale false-accept rate.
   Freeze the selected pipeline and threshold before opening the test results.
7. **Add time-spread track evidence.** Track multiple people with stable application
   track IDs, associate each detected face to one body/track, and refresh identity
   only from confident face evidence. Aggregate embeddings or use a k-of-n vote
   sampled hundreds of milliseconds apart across the track, with hysteresis. Three
   adjacent processed frames are too correlated to count as independent evidence.
   Crossings, disappearance, re-entry, and ambiguous face/body associations must
   return to uncertain rather than transfer identity.
8. **Build the setup experience around the proven pipeline.** The child-facing
   procedure should be short and playful: record 60–90 seconds of normal play,
   automatically propose sharp, well-lit, diverse views from actual operating
   distances, and ask the parent to confirm them. Use small guided prompts only to
   fill missing left/right, pitch, expression, distance, or lighting coverage.
   Reject blur, clipping, unusably small faces, poor exposure, near duplicates, and
   samples inconsistent with the confirmed child. More samples are not inherently
   better; roughly 12–15 diverse retained embeddings are an initial hypothesis to
   validate rather than a fixed quota.
9. **Calibrate body behavior separately.** Observe normal sitting, standing,
   walking, and hand movements; check which landmarks and room areas are actually
   visible. MediaPipe Pose Landmarker is configured for up to four poses, but its
   result order is not persistent identity. Evaluate our association and track IDs
   explicitly when adults and the child overlap or cross. Consider a person detector
   and dedicated multi-person tracker only if measured failures require it.
10. **Run held-out acceptance.** Test entry/re-entry, sitting and standing, gentle
    turns, close/far positions, lighting, parent alone, multiple people, crossings,
    and temporary face loss. Report condition-level passes, misses, false accepts,
    recognition delay, and identity switches. Save the new live pipeline only after
    these held-out results and the operating tradeoff are reviewed.

The working instrumentation, recorder, local labelling page, baseline replay,
InsightFace runner, CUDA checks, scorer, limitations, and commands are documented
in `deploy/face_eval/README.md`. That file is the operational authority for the
evaluation format; this section is the strategy and sequencing authority.

### CUDA and Ubuntu status

On September 9, remote inspection confirmed the RTX 3050 and driver 595.84. The
existing application `.venv` had no ONNX Runtime or InsightFace. A separate
`/opt/jaitraplay/.local/face-eval-venv` was created with Python 3.12.14,
ONNX Runtime GPU 1.23.2, packaged CUDA 12 runtime libraries, cuDNN 9, and
InsightFace 0.7.3. ONNX profiling confirmed an actual CUDA matrix-multiplication
kernel. buffalo_l SCRFD completed detector inference and ArcFace returned a finite
1×512 embedding; both sessions selected `CUDAExecutionProvider`. These are
installation smoke tests only. No child image or camera clip was used, so accuracy
and steady-state latency are still unknown. Do not describe CUDA capability alone
as recognition acceptance.

The evaluation environment is deliberately separate from the core `.venv`; do not
add InsightFace or GPU libraries to the live core until the benchmark selects that
pipeline. The current live browser pose GPU option is WebGL, not CUDA.

### Deployment required for this evaluation increment

The application update consists of the modified identity UI/detector files, new
`apps/ui/src/identity` experiment modules, `deploy/face_eval`, the CUDA setup
script, tests, and documentation. It adds no npm runtime package, changes no core
schema, and requires no database migration. After the changes are committed and
pushed, update `/opt/jaitraplay` with a normal fast-forward pull as `remoteadmin`.
Then launch `./run.sh` from `admin2`'s graphical desktop; its normal build includes
the new instrumentation UI. `npm ci` is not required unless `node_modules` is
missing or the lockfile changed. If `npm ci` is run, recheck Electron's
`chrome-sandbox` ownership/mode because npm may replace it.

The isolated CUDA evaluation environment is already installed and smoke-tested on
this appliance. Its current files are owned by `remoteadmin:jaitra` with group-write
permissions, so `admin2` can reuse them. After the repository update, run the
checked-in verification once as `admin2` so the environment is reproducible from
repository sources:

```bash
cd /opt/jaitraplay
JAITRA_EVAL_UV=/home/admin2/.local/bin/uv bash deploy/scripts/setup-face-eval.sh
```

This downloads large pinned CUDA/cuDNN/ONNX packages and buffalo_l only when absent;
it does not alter the NVIDIA driver. Do not run it on each app launch. Evaluation
clips and manifests are local data and are never deployed through Git; collect them
on Ubuntu into `/opt/jaitraplay/.local/face-eval/` after the updated UI is running.
