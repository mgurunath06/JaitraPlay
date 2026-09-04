from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from jaitra_core.api.models import CommandEnvelope, ErrorEnvelope
from jaitra_core.runtime import CoreRuntime


def create_app(runtime: CoreRuntime, *, manage_lifecycle: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if manage_lifecycle:
            runtime.start()
        yield
        if manage_lifecycle:
            runtime.stop()

    app = FastAPI(title="JAITRA Core", version="1.0", lifespan=lifespan)

    @app.get("/api/v1/health")
    async def health() -> dict[str, object]:
        return {
            "apiVersion": "1.0",
            "ready": runtime.health.ready,
            **runtime.health.model_dump(mode="json"),
        }

    @app.get("/api/v1/snapshot")
    async def snapshot() -> dict[str, object]:
        return runtime.snapshot().model_dump(mode="json", by_alias=True)

    @app.get("/api/v1/activities")
    async def activities() -> list[dict[str, str]]:
        return [item.model_dump(by_alias=True) for item in runtime.snapshot().payload.activities]

    @app.post("/api/v1/commands")
    async def commands(command: CommandEnvelope) -> JSONResponse:
        result = runtime.dispatch(command)
        status = 409 if isinstance(result, ErrorEnvelope) else 200
        return JSONResponse(result.model_dump(mode="json", by_alias=True), status_code=status)

    @app.get("/api/v1/media/{asset_id}")
    async def media(asset_id: str) -> FileResponse:
        path = runtime.catalog.asset_path(asset_id)
        if path is None:
            raise HTTPException(status_code=404, detail="ASSET_NOT_FOUND")
        return FileResponse(path, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})

    @app.websocket("/api/v1/events")
    async def events(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_json(runtime.snapshot().model_dump(mode="json", by_alias=True))
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            return

    return app
