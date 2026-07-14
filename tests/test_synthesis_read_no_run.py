"""Synthesis GET must not execute a run on cache miss (faculty read ≠ build)."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def stack():
    from scripts.research_data_mcp.bootstrap import create_stack

    return create_stack(repo_root=REPO)


def test_library_synthesis_get_miss_does_not_run(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    calls: list[str] = []

    def fake_latest(profile_id: str):
        return {"found": False, "profile_id": profile_id}

    def fake_run(profile_id: str, **kwargs):
        calls.append(profile_id)
        return {"ok": True, "profile_id": profile_id, "ran": True}

    monkeypatch.setattr(stack.gateway, "synthesis_get_latest", fake_latest)
    monkeypatch.setattr(stack.gateway, "synthesis_run", fake_run)

    out = http_router.handle_get("/library/synthesis/missing_profile_xyz", {}, stack)
    assert out["status"] == 200
    body = out["body"]
    assert body.get("found") is False
    assert body.get("profile_id") == "missing_profile_xyz"
    assert calls == [], f"GET without refresh must not run synthesis; ran={calls}"


def test_library_synthesis_get_refresh_runs(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    calls: list[str] = []

    def fake_latest(profile_id: str):
        return {"found": False, "profile_id": profile_id}

    def fake_run(profile_id: str, **kwargs):
        calls.append(profile_id)
        return {"ok": True, "profile_id": profile_id, "ran": True}

    monkeypatch.setattr(stack.gateway, "synthesis_get_latest", fake_latest)
    monkeypatch.setattr(stack.gateway, "synthesis_run", fake_run)

    out = http_router.handle_get(
        "/library/synthesis/missing_profile_xyz",
        {"refresh": "1"},
        stack,
    )
    assert out["status"] == 200
    assert calls == ["missing_profile_xyz"]


def test_list_synthesis_profiles_does_not_require_skynet_import(tmp_path, monkeypatch):
    """Listing profiles must not import runner modules that need stablecoin_skynet."""
    import importlib
    import sys

    monkeypatch.delitem(sys.modules, "scripts.research_data_mcp.synthesis.engine", raising=False)
    monkeypatch.delitem(sys.modules, "scripts.research_data_mcp.synthesis.trust_engagement", raising=False)
    monkeypatch.delitem(sys.modules, "scripts.research_data_mcp.synthesis.skynet_etherscan", raising=False)
    monkeypatch.delitem(sys.modules, "scripts.research_data_mcp.synthesis.jkse_pit_idn", raising=False)

    sys.modules["stablecoin_skynet"] = None  # type: ignore[assignment]
    sys.modules["stablecoin_skynet.research_dataset"] = None  # type: ignore[assignment]
    sys.modules["stablecoin_skynet.unified_dataset"] = None  # type: ignore[assignment]
    sys.modules["stablecoin_skynet.gdelt_panel"] = None  # type: ignore[assignment]

    cfg = tmp_path / "drive" / "config"
    cfg.mkdir(parents=True)
    (cfg / "synthesis_profiles.json").write_text(
        '{"profiles":[{"id":"demo_profile","label":"Demo","type":"published_panel"}]}',
        encoding="utf-8",
    )

    engine = importlib.import_module("scripts.research_data_mcp.synthesis.engine")
    out = engine.list_synthesis_profiles(tmp_path)
    assert out["count"] == 1
    assert out["profiles"][0]["id"] == "demo_profile"
