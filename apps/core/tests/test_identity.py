import os
from pathlib import Path

import anyio
import pytest
from httpx import ASGITransport, AsyncClient
from jaitra_core.api.app import create_app
from jaitra_core.config import AppConfig
from jaitra_core.identity import IdentityProfile, IdentityStore
from jaitra_core.runtime import CoreRuntime
from pydantic import ValidationError


def profile() -> IdentityProfile:
    return IdentityProfile(descriptors=[[0.1] * 128 for _ in range(6)])


def test_profile_survives_new_store_and_can_be_deleted(tmp_path: Path) -> None:
    store = IdentityStore(tmp_path)
    assert store.read() is None
    store.save(profile())
    assert IdentityStore(tmp_path).read() == profile()
    assert os.stat(store.path).st_mode & 0o777 == 0o600
    assert list(store.path.parent.iterdir()) == [store.path]
    store.delete()
    assert IdentityStore(tmp_path).read() is None
    store.delete()


@pytest.mark.parametrize(
    "descriptors",
    [[], [[0.1] * 127] * 6, [[float("nan")] * 128] * 6, [[0.0] * 128] * 6, [[0.1] * 128] * 13],
)
def test_invalid_enrollment_rejected(descriptors: list[list[float]]) -> None:
    with pytest.raises(ValidationError):
        IdentityProfile(descriptors=descriptors)


def test_unreadable_profile_is_not_silently_treated_as_unenrolled(tmp_path: Path) -> None:
    store = IdentityStore(tmp_path)
    store.save(profile())
    store.path.write_text("invalid")
    with pytest.raises(RuntimeError, match="IDENTITY_PROFILE_UNREADABLE"):
        store.read()


def test_identity_api_restart_and_validation(config: AppConfig, repository_root: Path) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)

    async def exercise() -> None:
        async with AsyncClient(
            transport=ASGITransport(app=create_app(runtime, manage_lifecycle=False)),
            base_url="http://test",
        ) as client:
            assert (await client.get("/api/v1/identity/jaitra")).json() is None
            assert (
                await client.put("/api/v1/identity/jaitra", json=profile().model_dump())
            ).status_code == 200
            assert (
                await client.put("/api/v1/identity/jaitra", json={"descriptors": []})
            ).status_code == 422
            restarted = CoreRuntime(config, repository_root=repository_root)
            async with AsyncClient(
                transport=ASGITransport(app=create_app(restarted, manage_lifecycle=False)),
                base_url="http://test",
            ) as new_client:
                assert (
                    await new_client.get("/api/v1/identity/jaitra")
                ).json() == profile().model_dump()
                assert (await new_client.delete("/api/v1/identity/jaitra")).status_code == 200
            assert (await client.get("/api/v1/identity/jaitra")).json() is None

    anyio.run(exercise)


def test_people_persist_independently_and_can_add_views(tmp_path: Path) -> None:
    from jaitra_core.identity import PeopleStore, PersonProfile

    store = PeopleStore(tmp_path)
    dad = PersonProfile(
        id="dad", name="Dad", relationship="father", descriptors=profile().descriptors
    )
    mom = PersonProfile(
        id="mom", name="Mom", relationship="mother", descriptors=profile().descriptors
    )
    store.save(dad)
    store.save(mom)
    assert len(PeopleStore(tmp_path).read()) == 2
    dad.descriptors *= 3
    store.save(dad)
    assert len(PeopleStore(tmp_path).read()[0].descriptors) == 18
    store.delete("dad")
    assert store.read() == [mom]
    with pytest.raises(ValueError):
        store.delete("../jaitra")
    with pytest.raises(ValidationError):
        PersonProfile(
            id="../escape", name="Dad", relationship="father", descriptors=profile().descriptors
        )


def test_people_api(config: AppConfig, repository_root: Path) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)

    async def exercise() -> None:
        async with AsyncClient(
            transport=ASGITransport(app=create_app(runtime, manage_lifecycle=False)),
            base_url="http://test",
        ) as client:
            payload = {
                **profile().model_dump(),
                "id": "dad",
                "name": "Arun",
                "relationship": "father",
            }
            assert (await client.put("/api/v1/identity/people", json=payload)).status_code == 200
            assert (await client.get("/api/v1/identity/people")).json() == [payload]
            assert (await client.get("/api/v1/identity/jaitra")).json() is None
            assert (await client.delete("/api/v1/identity/people/dad")).status_code == 200
            assert (await client.get("/api/v1/identity/people")).json() == []

    anyio.run(exercise)


def test_single_view_person_is_valid_but_malformed_descriptors_are_not() -> None:
    from jaitra_core.identity import PersonProfile

    fields = {"id": "dad", "name": "Arun", "relationship": "father"}
    assert len(PersonProfile(**fields, descriptors=[[0.1] * 128]).descriptors) == 1
    for descriptors in ([], [[0.1] * 127], [[float("nan")] * 128], [[0.0] * 128]):
        with pytest.raises(ValidationError):
            PersonProfile(**fields, descriptors=descriptors)
