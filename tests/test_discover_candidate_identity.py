#!/usr/bin/env python3
"""D0b — candidate identity propagation + JS/Python contract parity."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


# Shared vectors — must match drive/src/v2/candidateKey.test.js (yzu-cluster D0a).
CONTRACT_VECTORS = [
    {
        "name": "server_key_first",
        "row": {"candidate_key": "dataset:server", "dataset_id": "other", "title": "T"},
        "expected": "dataset:server",
    },
    {
        "name": "dataset_id_precedence",
        "row": {
            "dataset_id": "mops_financial_statements_ext",
            "title": "MOPS financial statements",
            "doi": "10.1/x",
            "url": "https://mops.twse.com.tw/example",
        },
        "expected": "dataset:mops_financial_statements_ext",
    },
    {
        "name": "doi_canonical",
        "row": {
            "title": "Some paper",
            "doi": "https://doi.org/10.5281/ZENODO.9",
            "url": "https://example.com/x",
        },
        "expected": "doi:10.5281/zenodo.9",
    },
    {
        "name": "huggingface_source",
        "row": {"kind": "huggingface", "id": "org/demo", "title": "Demo"},
        "expected": "source:huggingface:org/demo",
    },
    {
        "name": "url_before_title",
        "row": {
            "title": "Example open dataset",
            "url": "HTTPS://Example.com/dataset#x",
            "source": "web",
        },
        "expected": "url:https://example.com/dataset",
    },
    {
        "name": "title_mops",
        "row": {"title": "Same Title", "source": "MOPS"},
        "expected": "title:mops:same title",
    },
    {
        "name": "title_twse",
        "row": {"title": "Same Title", "source": "TWSE"},
        "expected": "title:twse:same title",
    },
]


def test_candidate_key_contract_vectors():
    from scripts.research_data_mcp.candidate_key import candidate_key

    for case in CONTRACT_VECTORS:
        assert candidate_key(case["row"]) == case["expected"], case["name"]
    assert candidate_key(CONTRACT_VECTORS[-2]["row"]) != candidate_key(CONTRACT_VECTORS[-1]["row"])


def test_canonicalize_doi_and_url():
    from scripts.research_data_mcp.candidate_key import canonicalize_doi, canonicalize_url

    assert canonicalize_doi("DOI:10.5281/ZENODO.1") == "10.5281/zenodo.1"
    assert canonicalize_doi("https://doi.org/10.5281/zenodo.1") == "10.5281/zenodo.1"
    assert canonicalize_doi("http://dx.doi.org/10.5281/zenodo.1") == "10.5281/zenodo.1"
    assert canonicalize_url("HTTPS://Example.COM:443/path#frag") == "https://example.com/path"
    assert canonicalize_url("http://Example.COM:80/a?b=1") == "http://example.com/a?b=1"


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


def test_similar_titles_remain_distinct():
    from scripts.research_data_mcp.candidate_key import candidate_key

    a = candidate_key({"title": "Financial statements", "source": "MOPS", "url": "https://a.example/mops"})
    b = candidate_key({"title": "Financial statements", "source": "TWSE", "url": "https://b.example/twse"})
    assert a != b
    assert a.startswith("url:") or a.startswith("title:")
    assert b.startswith("url:") or b.startswith("title:")


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
    assert out["body"]["candidate_key"]  # computed fallback


def test_collect_stores_candidate_key(stack, monkeypatch):
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
            "source": "web",
            "dataset_id": "",
        },
        stack,
    )
    assert out["status"] == 200
    assert captured["request"]["candidate_key"] == "url:https://example.com/data.csv"
    assert captured["request"]["connector_id"] == "src_c"
    assert captured["request"]["source_identity"] == "web"
    job = out["body"]["job"]
    assert job["candidate_key"] == "url:https://example.com/data.csv"
    assert job["connector_id"] == "src_c"


def test_collect_legacy_without_candidate_key(stack, monkeypatch):
    from scripts.research_data_mcp import http_router

    plan = {"title": "Collect legacy", "job_type": "http_manifest", "connector_id": "src_l", "launchable": True}
    monkeypatch.setattr(
        stack.gateway.procurement,
        "manifest_plan_from_connector",
        lambda cid, limit=200: dict(plan),
    )
    monkeypatch.setattr(
        stack.jobs,
        "submit",
        lambda title, plan_arg, request=None, *, auto_approve=False: {
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
        {"connector_id": "src_l"},
        stack,
    )
    assert out["status"] == 200
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

    # Similar title must not invent a key
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


@pytest.fixture(scope="module")
def stack():
    from scripts.research_data_mcp.bootstrap import create_stack

    return create_stack(repo_root=REPO)
