# JAITRA Play

JAITRA Play is a local-first, child-facing learning companion for an Ubuntu TV appliance.

See [cloud.md](cloud.md) for the complete project reference: architecture, APIs,
configuration, cloud integrations, persistence, deployment, and known implementation gaps.

This repository currently implements Release **0.1a-1** from the approved PRD, HLD, and LLD in [`docs/`](docs/):

All character depictions and generated media must follow the canonical
[JAITRA Play Character Bible](docs/CHARACTER_BIBLE.md).

- authoritative Python core with typed configuration;
- SQLite migration and recovery foundations;
- versioned local content validation;
- loopback-only REST and WebSocket contracts;
- authoritative `BOOTSTRAP -> IDLE -> WELCOME -> HUB` state flow;
- Electron/React child shell with branded recovery;
- development service and deployment assets.

The current working tree also includes provider-generated quizzes, curated offline challenges,
room hunts, hint history, optional local English speech recognition, and a local camera setup
for position and gestures. Identity recognition, a full parent mode, and controlled video
playback are not implemented. Gameplay uses the core's question API; rounds and scores remain in the UI.

Questions are remembered on this appliance across app restarts (the latest 120 rounds).
Provider repeats are rejected using prompt similarity and recent answer targets. Games mix
provider questions with local picture identification, counting, odd-one-out, colour/shape,
memory, and riddle challenges. Local pools use unseen questions first, then the least recently
seen once exhausted; unlimited uniqueness is not guaranteed. Room hunts are self-reported,
skippable look-and-point activities and do not use a camera.

Use **Exit app** from any screen, or press **Escape**, then choose **Exit now**.
Electron closes to the desktop; browser development mode shows a goodbye screen.
If you previously installed the Ubuntu user service, update it so a normal exit stays closed:

```bash
bash deploy/scripts/render-dev-units.sh
mkdir -p ~/.config/systemd/user
cp .local/systemd/jaitra-ui.service ~/.config/systemd/user/jaitra-ui.service
systemctl --user daemon-reload
```

The UI unit now uses `Restart=on-failure`. Restart the core to apply the question-history
migration and rebuild/restart the UI after updating the checkout.

## Development and deployment environments

Development happens on a Windows machine without a GPU (the current shell workspace is
accessed through WSL). Deployment happens on a separate Ubuntu machine with a GPU.
Do not infer deployment hardware from the development workspace.

Target hardware reported by the owner on September 5, 2026:

- Ubuntu 26.04 LTS, x86-64.
- AMD Ryzen 5 5500: 6 cores, 12 threads.
- 14 GiB usable RAM.
- NVIDIA GeForce RTX 3050 with 6 GB VRAM.
- NVIDIA driver 595.84; `nvidia-smi` reports CUDA 13.2.

Keep local development and automated tests usable without a GPU or CUDA. Any future
GPU inference backend must be optional, with a CPU development path and explicit
deployment configuration. Validate GPU dependencies, performance, and recognition
quality on the Ubuntu target; Windows/WSL checks do not establish GPU readiness.
The current Vosk speech backend runs on the CPU in both environments.

## Prerequisites

- Python 3.12 or newer
- [`uv`](https://docs.astral.sh/uv/)
- Node.js 22 or newer and npm

## Core development

```bash
uv sync --dev
cp deploy/config/config.example.yaml config.yaml
uv run jaitra-content validate content/packs/core-en-01
JAITRA_CONFIG=config.yaml uv run --extra voice jaitra-core
```

The local core listens on `127.0.0.1:8765`. It deliberately refuses non-loopback production bindings.

## UI development

```bash
npm install
npm run dev
```

Run Electron in a second terminal after the Vite server starts:

```bash
npm run electron:dev
```

## Verification

The Ubuntu `./run.sh` launcher saves each run under `.local/logs/run-*`, including
build/Electron output in `launcher.log` and backend output in `core.log`. The
launcher prints the log directory and exit status. After a failure, create a
shareable report as the runtime user:

```bash
python3 deploy/scripts/collect-diagnostics.py
```

Review the printed `share-diagnostics-*.txt` file and attach it to your support
chat, or copy its text. It includes only the latest launch logs, with common
credential patterns and URLs redacted; redaction is best effort. Configuration,
saved identity files, and provider profiles are not collected. Nothing is
uploaded automatically. Logs are local, Git-ignored, and retained until removed.

```bash
uv run pytest
uv run ruff check .
uv run mypy apps/core/jaitra_core
npm test
npm run build
```

Runtime data defaults to `.local/state/`, which is ignored by Git.

## Claude Code provider profiles

This checkout uses three provider profiles in this order for generated questions:

1. MWAPI (`https://api.mwapi.dev`) from `.claude/settings.local.json`.
2. StartupAPI (`https://startupapi.io`) from `.claude/settings.startupapi.json`.
3. OpenRouter from `.claude/settings.openrouter.json`.

All three local settings files are Git-ignored. Replace placeholder credentials in each
profile with real tokens. The application question service automatically tries the next
profile when a request fails or returns an invalid question.

Claude Code itself does not automatically fail over between base URLs. To use StartupAPI
for Claude Code, copy `.claude/settings.startupapi.json` over `.claude/settings.local.json`,
restart Claude Code, and use `/status` to verify the active base URL. Use the corresponding
OpenRouter file the same way when switching to the third provider.

## Voice answers (English, local)

Install dependencies and the [official Vosk English model](https://alphacephei.com/vosk/models)
on each Ubuntu appliance:

```bash
uv sync --dev --extra voice
python3 deploy/scripts/setup-voice.py
```

Add this to `config.yaml`, then restart the core and rebuild/restart Electron:

```yaml
voice:
  enabled: true
  model_path: .local/models/vosk-model-small-en-us-0.15
```

```bash
npm run build
JAITRA_CONFIG=config.yaml uv run --extra voice jaitra-core
```

The systemd core launcher includes the voice extra. In development, run Vite and Electron
as described above. Use `--extra voice` with `uv run` to keep the optional package installed.

In Picture Guess, Colour Quest quizzes, or Riddle Garden, select **Speak answer** and say one
visible answer such as “blue”, “elephant”, or “three”. Listening stops after four seconds and a
clear match is submitted automatically. Recognition is limited to the visible choices, improving
accuracy and preventing unrelated speech from selecting an answer. Touch controls remain available.
Memory cards and room hunts currently use touch controls.

Microphone access is requested only after selecting the voice button. Recording stops on leaving
a round, hiding the app, or opening Exit. Audio is sent only to the loopback core, processed in
memory, and never saved or sent to question providers. Practice transcripts are discarded unless
a grown-up explicitly saves a word correction in Setup. There is no background listening or wake
word. Camera access is enabled only when a camera preview is explicitly started. If the package/model is missing or disabled, voice
buttons are hidden and games remain usable.

For Ubuntu, select and test the input device in **Settings → Sound → Input**. Browser development
mode also needs microphone permission. WSL microphone forwarding depends on the host setup;
recognition quality, especially for young children, accents, and room noise, needs testing on
the actual appliance. Missing/denied microphones show a retry message instead of blocking play.

Capture uses the device's default audio rate (16, 44.1 or 48 kHz), with browser echo
cancellation, noise suppression and automatic gain control requested. No additional
cleanup API is required. The microphone tracks and audio context are closed after
capture. A “sent silence” message means check mute/input volume; “sent no audio”
means the capture pipeline delivered no samples. A recognition failure means check
the core/model, whereas an empty transcript means the recognizer found no words.
Setup saves text aliases only; it cannot learn a voice from an empty transcript.

An optional future ElevenLabs key can be kept in `.local/secrets/elevenlabs.env`
as `ELEVENLABS_API_KEY=...` (ignored by Git; keep file permissions at `600`).
The scheduled provider health checker loads this file for its ElevenLabs probe.
The interactive app still uses local recognition and does not upload child audio.
On a separate appliance this file must be created there; a local file is not deployed
automatically. Never put the key in UI settings or a `VITE_` environment variable.

## Remember Jaitra across sessions

Open **Remember Jaitra** in the top bar. This first version supports one saved
identity, Jaitra, with up to four visible people in the camera frame.

1. Select **Start recognition**, then **Enroll Jaitra**.
2. Ask Jaitra to lower his hand, then raise it and hold it up. If more than one
   person raises a hand, lower the other hands and repeat.
3. Check the highlighted person and select **This is Jaitra — capture his face views**.
4. Capture the six prompted views: front, slightly left and slightly right. Wait
   for a fresh frame between captures and keep his face visible. If tracking is
   lost, select him again; incomplete views are discarded.
5. Select **Save Jaitra for future sessions**. Closing the panel keeps recognition
   running, with a visible camera status. **Pause recognition** releases the camera.

The core saves only face descriptors, not photos/video, under the configured
state directory at `identity/jaitra.json` (default `.local/state/identity/jaitra.json`).
The folder/file are created with owner-only permissions on Linux. The profile is
loaded on later app starts, which resume recognition automatically. Use **Forget
Jaitra** to delete it or **Enroll Jaitra again** to explicitly replace it. Backups of
the state directory also contain the profile; deletion does not erase backups.

Matching uses a pinned, local face model and several agreeing frames. Position
tracking follows an already selected person while the face turns away. Ambiguous
crossings, a conflicting face, missing frames or disappearance drop the selection.
If uncertain, Mimo asks “Is it you, Jaitra?” and requests a fresh hand raise. That
confirmation selects a session track only and never edits the saved profile.
A continuously visible person is not greeted repeatedly; return greetings have
at least a 60-second cooldown. Prompts also appear as text if local speech is unavailable.

Recognition pauses when the app is hidden, Setup/Camera view/Exit is open, or the
camera stops. It resumes after those panels close. Game-time recognition is silent
to avoid interrupting game audio. This is not background monitoring while the app
is closed. Detection thresholds and recognition accuracy still need a physical
trial with Jaitra, including crossings, return visits and side/back views. A full
back view is not a persistent biometric identifier; it may require the gesture.

The `jaitra:participant` UI event supplies only the selected name, session track,
selection source, current body points and timestamp (or null when lost). This is
the integration point for future movement games; jumps, claps and their scoring
are not implemented by this recognition feature. Other family profiles are not yet supported.

Install updated npm dependencies and run `npm run build` on the appliance; the
camera setup step copies local face models from the pinned npm package. Restart
the core and UI so the new identity API and screen are both active. No ElevenLabs
key or cloud recognition service is used for this feature.

## Setup: voice practice, camera position and gestures

Use **Setup** in the top bar, including from the recovery screen. It provides:

- A two-step microphone and camera test with optional device selection.
- **Save correction** to save an explicitly confirmed transcription correction on this
  device. Corrections apply only to matching choices in a quiz and never override an existing
  direct match. This is vocabulary correction, not acoustic-model fine-tuning. Clear corrections
  at any time. No voice recordings are retained.
- Camera selection, mirrored preview, and **Test camera / Stop camera** controls. CPU processing
  is used for the setup test; pose confidence is tuned for children and partial framing.
- Presence, mirrored left/centre/right screen position, a raised hand, both hands raised,
  and a wave (repeated side-to-side wrist movement).
- An optional collapsed section for up to eight named room zones. With the camera fixed, draw rectangles over floor areas in
  the preview. Zone detection uses the visible ankle midpoint; keep the whole body in view.
  Hidden feet and overlapping zones produce an unknown/uncertain result. These are approximate
  image-based room zones, not metric 3D tracking. Re-mark zones after moving the camera.

The detector tracks visible human poses, not a known child's identity. When it detects multiple
people, it reports ambiguity rather than attributing a gesture or location to the child.

Close Setup and open **Camera view** from the home screen, then select **Start camera**.
Setup, camera view, and application-quit controls are hidden inside a game; **Exit to home**
returns to the app chooser. Escape also returns home from a game. Entering a game closes camera
preview and releases its camera. Gestures currently produce
feedback only; they do not automatically select answers. Capture stops on closing the view,
opening Setup/Exit, hiding the app, or disconnecting the device. It does not restart automatically.

Camera frames stay in the renderer/worker and are not saved, uploaded, or sent to AI providers.
Only selected device IDs, named zone rectangles, and explicitly taught word corrections are
saved in local app storage. Browser development and packaged Electron have separate storage;
calibrate on the Ubuntu appliance. The core advertises camera as `CLIENT_MANAGED`; actual camera
readiness and capture state are shown by the UI.

### Camera assets and CPU/GPU operation

The first `npm run dev` or `npm run build` runs `npm run setup:camera`. It copies the pinned
MediaPipe runtime from npm and downloads the versioned Pose Landmarker Lite model from Google's
model host into `.local/models`. Subsequent runs reuse that local cache. Runtime inference is
offline. To prepare assets explicitly:

```bash
npm ci
npm run setup:camera
npm run build
```

The implementation uses [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
in a worker, with at most one frame in flight and a 200 ms pause between frames. CPU mode is the
default. On Ubuntu, select **Try GPU, fall back to CPU** in Setup and check the preview's active
backend label. This uses the browser's graphics delegate, not CUDA; Vosk speech remains CPU-based.
GPU initialization failure falls back to CPU. Runtime errors stop capture and offer retry.

Pose preprocessing needs WebGL even in CPU mode. WSL uses SwiftShader software rendering;
other GPU-less development setups can set `JAITRA_SOFTWARE_RENDERING=1` before launching Electron.
The Ubuntu target normally uses its native graphics driver. Test the camera's framing, lighting,
gesture thresholds, inference speed, and zone calibration with the actual child on that machine.

## Mimo reactions and game layout

Mimo waves hello, celebrates correct answers, and gives encouragement after an incorrect
answer. Hints also trigger a supportive reaction. Speech bubbles always show the message;
short spoken lines use an installed local English system voice when available. Speech starts
from interactions and stops before microphone capture, on leaving a game, or opening Setup/Exit.
System speech availability varies; this does not add a downloaded TTS model. Reduced-motion
preferences disable character animations.

Answer tiles use a flexible two-column layout with wrapping labels. Home retains Setup and
Exit app; each game has Exit to home instead of the administrative toolbar.

## Provider API health checks

Question delivery does not probe providers. The core keeps the latest routing flag in
`.local/state/question-provider-status.json`; a background monitor checks each configured
provider every five minutes and selects the first healthy provider in MWAPI, StartupAPI,
OpenRouter order. If generation fails, that provider is removed from routing immediately and
questions come from the local bank until a background check finds a healthy provider.

The persistent fallback bank is `.local/state/question-bank/questions.json`. On startup it
contains 220 unseen questions for each of the four question games. Its background builder
refills a game before its unseen count can fall below 200. Displayed and unseen records share
a hard cap of 1,000; the oldest displayed records are rotated out first. Current provider and
bank counts are also available from `GET /api/v1/health` as `questionProvider` and
`questionBank`.

Run all `.claude` provider text checks independently of the app:

```bash
bash deploy/scripts/check-provider-health.sh
```

The latest report is `.local/state/provider-health.json`. These are real, small
text-generation requests and consume provider usage. A systemd timer can run them
every 30 minutes, including when the app is closed. See
[installation and report details](cloud.md#independent-provider-health-checks).
