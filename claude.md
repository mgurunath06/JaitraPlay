# Ubuntu deployment handoff

Last updated: September 8, 2026. This record combines the earlier verified
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
