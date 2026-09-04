from pathlib import Path


def test_provider_credentials_are_not_exposed_in_public_contracts(repository_root: Path) -> None:
    public_sources = [
        repository_root / "packages/contracts/src/index.ts",
        repository_root / "apps/core/jaitra_core/api/models.py",
    ]
    forbidden = ["ANTHROPIC_AUTH_TOKEN", "sk-c", "sk-or-"]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in public_sources)
    assert all(secret not in combined for secret in forbidden)
