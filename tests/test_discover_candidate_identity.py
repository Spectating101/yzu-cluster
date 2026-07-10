#!/usr/bin/env python3
"""D0b/D0.1 — candidate identity propagation + shared golden fixture parity."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
FIXTURE = REPO / "tests/fixtures/candidate_key_vectors.json"
# Must match yzu-cluster drive/src/v2/fixtures/candidate_key_vectors.json
EXPECTED_FIXTURE_SHA256 = "8170d7de2ba0b0d3a4cf5d71102319869b6e4337a54d025c8575ad1467358edc"


@pytest.fixture(scope="module")
def vectors():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    digest = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
    assert digest == EXPECTED_FIXTURE_SHA256, f"fixture hash mismatch: {digest}"
    return payload


@pytest.fixture(scope="module")
def stack():
    from scripts.research_data_mcp.bootstrap import create_stack

    return create_stack(repo_root=REPO)


def test_shared_fixture_hash(vectors):
    assert vectors["version"] == 1
    assert len(vectors["candidate_key"]) >= 8


def test_canonicalize_from_fixture(vectors):
    from scripts.research_data_mcp.candidate_key import canonicalize_doi, canonicalize_url

    for row in vectors["canonicalize_doi"]:
        assert canonicalize_doi(row["input"]) == row["expected"]
    for row in vectors["canonicalize_url"]:
        assert canonicalize_url(row["input"]) == row["expected"]


def test_candidate_key_from_fixture(vectors):
    from scripts.research_data_mcp.candidate_key import candidate_key

    for row in vectors["candidate_key"]:
        assert candidate_key(row["row"]) == row["expected"], row["name"]
    a = next(r for r in vectors["candidate_key"] if r["name"] == "title_mops")
    b = next(r for r in vectors["candidate_key"] if r["name"] == "title_twse")
    assert candidate_key(a["row"]) != candidate_key(b["row"])


def test_discover_search_stamps_candidate_key(stack):
    from scripts.research_data_mcp.http_router import handle_get

    out = handle_get("/library/discover", {"q": "gdelt", "limit": "5"}, stack)
    assert out["status"] == 200
    body = out["body"]
    rows = []
    for section in body.get("sections") or []:
        rows.extend(section.get("rows") or [])
    if not rows:
        pytest.skip("no discover hits in local registry for gdelt")
    for row in rows:
        assert row.get("candidate_key"), row
        assert ":" in row["candidate_key"]


def test_probe_echoes_candidate_key_and_connector_id(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    fake = {
        "connector": {
            "id": "src_example",
            "connector_id": "src_example",
            "status": "candidate",
            "spec": {
                "source_url": "https://example.com/data.csv",
                "access_mode": "direct_file",
                "content_type": "text/csv",
                "discovered_files": [],
            },
        },
        "summary": "direct_file",
    }
    monkeypatch.setattr(stack.gateway, "probe_source", lambda url, name="": dict(fake))

    out = http_router.handle_post(
        "/library/discover/probe",
        {
            "url": "https://example.com/data.csv",
            "name": "Example",
            "candidate_key": "url:https://example.com/data.csv",
        },
        stack,
    )
    assert out["status"] == 200
    body = out["body"]
    assert body["candidate_key"] == "url:https://example.com/data.csv"
    assert body["connector_id"] == "src_example"
    assert body["resolved_url"] == "https://example.com/data.csv"
    assert "probe_id" not in body or body.get("probe_id") in (None, "")


def test_probe_accepts_legacy_without_candidate_key(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    fake = {
        "connector": {
            "id": "src_legacy",
            "connector_id": "src_legacy",
            "spec": {"source_url": "https://legacy.example/x", "access_mode": "html_index", "discovered_files": []},
        },
        "summary": "html",
    }
    monkeypatch.setattr(stack.gateway, "probe_source", lambda url, name="": dict(fake))
    out = http_router.handle_post(
        "/library/discover/probe",
        {"url": "https://legacy.example/x"},
        stack,
    )
    assert out["status"] == 200
    assert out["body"]["connector_id"] == "src_legacy"
    assert out["body"]["candidate_key"]


def test_collect_stores_source_identity_and_candidate_key(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    plan = {"title": "Collect example", "job_type": "http_manifest", "connector_id": "src_c", "launchable": True}
    monkeypatch.setattr(
        stack.gateway.procurement,
        "manifest_plan_from_connector",
        lambda cid, limit=200: dict(plan),
    )

    captured = {}

    def _submit(title, plan_arg, request=None, *, auto_approve=False):
        captured["request"] = request or {}
        captured["plan"] = plan_arg
        job = {
            "id": "jobtest01",
            "status": "pending_approval",
            "title": title,
            "request": request or {},
            "plan": plan_arg,
            "result": {},
        }
        return {"job": job, "plan": plan_arg}

    monkeypatch.setattr(stack.jobs, "submit", _submit)

    out = http_router.handle_post(
        "/library/discover/collect",
        {
            "connector_id": "src_c",
            "candidate_key": "url:https://example.com/data.csv",
            "url": "https://example.com/data.csv",
            "source_identity": "web",
            "dataset_id": "demo_ds",
            "doi": "10.5281/zenodo.1",
        },
        stack,
    )
    assert out["status"] == 200
    assert captured["request"]["candidate_key"] == "url:https://example.com/data.csv"
    assert captured["request"]["connector_id"] == "src_c"
    assert captured["request"]["source_identity"] == "web"
    assert captured["request"]["dataset_id"] == "demo_ds"
    assert captured["request"]["doi"] == "10.5281/zenodo.1"
    assert captured["request"]["url"] == "https://example.com/data.csv"
    job = out["body"]["job"]
    assert job["candidate_key"] == "url:https://example.com/data.csv"
    assert job["connector_id"] == "src_c"


def test_collect_legacy_source_normalizes_to_source_identity(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    plan = {"title": "Collect legacy", "job_type": "http_manifest", "connector_id": "src_l", "launchable": True}
    monkeypatch.setattr(
        stack.gateway.procurement,
        "manifest_plan_from_connector",
        lambda cid, limit=200: dict(plan),
    )
    captured = {}
    monkeypatch.setattr(
        stack.jobs,
        "submit",
        lambda title, plan_arg, request=None, *, auto_approve=False: captured.update(request=request or {})
        or {
            "job": {
                "id": "joblegacy1",
                "status": "pending_approval",
                "title": title,
                "request": request or {},
                "plan": plan_arg,
                "result": {},
            },
            "plan": plan_arg,
        },
    )
    out = http_router.handle_post(
        "/library/discover/collect",
        {"connector_id": "src_l", "source": "MOPS"},
        stack,
    )
    assert out["status"] == 200
    assert captured["request"]["source_identity"] == "MOPS"
    assert out["body"]["job"]["connector_id"] == "src_l"


def test_jobs_expose_identity_fields_exactly():
    from scripts.research_data_mcp.job_identity import enrich_job_identity

    job = {
        "id": "abc",
        "status": "pending_approval",
        "title": "MOPS financial statements extended",
        "request": {
            "candidate_key": "url:https://a.example/mops",
            "connector_id": "conn_a",
        },
        "plan": {"title": "MOPS financial statements extended"},
        "result": {},
    }
    enriched = enrich_job_identity(job)
    assert enriched["candidate_key"] == "url:https://a.example/mops"
    assert enriched["connector_id"] == "conn_a"
    assert enriched["registered_dataset_id"] is None
    assert enriched["output_manifest_id"] is None

    bare = enrich_job_identity(
        {
            "id": "xyz",
            "status": "queued",
            "title": "MOPS financial statements",
            "request": {},
            "plan": {"title": "MOPS financial statements"},
            "result": {},
        }
    )
    assert bare["candidate_key"] is None
    assert bare["registered_dataset_id"] is None


def test_promotion_attaches_registered_dataset_id():
    from scripts.research_data_mcp.job_identity import enrich_job_identity

    job = {
        "id": "promo1",
        "status": "completed",
        "request": {"candidate_key": "doi:10.5281/zenodo.1", "connector_id": "c1"},
        "plan": {},
        "result": {"registry_promotion": [{"dataset_id": "datacite_10_5281_zenodo_1", "replaced": False}]},
    }
    enriched = enrich_job_identity(job)
    assert enriched["registered_dataset_id"] == "datacite_10_5281_zenodo_1"
    assert enriched["candidate_key"] == "doi:10.5281/zenodo.1"
