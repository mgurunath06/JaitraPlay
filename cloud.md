# JAITRA Play project reference

Analyzed against the repository on 2026-09-06. This document describes the current
implementation, including the previously uncommitted gameplay, storybook, voice,
camera, and character assets. The package version is 0.1.0; the original bootstrap
milestone is 0.1a-1, but current features extend beyond that milestone.

## Purpose and deployment boundary

JAITRA Play is a local-first preschool learning companion for an Ubuntu TV
appliance. React runs inside Electron; a Python FastAPI process owns bootstrap,
configuration, content validation, question history, and the initial interaction
state. SQLite and generated stories live on the appliance. Cloud providers are
optional for quizzes and required for generating illustrated storybooks.

There is no cloud-hosted application deployment, infrastructure-as-code stack,
container deployment, GitHub Actions pipeline, or packaged installer in this
checkout. Pushing to GitHub publishes source; it does not update the appliance.

Development uses Windows/WSL without a GPU. The owner-reported deployment machine
is Ubuntu 26.04 LTS, Ryzen 5 5500, 14 GiB usable RAM, and an RTX 3050 with 6 GB VRAM
(reported September 5, 2026). This is deployment context, not hardware verified by
this analysis. Keep development and automated tests CPU-compatible.

## Repository map

| Location | Responsibility |
| --- | --- |
| `apps/core/jaitra_core/main.py` | Configuration, logging, runtime construction, Uvicorn entry point |
| `apps/core/jaitra_core/api/` | REST/WebSocket routes and strict Pydantic request/response models |
| `apps/core/jaitra_core/runtime.py` | Startup health, activity catalog, command dispatch, question coordination |
| `apps/core/jaitra_core/config/` | Strict YAML schema, defaults, validation, normalized settings hash |
| `apps/core/jaitra_core/state/` | Authoritative bootstrap/welcome/hub transitions |
| `apps/core/jaitra_core/persistence/` | SQLite connections, migrations, receipts, learning/question history |
| `apps/core/jaitra_core/content/` | Pack models, validation CLI, safe asset resolution |
| `apps/core/jaitra_core/providers/` | Cloud question generation, curated fallback variety, storybook jobs |
| `apps/core/jaitra_core/voice/` | Optional local Vosk recognition |
| `apps/core/jaitra_core/observability/` | Component health and structured lifecycle logging |
| `apps/ui/electron/` | Sandboxed window, permissions, preload bridge, loopback API calls |
| `apps/ui/src/app/` | Shell state, recovery polling, typed core client |
| `apps/ui/src/states/` | Home, recovery, quizzes/memory/hunts, storybook reader |
| `apps/ui/src/components/` | Mimo appearance, reactions, local system speech |
| `apps/ui/src/setup/`, `camera/`, `voice/` | Device calibration, pose observation, recording and answer matching |
| `apps/ui/public/camera/pose-worker.js` | Worker-based MediaPipe inference |
| `packages/contracts/` | Shared TypeScript API types and command JSON schema |
| `content/packs/core-en-01/` | Versioned content manifest and eight animal SVG assets |
| `content/characters/` | Canonical illustration reference |
| `migrations/` | Ordered, checksummed SQLite schema changes |
| `deploy/` | Example config, setup/launch/smoke scripts, systemd templates |
| `apps/core/tests/`, UI `*.test.*`, `tests/` | Automated verification |
| `output/imagegen/provider-comparison/` | Generated character comparison images; reference artifacts, not runtime inputs |
| `docs/` | Original PRD/HLD/LLD documents, bootstrap runbook, character bible |
| `pyproject.toml`, `uv.lock` | Python package, tools and dependency lock |
| `package.json`, `package-lock.json` | UI/Electron scripts and dependency lock |

## Architecture and runtime flow

1. `jaitra-core` loads YAML, constructs the runtime, and starts FastAPI on loopback.
2. Startup attempts optional voice initialization, opens/migrates SQLite, records
   the settings snapshot, checks database integrity, and validates content packs.
3. At least one configured activity must have a valid content pool. Successful
   bootstrap enters `IDLE`; runtime bootstrap failures enter `RECOVERY`. Invalid
   configuration or missing constructor-time resources can prevent server startup.
4. `BEGIN_INTERACTION` moves `IDLE` to `WELCOME`; `WELCOME_COMPLETE` moves to `HUB`.
   Command UUID receipts persist responses, so replay returns the recorded result.
5. Electron exposes a narrow preload bridge. Its main process calls the core;
   Vite development can instead proxy browser API requests. Production requires
   the Electron bridge. The UI retries snapshots to recover from core outages.
6. Game selection, rounds, scoring, and feedback currently run in React. The core
   generates questions and records question/hint history. Additional activity
   states exist as enum values but have no implemented command transitions.

Electron enables context isolation, sandboxing and web security, disables Node in
the renderer, blocks new windows/navigation, and limits media permissions to the
main app frame. Production enables fullscreen kiosk mode and disables DevTools.
This is a local trust boundary, not an authenticated public service.

## Features

### Games and Mimo

The hub offers Picture Guess, Colour Quest, Memory Match, Riddle Garden, and Mimo's
Storybook, capped by `ui.max_hub_choices`. Quizzes mix cloud output with curated
picture, counting, odd-one-out, colour/shape, riddle, memory, and room-hunt content.
Provider failure or repeated output falls back to local questions. History tracks
the last 120 generated questions across activities and restarts. Local pools use
unseen items first and then least-recently-used items; uniqueness is finite.

Hints can be recorded when the next request identifies a previous hinted prompt.
Room hunts are skippable, self-reported activities; camera observations do not
verify completion. Mimo shows encouragement, hints, celebrations and greetings,
with optional installed English system speech and reduced-motion support.

### Storybooks and cloud data flow

A typed or locally transcribed topic, or a randomly chosen built-in topic, starts
an asynchronous 15-page story. The UI polls progress every two seconds and reads
completed pages. Job states are `planning`, `illustrating`, `ready`, and `failed`.

Text generation tries these ignored local profiles in order:

| Provider | Profile | Code-selected text model |
| --- | --- | --- |
| MWAPI | `.claude/settings.local.json` | `claude-sonnet-4-6` |
| StartupAPI | `.claude/settings.startupapi.json` | `claude-sonnet-4-6` |
| OpenRouter | `.claude/settings.openrouter.json` | `openrouter/auto` |

Both services read an `env` object containing `ANTHROPIC_BASE_URL` and
`ANTHROPIC_AUTH_TOKEN`. Store real credentials only in these ignored files.
For OpenRouter use a base URL ending in `/api/v1`; story text appends
`/chat/completions`, and images append `/images`. Quiz OpenRouter requests use the
hardcoded chat-completions URL in `providers/questions.py`. Provider model names
and endpoint behavior above describe code configuration, not verified live availability.

Illustrations use OpenRouter, defaulting to `bytedance-seed/seedream-5-0-lite`, with
`JAITRA_STORY_IMAGE_MODEL` as an override. Each request includes the canonical
character reference image and character bible. Two image requests run concurrently
per story, with two attempts per image and a 240-second request timeout. Text
requests allow 90 seconds per provider; quiz requests allow 30 seconds per provider.

Cloud requests include quiz context/recent prompts or story topics, story scene
instructions, and the character material. Raw microphone audio and camera frames
are not sent to these providers. A spoken topic becomes text that is sent when
the user starts story generation. Cloud services may incur usage charges.

Story validation checks structure, character names, lengths, and blocked words;
illustrations are checked for PNG signature and a 25 MB size limit. These checks
do not establish comprehensive semantic moderation of generated text or images.
Canonical characters are Mimo, Mama Rabbit, Teacher Lily, and Papa Rabbit; all
depictions must follow [the character bible](docs/CHARACTER_BIBLE.md).

### Voice, camera, and local settings

Voice is optional CPU-based Vosk English recognition. Install the `voice` extra
and downloaded model, then enable it in YAML. Recording starts on explicit user
interaction, stops after eight seconds or relevant navigation, and uses in-memory
audio sent to the loopback core. Quiz users review the transcript before submitting.
Ambiguous matches do not choose an answer; touch remains available.

Setup stores device selections, explicitly taught word corrections, backend
preference, and up to eight rectangular room zones in renderer localStorage under
`jaitra.setup.v1`. Word corrections are vocabulary mappings, not acoustic training.
Browser and Electron storage are separate. No audio recordings are retained.

Camera preview is explicit and stops on relevant navigation/hide/disconnect.
MediaPipe Pose Landmarker Lite runs in a worker with one frame in flight and a
200 ms pause between frames. It reports presence, mirrored screen position,
raised hands, waves, and approximate zones from visible ankles. Multiple people,
hidden feet and overlapping zones produce uncertainty. It does not recognize a
child's identity, reconstruct metric 3D position, or submit game answers.

Camera frames stay in the renderer/worker. CPU is default; optional browser GPU
delegation falls back to CPU if initialization fails. Preprocessing still needs
WebGL; WSL uses SwiftShader. This is not CUDA inference. Test real recognition,
framing, permissions and GPU performance on the target appliance.

## API reference

Default base: `http://127.0.0.1:8765`. JSON properties use camelCase; strict models
reject unknown fields. Local FastAPI documentation is at `/docs` and
`/openapi.json` when running.

| Method/path | Behavior |
| --- | --- |
| `GET /api/v1/health` | Readiness and component health; inspect `ready`, not just HTTP success |
| `GET /api/v1/snapshot` | State, names, capabilities, activity descriptors |
| `GET /api/v1/activities` | Activity descriptors from the snapshot |
| `POST /api/v1/commands` | Versioned UUID envelope; success 200, rejected transition 409 |
| `POST /api/v1/activities/{activity_id}/question` | `previousPrompt`, `neededHint`, `recentPrompts`; generated/local question, unsupported/unavailable 503 |
| `POST /api/v1/voice/transcribe` | Base64 audio and `sampleRate` (16000/44100/48000); text, disabled 503, invalid audio 422 |
| `POST /api/v1/storybooks` | Optional topic (3–120 characters); returns job snapshot with 202; rejected topic 422 |
| `GET /api/v1/storybooks/{story_id}` | Current in-memory job snapshot; unknown ID 404 |
| `GET /api/v1/storybooks/{story_id}/pages/{page_number}/image` | Available PNG page 1–15; unavailable 404 |
| `GET /api/v1/media/{asset_id}` | Validated local SVG; missing/unsafe ID 404 |
| `WS /api/v1/events` | Sends initial snapshot, then receives client text; no ongoing state broadcast implemented |

Command body example:

```json
{"apiVersion":"1.0","requestId":"4a30bf37-e499-4835-937f-341b1653c42c","type":"BEGIN_INTERACTION","payload":{}}
```

## Configuration and persistence

Copy [the example YAML](deploy/config/config.example.yaml) only when creating a
new local configuration; preserve existing appliance settings during upgrades.
Unknown YAML keys are rejected. Schema version must be 1; child and companion
names must differ. Server hosts are restricted to loopback.

| Section | Purpose/defaults |
| --- | --- |
| `child`, `companion` | Required display names, 1–24 characters |
| `ui` | At most five hub choices; inactivity default 300 seconds; pointer visibility |
| `activities` | Required enabled list, difficulty default `easy` |
| `rewards` | Default stars 3/2/1; descending order required; delight probability 0.15 |
| `limits` | Volume 0.65; optional session/video minute limits |
| `logging` | Level `INFO`, configured retention 14 days |
| `server` | `127.0.0.1:8765` |
| `paths` | `.local/state`, `content/packs`, `migrations`, resolved against repository root |
| `voice` | Model `.local/models/vosk-model-small-en-us-0.15`; schema default disabled, example YAML enabled |

Several settings are validated foundations rather than fully enforced features;
in particular, do not assume session/video limits, reward persistence, inactivity
policy or log retention are complete merely because configuration accepts them.

Environment variables:

| Variable | Use |
| --- | --- |
| `JAITRA_REPOSITORY_ROOT` | Core resource root; defaults to working directory |
| `JAITRA_CONFIG` | YAML path; defaults to root `config.yaml` |
| `JAITRA_CORE_URL` | Electron core URL; defaults to loopback port 8765 |
| `JAITRA_UI_DEV_URL` | Electron development URL; enables development window/DevTools |
| `JAITRA_SOFTWARE_RENDERING=1` | Force SwiftShader for GPU-less Electron |
| `JAITRA_STORY_IMAGE_MODEL` | Override story illustration model |

SQLite uses WAL, foreign keys, `synchronous=NORMAL`, a 3-second busy timeout and
immediate write transactions. Tables comprise `schema_migrations`,
`settings_snapshots`, `command_receipts`, `diagnostic_events`, `content_versions`,
`learning_events`, and `question_history`. Some tables are schema foundations,
not fully populated application features. Settings snapshots include configured
names. Question history is pruned to 120 rows; other retained records have no
implemented automatic cleanup policy.

Migrations `0001_initial.sql`, `0002_learning_events.sql`, and
`0003_question_history.sql` run at startup. Applied SQL checksums are verified;
add a new numbered migration instead of changing released migrations.

Stories persist under `.local/state/storybooks/{uuid}/` as `story.json` and page
PNGs, using temporary-file replacement. Jobs are indexed only in memory: after
restart, existing files are not reloaded into the API, and unfinished generation
does not resume. There is no story library, deletion API, or retention limit.

For a consistent backup, stop the core and copy the complete state directory,
including any SQLite WAL sidecars. Back up local config and renderer settings
separately if needed. Restore with the core stopped and compatible application
code; there is no automated backup/restore or down-migration implementation.

## Setup, development, and verification

Prerequisites: Python >=3.12, `uv`, Node >=22, npm, and an appropriate graphical
session for Electron. From a fresh checkout:

```bash
uv sync --dev --extra voice
npm ci
cp deploy/config/config.example.yaml config.yaml
uv run jaitra-content validate content/packs/core-en-01
python3 deploy/scripts/setup-voice.py
npm run setup:camera
```

Voice setup is optional. Camera setup copies the pinned npm runtime and downloads
the versioned model into `.local/models`, then stages assets in ignored
`apps/ui/public/camera/vendor/`. `predev` and `prebuild` run camera setup
automatically. Prepare these caches while online for offline appliance use.

Start three terminals:

```bash
JAITRA_CONFIG=config.yaml uv run --extra voice jaitra-core
```

```bash
npm run dev
```

```bash
npm run electron:dev
```

Vite uses port 5173. The checked-in VS Code tasks also launch core, Vite and
Electron; the WSL task supports Windows-native Electron through
`deploy/scripts/run-windows-electron.ps1`. See [the runbook](docs/RELEASE_0.1a-1_RUNBOOK.md)
for that workflow; its original acceptance boundary predates the current games.

Verification commands:

```bash
uv run pytest
uv run ruff check .
uv run mypy apps/core/jaitra_core
npm test
npm run lint
npm run build
bash deploy/scripts/smoke-core.sh
```

`npm run build` produces `dist/ui` and `dist-electron`. The smoke script starts a
core on port 8765 using the example config and default local state. Use it with
that port free; it is not an isolated database test or a readiness assertion.
Unit tests use temporary/mocked dependencies and do not establish live provider
availability or physical-device behavior.

## Ubuntu operation and troubleshooting

After transferring/pulling source, install locked dependencies, prepare optional
models, keep the appliance's local config, and rebuild. Render service paths:

```bash
bash deploy/scripts/render-dev-units.sh
mkdir -p ~/.config/systemd/user
cp .local/systemd/jaitra-core.service .local/systemd/jaitra-ui.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now jaitra-core.service jaitra-ui.service
```

These are development user-service templates, not a complete auto-login/kiosk
deployment. Core uses `Restart=always`; UI uses `Restart=on-failure` so normal
Exit stays closed. After changes, restart core to apply migrations and restart
the rebuilt UI with `systemctl --user restart jaitra-core jaitra-ui`.

Use `systemctl --user status jaitra-core jaitra-ui` and
`journalctl --user -u jaitra-core -u jaitra-ui -n 100` for service diagnostics.
Check `/api/v1/health` and `/api/v1/snapshot` for state. `CORE_READY` and
`CORE_FATAL` are structured lifecycle events; provider failures log provider/error
types. Investigate config/content/storage for bootstrap failures, model/package
availability for missing voice, and device permissions/WebGL for camera failures.
Story failures require working text profiles, OpenRouter image access, the
character bible, and canonical PNG. Provider credentials remain on the core side.

Home exposes Setup, Camera view and Exit app. Games use Exit to home; Escape
returns home from a game and opens exit elsewhere. Browser exit shows a goodbye
screen; Electron closes to the desktop. Test shortcut escape, auto-login,
power cycles, device quality and process recovery on the Ubuntu appliance before
claiming production acceptance.

## Analysis findings and remaining work

- Hub descriptors currently use the static catalog and `max_hub_choices`, not
  the validated `activities.enabled` intersection. Configured content gating
  therefore does not fully govern visible or callable games.
- Rounds/scores are UI-local; durable rewards, sessions, full parent mode,
  identity recognition and controlled video playback are not implemented.
- WebSocket events are an initial snapshot only. API contracts are maintained
  manually in Python and TypeScript and must be updated together.
- A quiz can try three 30-second providers while Electron allows 70 seconds for
  the overall request; slow failover can outlast the caller. The question lock
  serializes generation, so slow providers also delay queued rounds.
- Story jobs lack restart recovery, global concurrency/rate limits, and storage
  cleanup. Per-story image concurrency does not cap all active stories together.
- Command receipt replay survives restart while state resets to `IDLE`; the
  receipt store is not durable reconstruction of the state machine. State is
  changed before the receipt transaction commits.
- Migration execution and receipt recording should not be treated as a complete
  crash-safe deployment/rollback system. Collect migration failure/power-loss
  evidence before relying on it for unattended upgrades.
- The API has no authentication or application rate limiting. Keep its existing
  loopback boundary; public hosting would require a separate security design.
- Generated content checks are limited. Automated tests do not certify semantic
  child suitability, live cloud behavior, GPU readiness or appliance acceptance.

## Git and documentation maintenance

Remote: `https://github.com/mgurunath06/JaitraPlay.git`; current branch: `main`.
Commit source, tests, migrations, dependency locks, documentation, canonical
assets and useful comparison artifacts. `.gitignore` excludes credentials,
SSH keys/launchers, local config, runtime state/models, dependencies, build output
and generated camera vendor files. Never force-add those local files.

Use `git status --short`, review the staged diff, run applicable checks, commit,
and push normally. Do not force-push over remote work. Keep this reference in sync
with behavior; [README.md](README.md) is the quick-start and detailed device guide,
while the original PRD/HLD/LLD are design intent rather than proof of implementation.

## Verification record

Checks completed successfully on 2026-09-06 in the development workspace:

| Check | Result |
| --- | --- |
| `uv run pytest` | 26 passed, Python 3.14.4 |
| `uv run ruff check .` | Passed |
| `uv run mypy apps/core/jaitra_core` | Passed, 24 source files |
| `npm test` | 30 passed across 8 files |
| `npm run lint` | Passed with zero allowed warnings |
| `npm run build` | Electron compilation, UI type checking and Vite production build passed |
| Content CLI validation | `core-en-01` valid, no errors or warnings |
| `bash deploy/scripts/smoke-core.sh` | Passed with port initially free; snapshot reached `IDLE`, voice available |
| `git diff --check` | Passed |
| Publishable-file credential-pattern scan | No matches for checked private-key/GitHub/OpenRouter token patterns; not an exhaustive secret audit |

Live paid providers and physical appliance checks were not performed. The smoke
check establishes startup and snapshot delivery, not microphone recognition quality.
