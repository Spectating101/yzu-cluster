from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest

from scripts.yzu_cluster.orchestrator import YzuOrchestrator


def _orchestrator(
    tmp_path: Path,
    *,
    operations: dict | None = None,
) -> YzuOrchestrator:
    (tmp_path / "config").mkdir()
    (tmp_path / "config/yzu_cluster.json").write_text(
        json.dumps(
            {
                "controller": {
                    "hostname": "optiplex-test",
                    "jobs_root": "data/jobs",
                    "status_root": "data/status",
                },
                "operations": {"disable_local_http_collect": False, **(operations or {})},
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
    assert submitted["lifecycle"]["stage"] == "queued"
    assert submitted["execution"]["stage"] == "queued"
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
    assert completed["lifecycle"]["stage"] == "completed"
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


def test_idle_controller_refreshes_before_claiming(tmp_path: Path) -> None:
    orchestrator = _orchestrator(tmp_path)
    job = orchestrator.submit(
        "Probe after idle",
        {"job_type": "http_manifest", "url": "https://example.test"},
        {"idempotency_key": "probe-after-idle"},
        auto_approve=True,
    )
    orchestrator.runtime.connection.execute(
        "UPDATE workers SET heartbeat_at=? WHERE worker_id=?",
        ("2000-01-01T00:00:00Z", orchestrator.runtime.controller_id),
    )
    assert orchestrator.runtime.store.worker(orchestrator.runtime.controller_id)["status"] == "stale"

    claim = orchestrator.runtime.claim_job(job["id"])

    assert claim is not None
    assert claim.worker_id == orchestrator.runtime.controller_id
    assert orchestrator.runtime.store.worker(orchestrator.runtime.controller_id)["status"] != "stale"


def test_blocking_execution_renews_lease_before_reaper(tmp_path: Path) -> None:
    orchestrator = _orchestrator(
        tmp_path,
        operations={"runtime_lease_seconds": 2, "runtime_heartbeat_seconds": 0.2},
    )

    def _slow_execute(_job_id: str, _plan: dict) -> dict:
        time.sleep(2.6)
        return {"outputs": ["slow-output"]}

    orchestrator.executor.execute = _slow_execute  # type: ignore[method-assign]
    job = orchestrator.submit(
        "Slow probe",
        {"job_type": "http_manifest", "url": "https://example.test", "outputs": ["slow-output"]},
        {"idempotency_key": "slow-probe"},
        auto_approve=True,
    )
    reaped: list[object] = []

    def _reap_after_initial_lease() -> None:
        time.sleep(2.2)
        reaped.append(orchestrator.runtime.store.reap_expired())

    reaper = threading.Thread(target=_reap_after_initial_lease, daemon=True)
    reaper.start()
    completed = orchestrator.execute_job(job["id"])
    reaper.join(timeout=2)

    assert completed["lifecycle"]["stage"] == "completed"
    assert completed["attempt"] == 1
    assert orchestrator.runtime.snapshot(job["id"])["status"] == "completed"
