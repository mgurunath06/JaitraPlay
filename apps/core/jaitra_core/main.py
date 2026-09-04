from __future__ import annotations

import os
from pathlib import Path

import uvicorn

from jaitra_core.api.app import create_app
from jaitra_core.config import load_config
from jaitra_core.observability import configure_logging
from jaitra_core.runtime import CoreRuntime


def build_runtime() -> CoreRuntime:
    repository_root = Path(os.environ.get("JAITRA_REPOSITORY_ROOT", Path.cwd())).resolve()
    config_path = Path(os.environ.get("JAITRA_CONFIG", repository_root / "config.yaml"))
    config = load_config(config_path)
    configure_logging(config.logging.level)
    return CoreRuntime(config, repository_root=repository_root)


def run() -> None:
    runtime = build_runtime()
    app = create_app(runtime)
    uvicorn.run(
        app, host=runtime.config.server.host, port=runtime.config.server.port, log_config=None
    )


if __name__ == "__main__":
    run()
