from pathlib import Path
from uuid import uuid4

import anyio
from httpx import ASGITransport, AsyncClient
from jaitra_core.api.app import create_app
from jaitra_core.api.models import GeneratedQuestion, QuestionChoice
from jaitra_core.config import AppConfig
from jaitra_core.runtime import CoreRuntime


def test_api_boot_and_idempotent_commands(config: AppConfig, repository_root: Path) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)
    runtime.start()

    async def exercise_api() -> None:
        transport = ASGITransport(app=create_app(runtime, manage_lifecycle=False))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            health = await client.get("/api/v1/health")
            assert health.status_code == 200
            assert health.json()["ready"] is True

            snapshot = (await client.get("/api/v1/snapshot")).json()
            assert snapshot["payload"]["appState"] == "IDLE"
            assert snapshot["payload"]["capabilities"] == {
                "voice": "DISABLED",
                "camera": "CLIENT_MANAGED",
            }
            assert len(snapshot["payload"]["activities"]) == 5
            assert snapshot["payload"]["activities"][0]["activityId"] == "picture_guess"
            assert snapshot["payload"]["activities"][0]["availability"] == "AVAILABLE"
            assert snapshot["payload"]["activities"][1]["activityId"] == "memory_cards"
            assert snapshot["payload"]["activities"][3]["activityId"] == "storybook"
            assert snapshot["payload"]["activities"][4]["activityId"] == "tell_time"

            activity = await client.post("/api/v1/activity")
            assert activity.status_code == 200
            assert activity.json() == {"recorded": True}
            assert runtime.provider_availability.activity_path.is_file()

            request_id = str(uuid4())
            command = {
                "apiVersion": "1.0",
                "requestId": request_id,
                "type": "BEGIN_INTERACTION",
                "payload": {},
            }
            first = await client.post("/api/v1/commands", json=command)
            second = await client.post("/api/v1/commands", json=command)
            assert first.status_code == 200
            assert second.json() == first.json()
            assert runtime.state_machine.state == "WELCOME"

    try:
        anyio.run(exercise_api)
    finally:
        runtime.stop()


def test_websocket_route_and_snapshot_contract(config: AppConfig, repository_root: Path) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)
    runtime.start()
    try:
        app = create_app(runtime, manage_lifecycle=False)
        assert any(getattr(route, "path", None) == "/api/v1/events" for route in app.routes)
        snapshot = runtime.snapshot().model_dump(mode="json", by_alias=True)
        assert snapshot["type"] == "STATE_SNAPSHOT"
    finally:
        runtime.stop()


def test_hub_lists_registered_apps_without_a_manual_choice_limit(
    config: AppConfig, repository_root: Path
) -> None:
    config.ui.max_hub_choices = 1
    runtime = CoreRuntime(config, repository_root=repository_root)
    activities = runtime.snapshot().payload.activities
    assert len(activities) == 5
    assert activities[-1].activity_id == "tell_time"


def test_ai_question_route(config: AppConfig, repository_root: Path) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)
    runtime.start()

    async def fake_generate(
        _provider: str, activity_id: str, _request: object
    ) -> GeneratedQuestion:
        return GeneratedQuestion(
            activityId=activity_id,
            prompt="Find the elephant.",
            hint="It has a trunk.",
            choices=[
                QuestionChoice(value="elephant", label="🐘"),
                QuestionChoice(value="lion", label="🦁"),
                QuestionChoice(value="dog", label="🐶"),
                QuestionChoice(value="cat", label="🐱"),
            ],
            answer="elephant",
            explanation="That is the elephant.",
            provider="mwapi",
        )

    runtime.questions.generate_with = fake_generate  # type: ignore[method-assign]
    runtime.provider_availability.mark_available("mwapi")

    async def exercise_api() -> None:
        transport = ASGITransport(app=create_app(runtime, manage_lifecycle=False))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/activities/picture_guess/question",
                json={"previousPrompt": None, "neededHint": False, "recentPrompts": []},
            )
            assert response.status_code == 200
            assert response.json()["answer"] == "elephant"
            assert response.json()["provider"] == "mwapi"

    try:
        anyio.run(exercise_api)
    finally:
        runtime.stop()
