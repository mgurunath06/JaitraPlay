# JAITRA Play

JAITRA Play is a local-first, child-facing learning companion for an Ubuntu TV appliance.

This repository currently implements Release **0.1a-1** from the approved PRD, HLD, and LLD in [`docs/`](docs/):

- authoritative Python core with typed configuration;
- SQLite migration and recovery foundations;
- versioned local content validation;
- loopback-only REST and WebSocket contracts;
- authoritative `BOOTSTRAP -> IDLE -> WELCOME -> HUB` state flow;
- Electron/React child shell with branded recovery;
- development service and deployment assets.

Voice, camera, STT, TTS, LLM, identity, adaptation, parent mode, and controlled video are intentionally not part of this release.

## Prerequisites

- Python 3.12 or newer
- [`uv`](https://docs.astral.sh/uv/)
- Node.js 22 or newer and npm

## Core development

```bash
uv sync --dev
cp deploy/config/config.example.yaml config.yaml
uv run jaitra-content validate content/packs/core-en-01
JAITRA_CONFIG=config.yaml uv run jaitra-core
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

```bash
uv run pytest
uv run ruff check .
uv run mypy apps/core/jaitra_core
npm test
npm run build
```

Runtime data defaults to `.local/state/`, which is ignored by Git.

## Claude Code provider profiles

This checkout uses `https://api.mwapi.dev` as its primary Claude Code provider via
the Git-ignored `.claude/settings.local.json` file. Replace the placeholder
`ANTHROPIC_AUTH_TOKEN` in that file with the real token before starting Claude Code.

An OpenRouter secondary profile is provided at
`.claude/settings.openrouter.example.json`. To switch providers, copy it to the
Git-ignored `.claude/settings.openrouter.json`, add the OpenRouter key, and then
copy that file over `.claude/settings.local.json`. Restart Claude Code and use
`/status` to verify the active base URL. Claude Code does not automatically fail
over between different base URLs, so this switch is explicit.
