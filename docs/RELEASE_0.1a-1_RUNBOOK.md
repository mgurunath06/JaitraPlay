# Release 0.1a-1 development runbook

This runbook supports the repository-bootstrap increment. It does not configure Ubuntu auto-login or claim production kiosk acceptance.

## Prepare

```bash
cp deploy/config/config.example.yaml config.yaml
uv sync --dev
npm install
npm run build
```

`config.yaml`, runtime state, generated systemd units, build products, and credentials are excluded from Git.

## Verify locally

```bash
uv run pytest
uv run ruff check .
uv run mypy apps/core/jaitra_core
npm test
npm run lint
npm run build
deploy/scripts/smoke-core.sh
```

## Run the processes

### VS Code shortcut

Press `Ctrl+Shift+B` and choose **JAITRA Play: Run all** if VS Code asks. It is the default build task and starts Core, Vite, and Electron in three grouped terminal panes. Electron waits for Vite to report that port 5173 is ready. If `config.yaml` is missing, the Core task creates it from the checked-in example.

To stop everything, use **Terminal: Terminate All Tasks** from the Command Palette (`Ctrl+Shift+P`).

### Manual terminals

Terminal one:

```bash
JAITRA_CONFIG=config.yaml uv run jaitra-core
```

Terminal two:

```bash
npm run dev
```

Terminal three:

```bash
npm run electron:dev
```

The development URL disables kiosk mode and enables DevTools. Without `JAITRA_UI_DEV_URL`, the Electron main process enables fullscreen kiosk mode and disables DevTools.

## Render development service units

```bash
deploy/scripts/render-dev-units.sh
```

Review the generated files under `.local/systemd/` before installing them. The checked-in units are templates because repository paths vary between development and the final `/opt/jaitra-play/current` appliance release.

## Acceptance boundary

This increment proves configuration, storage, content validation, local API contracts, the early authoritative state flow, and branded UI recovery. Picture Guess and durable activity/reward mutations begin in 0.1a-2. Target-appliance auto-login, shortcut escape testing, process-kill timing, and power-cycle evidence must still be collected on the Ubuntu TV appliance.
