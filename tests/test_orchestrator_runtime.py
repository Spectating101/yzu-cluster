from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.yzu_cluster.orchestrator import YzuOrchestrator


def _orchestrator(tmp_path: Path) -> YzuOrchestrator:
    (tmp_path / "config").mkdir()
    (tmp_path / "config/yzu_cluster.json").write_text(
        json.dumps(
            {
                "controller": {
                    "hostname": "optiplex-test",
                    "jobs_root": "data/jobs",
                    "status_root": "data/status",
                },
                "operations": {"disable_local_http_collect": False},
                "agent": {"allowed_job_types": ["http_manifest", "scraper_run"]},
                "worker_pools": {},
                "storage": {},
            }
        ),
        encoding="utf-8",
    )
    return YzuOrchestrator(tmp_path)


def test_orchestrator_projects_idempotent_runtime_jobs(tmp_path: Path) -> None:
    orchestrator = _orchestrator(tmp_path)
    plan = {"job_type": "http_manifest", "url": "https://example.test"}
    request = {"idempotency_key": "probe-example"}

    submitted = orchestrator.submit("Probe example", plan, request, auto_approve=True)
    replay = orchestrator.submit("Probe example", plan, request, auto_approve=True)

    assert replay["id"] == submitted["id"] == "probe-example"
    assert submitted["runtime"]["status"] == "queued"
    with pytest.raises(ValueError, match="different request"):
        orchestrator.submit("Different title", plan, request, auto_approve=True)


def test_orchestrator_executes_only_a_claimed_compatible_job(tmp_path: Path) -> None:
    orchestrator = _orchestrator(tmp_path)
    orchestrator.executor.execute = lambda _job_id, _plan: {"outputs": ["probe-output"]}  # type: ignore[method-assign]
    job = orchestrator.submit(
        "Probe example",
        {"job_type": "http_manifest", "url": "https://example.test", "outputs": ["probe-output"]},
        {"idempotency_key": "probe-execute"},
        auto_approve=True,
    )

    completed = orchestrator.execute_job(job["id"])

    assert completed["status"] == "completed"
    assert completed["runtime"]["status"] == "completed"
    assert completed["runtime"]["attempt"] == 1


def test_browser_job_stays_queued_without_a_live_browser_worker(tmp_path: Path) -> None:
    orchestrator = _orchestrator(tmp_path)
    job = orchestrator.submit(
        "Scrape example",
        {"job_type": "scraper_run", "script_key": "generic_url_scrape", "url": "https://example.test"},
        {"idempotency_key": "browser-queued"},
        auto_approve=True,
    )

    waiting = orchestrator.execute_job(job["id"])

    assert waiting["status"] == "queued"
    assert waiting["runtime"]["status"] == "queued"
