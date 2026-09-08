from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from jaitra_core.api.models import (
    CommandEnvelope,
    ErrorEnvelope,
    QuestionRequest,
    StorybookCreateRequest,
    TranscriptionRequest,
)
from jaitra_core.identity import IdentityProfile
from jaitra_core.observability.logging import log_event, request_id
from jaitra_core.providers import QuestionGenerationError, StorybookNotFound
from jaitra_core.runtime import CoreRuntime
from jaitra_core.voice import VoiceUnavailable


def create_app(runtime: CoreRuntime, *, manage_lifecycle: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if manage_lifecycle:
            runtime.start()
            runtime.start_background_services()
        yield
        if manage_lifecycle:
            runtime.stop()

    app = FastAPI(title="JAITRA Core", version="1.0", lifespan=lifespan)

    @app.middleware("http")
    async def trace_request(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        supplied = request.headers.get("x-request-id", "")
        trace = supplied if re.fullmatch(r"[a-f0-9-]{36}", supplied) else str(uuid4())
        token = request_id.set(trace)
        started = time.monotonic()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = trace
            return response
        finally:
            route = getattr(request.scope.get("route"), "path", "unknown")
            log_event(
                logging.getLogger(__name__),
                logging.INFO,
                "API_REQUEST",
                "api",
                payload={
                    "route": route,
                    "method": request.method,
                    "status": status,
                    "durationMs": round((time.monotonic() - started) * 1000),
                },
            )
            request_id.reset(token)

    @app.get("/api/v1/identity/jaitra")
    async def get_identity() -> IdentityProfile | None:
        try:
            return await asyncio.to_thread(runtime.identity.read)
        except RuntimeError:
            raise HTTPException(503, "IDENTITY_PROFILE_UNREADABLE") from None

    @app.put("/api/v1/identity/jaitra")
    async def save_identity(profile: IdentityProfile) -> dict[str, bool]:
        await asyncio.to_thread(runtime.identity.save, profile)
        return {"saved": True}

    @app.delete("/api/v1/identity/jaitra")
    async def delete_identity() -> dict[str, bool]:
        await asyncio.to_thread(runtime.identity.delete)
        return {"deleted": True}

    @app.post("/api/v1/voice/transcribe")
    async def transcribe(request: TranscriptionRequest) -> dict[str, str]:
        try:
            text = await asyncio.to_thread(
                runtime.voice.transcribe, request.audio, request.sample_rate, request.phrases
            )
            return {"text": text}
        except VoiceUnavailable:
            raise HTTPException(status_code=503, detail="VOICE_UNAVAILABLE") from None
        except ValueError:
            raise HTTPException(status_code=422, detail="INVALID_AUDIO") from None

    @app.get("/api/v1/health")
    async def health() -> dict[str, object]:
        return {
            "apiVersion": "1.0",
            "ready": runtime.health.ready,
            "questionProvider": runtime.provider_availability.snapshot(),
            "questionBank": runtime.question_bank.stats(),
            **runtime.health.model_dump(mode="json"),
        }

    @app.get("/api/v1/snapshot")
    async def snapshot() -> dict[str, object]:
        return runtime.snapshot().model_dump(mode="json", by_alias=True)

    @app.get("/api/v1/activities")
    async def activities() -> list[dict[str, str]]:
        return [item.model_dump(by_alias=True) for item in runtime.snapshot().payload.activities]

    @app.post("/api/v1/activities/{activity_id}/question")
    async def generate_question(activity_id: str, request: QuestionRequest) -> JSONResponse:
        try:
            question = await runtime.generate_question(activity_id, request)
        except QuestionGenerationError:
            raise HTTPException(status_code=503, detail="QUESTION_GENERATION_UNAVAILABLE") from None
        return JSONResponse(question.model_dump(mode="json", by_alias=True))

    @app.post("/api/v1/storybooks", status_code=202)
    async def create_storybook(request: StorybookCreateRequest) -> JSONResponse:
        try:
            story = runtime.start_storybook(request.topic)
        except ValueError:
            raise HTTPException(status_code=422, detail="TOPIC_NOT_ALLOWED") from None
        return JSONResponse(story.model_dump(mode="json", by_alias=True), status_code=202)

    @app.get("/api/v1/storybooks")
    async def storybook_library() -> list[dict[str, object]]:
        return [book.model_dump(mode="json", by_alias=True) for book in runtime.storybook_library()]

    @app.get("/api/v1/storybooks/{story_id}")
    async def storybook(story_id: str) -> JSONResponse:
        try:
            story = runtime.storybook(story_id)
        except StorybookNotFound:
            raise HTTPException(status_code=404, detail="STORYBOOK_NOT_FOUND") from None
        return JSONResponse(story.model_dump(mode="json", by_alias=True))

    @app.get("/api/v1/storybooks/{story_id}/pages/{page_number}/image")
    async def storybook_image(story_id: str, page_number: int) -> FileResponse:
        try:
            path = runtime.storybooks.image_path(story_id, page_number)
        except StorybookNotFound:
            raise HTTPException(status_code=404, detail="STORY_IMAGE_NOT_FOUND") from None
        return FileResponse(path, headers={"Cache-Control": "private"})

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
