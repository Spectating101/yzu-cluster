#!/usr/bin/env python3
"""Candidate-browser proxy must be incapable of mutating production by default."""

from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "serve_candidate.py"
SPEC = importlib.util.spec_from_file_location("serve_candidate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_candidate_proxy_is_read_only_by_default() -> None:
    assert MODULE.live_proxy_allowed("GET", "/library/discover?q=x")
    assert MODULE.live_proxy_allowed("HEAD", "/healthz")
    assert not MODULE.live_proxy_allowed("POST", "/library/jobs")
    assert not MODULE.live_proxy_allowed("POST", "/library/synthesis/threads/t1/execute")
    assert not MODULE.live_proxy_allowed("DELETE", "/library/desk/session")


def test_session_bootstrap_is_the_only_default_live_post() -> None:
    assert MODULE.live_proxy_allowed("POST", "/library/desk/session")
    assert MODULE.live_proxy_allowed("POST", "/library/desk/session?action=refresh")
    assert not MODULE.live_proxy_allowed("POST", "/library/desk/session/other")


def test_writes_require_an_explicit_override() -> None:
    assert MODULE.live_proxy_allowed(
        "POST",
        "/library/jobs",
        allow_writes=True,
    )


def test_candidate_get_routes_cover_the_built_ui_api_without_swallowing_spa_assets() -> None:
    for path in (
        "/library/discover?q=stablecoin",
        "/datasets",
        "/datasets/gdelt_asia_daily_country_panel",
        "/query/gdelt_asia_daily_country_panel?limit=10",
        "/yzu/status",
        "/health?live=true",
        "/research-drive-build.json",
        "/api/library/overview",
    ):
        assert MODULE.live_get_route(path), path

    for path in (
        "/",
        "/index.html",
        "/assets/index.js",
        "/datasetsevil",
        "/library-card",
        "/health-report.html",
    ):
        assert not MODULE.live_get_route(path), path
