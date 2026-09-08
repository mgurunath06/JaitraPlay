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
commit. Updated core/UI startup, microphone/camera trials, saved recognition, and
reboot behavior have **not yet been confirmed**.

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

**Ubuntu transition is pending:** `/opt/jaitraplay/run.sh` was previously local
and untracked. Back it up/move it outside the checkout before pulling this new
tracked file, otherwise Git may refuse to overwrite it. Preserve the backup until
the repository launcher has been tested. Give the owner one step at a time.

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
last 128 KiB of each latest-run log. It excludes config, environment dumps,
provider profiles, recordings, and identity files. Common credential patterns
and URLs are redacted, but this is best effort: review the report before sharing.
The report has mode 600. To read it remotely, use `sudo -u admin2 cat` with the
exact printed path, then copy the text into chat; alternatively attach the file
from the Ubuntu desktop. Give these actions one at a time to the owner.

Logging changes and collector require pulling the update onto Ubuntu. Actual
Ubuntu startup and log sharing remain pending owner verification.

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
