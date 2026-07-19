from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one patch target in {path}, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "drive/scripts/yzu_cluster/orchestrator.py",
    '''            renewal = self.runtime.lease_renewer(claim).start()
            try:
                result = self.executor.execute(job_id, job["plan"])
            finally:
                renewal.stop()
            renewal.raise_if_lost()
            self.store.event(job_id, "info", "Execution completed")
            if self._on_job_completed:
                promo = self._on_job_completed(job_id, job["plan"], result)
                if promo:
                    result = dict(result or {})
                    result["registry_promotion"] = promo
            runtime_state = self.runtime.complete(claim, result)
''',
    '''            renewal = self.runtime.lease_renewer(claim).start()
            try:
                result = self.executor.execute(job_id, job["plan"])
                renewal.raise_if_lost()
                self.store.event(job_id, "info", "Execution completed")
                if self._on_job_completed:
                    promo = self._on_job_completed(job_id, job["plan"], result)
                    if promo:
                        result = dict(result or {})
                        result["registry_promotion"] = promo
                # Archive verification, promotion, and registry read-back are
                # part of the owned attempt. Keep renewing until authoritative
                # completion proof is ready to be recorded.
                renewal.raise_if_lost()
            finally:
                renewal.stop()
            renewal.raise_if_lost()
            runtime_state = self.runtime.complete(claim, result)
''',
)

replace_once(
    "drive/scripts/yzu_cluster/remote_worker.py",
    '''    heartbeat = HeartbeatLoop(
        client,
        claim,
        lease_seconds=lease_seconds,
        interval_seconds=heartbeat_seconds,
    ).start()
    started = time.monotonic()
    try:
        process = subprocess.run(
            command,
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=int(plan.get("timeout_seconds", 7200)),
            check=False,
        )
    finally:
        heartbeat.stop()
    heartbeat.raise_if_lost()
    if process.returncode not in {0, 2}:
        raise RuntimeError(
            f"remote_collect exited {process.returncode}: {(process.stderr or process.stdout)[-1000:]}"
        )
    if not artifact_path.is_file() or artifact_path.stat().st_size < 32:
        raise RuntimeError("remote collector produced no usable artifact ZIP")

    uploaded = client.upload(
        job_id,
        worker_id=claim["worker_id"],
        attempt=attempt,
        path=artifact_path,
    )
    elapsed = max(0.0, time.monotonic() - started)
    client.usage(
        job_id,
        {
            "worker_id": claim["worker_id"],
            "attempt": attempt,
            "disk_written_mb": round(artifact_path.stat().st_size / (1024 * 1024), 6),
            "network_bytes": artifact_path.stat().st_size,
            "api_calls": len(items),
        },
    )
    return client.complete(
''',
    '''    heartbeat = HeartbeatLoop(
        client,
        claim,
        lease_seconds=lease_seconds,
        interval_seconds=heartbeat_seconds,
    ).start()
    started = time.monotonic()
    try:
        process = subprocess.run(
            command,
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=int(plan.get("timeout_seconds", 7200)),
            check=False,
        )
        heartbeat.raise_if_lost()
        if process.returncode not in {0, 2}:
            raise RuntimeError(
                f"remote_collect exited {process.returncode}: {(process.stderr or process.stdout)[-1000:]}"
            )
        if not artifact_path.is_file() or artifact_path.stat().st_size < 32:
            raise RuntimeError("remote collector produced no usable artifact ZIP")

        # Artifact transfer and usage proof still belong to this worker attempt.
        # Controller-side completion renewal takes over only after upload returns.
        uploaded = client.upload(
            job_id,
            worker_id=claim["worker_id"],
            attempt=attempt,
            path=artifact_path,
        )
        elapsed = max(0.0, time.monotonic() - started)
        client.usage(
            job_id,
            {
                "worker_id": claim["worker_id"],
                "attempt": attempt,
                "disk_written_mb": round(artifact_path.stat().st_size / (1024 * 1024), 6),
                "network_bytes": artifact_path.stat().st_size,
                "api_calls": len(items),
            },
        )
        heartbeat.raise_if_lost()
    finally:
        heartbeat.stop()
    heartbeat.raise_if_lost()
    return client.complete(
''',
)

Path("tests/test_completion_lease_scope.py").write_text(
    '''from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from scripts.yzu_cluster.orchestrator import YzuOrchestrator
from scripts.yzu_cluster.remote_worker import execute_http_manifest


def _write_runtime_config(root: Path) -> None:
    (root / "config").mkdir()
    (root / "config/yzu_cluster.json").write_text(
        json.dumps(
            {
                "controller": {
                    "hostname": "optiplex-test",
                    "jobs_root": "data/jobs",
                    "status_root": "data/status",
                },
                "runtime": {
                    "controller_heartbeat_seconds": 0,
                    "lease_seconds": 1,
                    "lease_heartbeat_seconds": 0.05,
                },
                "operations": {"disable_local_http_collect": False},
                "agent": {"allowed_job_types": ["http_manifest"]},
                "worker_pools": {},
                "storage": {},
            }
        ),
        encoding="utf-8",
    )


def test_local_completion_renews_lease_through_authoritative_finalization(tmp_path: Path) -> None:
    _write_runtime_config(tmp_path)
    orchestrator = YzuOrchestrator(tmp_path)
    orchestrator.executor.execute = lambda _job_id, _plan: {"outputs": ["local-output"]}
    job = orchestrator.submit(
        "Local finalization",
        {
            "job_type": "http_manifest",
            "items": [{"url": "https://example.test/data.csv"}],
            "outputs": ["local-output"],
        },
        {"idempotency_key": "local-finalization"},
        auto_approve=True,
    )

    def slow_finalize(_job_id, _plan, _result):
        time.sleep(1.3)
        return []

    orchestrator.set_on_job_completed(slow_finalize)
    reaped: list[dict] = []

    def reap_after_initial_lease() -> None:
        time.sleep(1.05)
        reaped.extend(orchestrator.runtime.reap_expired())

    reaper = threading.Thread(target=reap_after_initial_lease, daemon=True)
    reaper.start()
    completed = orchestrator.execute_job(job["id"])
    reaper.join(timeout=2)

    assert reaped == []
    assert completed["lifecycle"]["stage"] == "completed"
    assert completed["runtime"]["attempt"] == 1


class SlowUploadClient:
    def __init__(self) -> None:
        self.heartbeats: list[float] = []
        self.completions: list[dict] = []

    def heartbeat(self, _job_id: str, **_payload):
        self.heartbeats.append(time.monotonic())
        return {"status": "running"}

    def upload(self, job_id: str, *, worker_id: str, attempt: int, path: Path):
        time.sleep(1.2)
        return {
            "artifact": f"data/jobs/{job_id}/remote_artifacts/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": "proof",
            "worker_id": worker_id,
            "attempt": attempt,
        }

    def usage(self, _job_id: str, _payload: dict):
        return {"samples": 1}

    def complete(self, job_id: str, payload: dict):
        self.completions.append(payload)
        return {"status": "completed", "job_id": job_id}


def test_remote_worker_keeps_lease_alive_through_slow_artifact_upload(tmp_path: Path) -> None:
    script = tmp_path / "scripts/cluster_agent/remote_collect.py"
    script.parent.mkdir(parents=True)
    script.write_text(
        """
import argparse
import zipfile
parser = argparse.ArgumentParser()
parser.add_argument('--manifest')
parser.add_argument('--artifact')
parser.add_argument('--workers')
parser.add_argument('--timeout')
parser.add_argument('--retries')
parser.add_argument('--delay')
args = parser.parse_args()
with zipfile.ZipFile(args.artifact, 'w') as archive:
    archive.writestr('raw/result.csv', 'timestamp,value\\n2026-01-01,1\\n')
""".strip() + "\n",
        encoding="utf-8",
    )
    client = SlowUploadClient()
    claim = {
        "job_id": "slow-upload",
        "job_type": "http_manifest",
        "attempt": 1,
        "worker_id": "windows-01",
        "plan": {
            "job_type": "http_manifest",
            "items": [{"url": "https://example.test/data.csv", "name": "data.csv"}],
            "timeout_seconds": 30,
        },
    }

    completed = execute_http_manifest(
        client,
        claim,
        repo_root=tmp_path,
        spool=tmp_path / "spool",
        lease_seconds=3,
        heartbeat_seconds=1,
    )

    assert completed == {"status": "completed", "job_id": "slow-upload"}
    assert len(client.heartbeats) >= 2
    assert len(client.completions) == 1
''',
    encoding="utf-8",
)

Path(".github/workflows/private-runtime-contract.yml").write_text(
    '''name: Private runtime contract

# Exact-head gate for runtime, registry authority, and remote worker adoption.
on:
  pull_request:
    branches: [main]
    paths:
      - "drive/scripts/yzu_cluster/**"
      - "drive/scripts/research_data_mcp/**"
      - "tests/test_cluster_runtime_adapter.py"
      - "tests/test_orchestrator_runtime.py"
      - "tests/test_bootstrap_drive_order.py"
      - "tests/test_acquisition_manifest.py"
      - "tests/test_scraper_manifest.py"
      - "tests/test_registry_authority.py"
      - "tests/test_worker_control.py"
      - "tests/test_worker_completion_lease.py"
      - "tests/test_completion_lease_scope.py"
      - "tests/test_remote_worker.py"
      - "tests/test_job_status_counts.py"
      - "tests/test_yzu_interop_*.py"
      - ".github/workflows/private-runtime-contract.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  runtime-contract:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      PYTHONPATH: ${{ github.workspace }}:${{ github.workspace }}/kernel:${{ github.workspace }}/drive
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip

      - name: Install test dependencies
        run: |
          python -m pip install --upgrade pip
          python -m pip install pytest pytest-asyncio pyyaml requests pandas numpy scipy statsmodels scikit-learn pyarrow networkx python-dotenv pydantic fastapi uvicorn structlog asyncpg redis prometheus-fastapi-instrumentator stripe email-validator openai paramiko aiohttp tabulate yfinance

      - name: Compile runtime modules
        run: |
          python -m compileall -q drive/scripts/yzu_cluster drive/scripts/research_data_mcp

      - name: Run worker control service contracts
        id: worker_control
        continue-on-error: true
        shell: bash
        run: |
          set -o pipefail
          python -m pytest -q tests/test_worker_control.py tests/test_worker_completion_lease.py tests/test_completion_lease_scope.py 2>&1 | tee worker-control.log

      - name: Upload worker control diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: worker-control-log
          path: worker-control.log
          if-no-files-found: error
          retention-days: 3

      - name: Enforce worker control result
        if: steps.worker_control.outcome == 'failure'
        run: exit 1

      - name: Run remote worker agent contracts
        run: |
          python -m pytest -q tests/test_remote_worker.py tests/test_completion_lease_scope.py

      - name: Run scraper and registry authority contracts
        run: |
          python -m pytest -q tests/test_scraper_manifest.py tests/test_registry_authority.py

      - name: Run private suite excluding optional HMM tests
        id: private_suite
        continue-on-error: true
        shell: bash
        run: |
          set -o pipefail
          python -m pytest -q -k "not strategy_regime_hmm" 2>&1 | tee private-suite.log

      - name: Upload private suite diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: private-suite-log
          path: private-suite.log
          if-no-files-found: error
          retention-days: 3

      - name: Enforce private suite result
        if: steps.private_suite.outcome == 'failure'
        run: exit 1

      - name: Run public interoperability contracts
        run: |
          python -m unittest discover -s tests -p "test_yzu_interop_*.py" -v
''',
    encoding="utf-8",
)
