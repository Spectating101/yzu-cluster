"""Later-main test ingest journey for the public reference runtime.

This is not RC2, not a GitHub Release, and not a replacement for the RC2
golden asset. A labelled synthetic fixture is copied byte-for-byte into a
local vault, provenance is recorded, and synthesis may register a derived
panel as ``registered`` — never as Query ready.
"""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
from typing import Any

from .interop_contract import InteropStore
from .interop_worker import WorkerRunner

RC2_GOLDEN_DATASET_ID = "procured_src_b0a7ba3817a5"
TEST_INGEST_FIXTURE_ID = "test_ingest_src_20260919"
TEST_INGEST_LABEL = "TEST INGEST — later-main synthetic fixture"
TEST_INGEST_JOURNEY = "later_main_test_ingest_20260919"
INGEST_JOB_PREFIX = "test-ingest-20260919"
SYNTH_JOB_PREFIX = "test-synth-20260919"
WORKER_CAPABILITIES = ("python", "pipeline", "archive")


def fixture_dir() -> Path:
    return Path(__file__).resolve().parent / "fixtures" / "test_ingest_journey_20260919"


def fixture_payload_path() -> Path:
    return fixture_dir() / "payload.json"


def _digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def _sha256_label(digest: str) -> str:
    return digest if digest.startswith("sha256:") else f"sha256:{digest}"


def _checksum12(digest: str) -> str:
    hex_digest = digest.removeprefix("sha256:")
    return hex_digest[:12]


def evidence_id_for(digest: str) -> str:
    return f"{TEST_INGEST_FIXTURE_ID}_{_checksum12(digest)}"


def ingest_job_id(digest: str) -> str:
    return f"{INGEST_JOB_PREFIX}:{_checksum12(digest)}"


def synth_job_id(digest: str) -> str:
    return f"{SYNTH_JOB_PREFIX}:{_checksum12(digest)}"


def _dump(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


class IngestJourney:
    """Byte-preserving ingest → synthesis over a durable InteropStore."""

    def __init__(
        self,
        store: InteropStore,
        vault_root: str | Path,
        *,
        worker_id: str = "optiplex",
    ) -> None:
        self.store = store
        self.vault_root = Path(vault_root)
        self.vault_root.mkdir(parents=True, exist_ok=True)
        self.worker_id = worker_id
        self.store.upsert_worker(worker_id, capabilities=WORKER_CAPABILITIES)

    @classmethod
    def open(
        cls,
        database: str | Path,
        vault_root: str | Path,
        *,
        worker_id: str = "optiplex",
    ) -> "IngestJourney":
        return cls(InteropStore(str(database)), vault_root, worker_id=worker_id)

    def close(self) -> None:
        self.store.close()

    def ingest_fixture(self, source: Path | None = None) -> dict[str, Any]:
        source = Path(source) if source is not None else fixture_payload_path()
        data = source.read_bytes()
        digest = _digest(data)
        evidence_id = evidence_id_for(digest)
        if evidence_id == RC2_GOLDEN_DATASET_ID or TEST_INGEST_FIXTURE_ID == RC2_GOLDEN_DATASET_ID:
            raise ValueError("test ingest fixture must not reuse the RC2 golden dataset id")
        submitted = self.store.submit(
            job_id=ingest_job_id(digest),
            job_type="pipeline",
            title=f"{TEST_INGEST_LABEL} ingest — not RC2",
            required_capabilities=["python", "pipeline", "archive"],
            inputs=[str(source)],
            outputs=[evidence_id],
        )
        if submitted["status"] in {"queued", "retrying"}:
            result = WorkerRunner(
                self.store,
                self.worker_id,
                {
                    "pipeline": lambda context: self._ingest_handler(
                        context, source, data, digest, evidence_id
                    )
                },
            ).run_once()
            if result is None or result.get("status") != "completed":
                raise RuntimeError(f"ingest worker did not complete: {result}")
        return self.evidence(evidence_id)

    def queue_synthesis(self, evidence_id: str) -> dict[str, Any]:
        current = self.evidence(evidence_id)
        if current["ingest"]["status"] != "completed":
            raise ValueError("synthesis requires a completed ingest")
        if current["ingest"]["registration_id"]:
            raise ValueError("ingest completion is not registration")
        return self.store.submit(
            job_id=synth_job_id(current["sha256"]),
            job_type="registered_pipeline",
            title=f"{TEST_INGEST_LABEL} synthesis — not RC2",
            required_capabilities=["python", "pipeline", "archive"],
            inputs=[evidence_id],
            outputs=[f"{evidence_id}_panel"],
        )

    def synthesize(
        self,
        evidence_id: str,
        *,
        inject_failure: bool = False,
        at: str | None = None,
    ) -> dict[str, Any]:
        current = self.evidence(evidence_id)
        synth = current.get("synthesis")
        if synth is None:
            raise ValueError("synthesis has not been queued")
        if synth["status"] == "registered" and not inject_failure:
            return {"job": synth, "asset": current["asset"]}
        if synth["status"] == "failed" and not inject_failure:
            raise ValueError("failed synthesis must retry before advancing")
        if synth["status"] not in {"queued", "retrying"}:
            raise ValueError(f"synthesis is not runnable: {synth['status']}")

        def handler(context):
            if inject_failure:
                raise RuntimeError("injected worker failure")
            return self._synthesize_handler(context, evidence_id)

        result = WorkerRunner(
            self.store,
            self.worker_id,
            {"registered_pipeline": handler},
        ).run_once(at=at)
        if result is None:
            raise RuntimeError("synthesis worker claimed no job")
        return result

    def retry_synthesis(self, evidence_id: str, *, at: str | None = None) -> dict[str, Any]:
        current = self.evidence(evidence_id)
        synth = current.get("synthesis")
        if synth is None:
            raise ValueError("synthesis has not been queued")
        return self.store.retry(synth["run_id"], at=at)

    def evidence(self, evidence_id: str) -> dict[str, Any]:
        if evidence_id == RC2_GOLDEN_DATASET_ID:
            raise ValueError("RC2 golden asset is not this test ingest journey")
        vault_dir = self.vault_root / evidence_id
        source_path = vault_dir / "payload.json"
        provenance_path = vault_dir / "provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.is_file() else {}
        sha_value = provenance.get("sha256")
        if source_path.is_file():
            sha_value = _sha256_label(_digest(source_path.read_bytes()))
        ingest = self._job(ingest_job_id(sha_value or evidence_id))
        synthesis = self._job(synth_job_id(sha_value or evidence_id))
        asset = None
        panel_id = f"{evidence_id}_panel"
        try:
            asset = self.store.asset(panel_id)
        except KeyError:
            asset = None
        bytes_ok = source_path.is_file() and (
            not provenance or provenance.get("sha256") == _sha256_label(_digest(source_path.read_bytes()))
        )
        registered = (
            synthesis is not None
            and synthesis["status"] == "registered"
            and asset is not None
            and asset["analysis_readiness"] == "registered"
            and asset["dataset_id"] != RC2_GOLDEN_DATASET_ID
            and bytes_ok
        )
        if asset is not None:
            readiness = asset["analysis_readiness"]
        elif ingest is not None and ingest["status"] == "completed" and bytes_ok:
            readiness = "ingested"
        else:
            readiness = "pending"
        return {
            "evidence_id": evidence_id,
            "fixture_id": TEST_INGEST_FIXTURE_ID,
            "journey": TEST_INGEST_JOURNEY,
            "not_rc2": True,
            "sha256": sha_value,
            "provenance": provenance,
            "vault_dir": str(vault_dir),
            "vault_source_path": str(source_path),
            "ingest": ingest,
            "synthesis": synthesis,
            "asset": asset,
            "analysis_readiness": readiness,
            "journey_complete": registered,
        }

    def _job(self, job_id: str) -> dict[str, Any] | None:
        row = self.store.db.execute("SELECT run_id FROM runs WHERE job_id=?", (job_id,)).fetchone()
        if row is None:
            return None
        return self.store.snapshot(row["run_id"])

    def _ingest_handler(
        self,
        context,
        source: Path,
        data: bytes,
        digest: str,
        evidence_id: str,
    ) -> dict[str, Any]:
        context.heartbeat(stage="running", current=1, total=3)
        dest_dir = self.vault_root / evidence_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / "payload.json"
        if dest.exists():
            if dest.read_bytes() != data:
                raise ValueError("vault copy conflicts with source bytes")
        else:
            dest.write_bytes(data)
            if dest.read_bytes() != data:
                dest.unlink(missing_ok=True)
                raise RuntimeError("ingest failed to preserve source bytes")
        sha_value = _sha256_label(digest)
        provenance = {
            "schema": "research_drive.test_ingest_provenance.v1",
            "journey": TEST_INGEST_JOURNEY,
            "label": (
                f"{TEST_INGEST_LABEL}, not the RC2 golden asset, "
                "not a live acquisition, not a GitHub Release"
            ),
            "not_rc2": True,
            "not_github_release": True,
            "not_query_ready_claim": True,
            "fixture_id": TEST_INGEST_FIXTURE_ID,
            "evidence_id": evidence_id,
            "source_filename": source.name,
            "byte_count": len(data),
            "sha256": sha_value,
            "vault_path": str(dest),
            "rc2_golden_dataset_id_this_is_not": RC2_GOLDEN_DATASET_ID,
        }
        provenance_path = dest_dir / "provenance.json"
        provenance_path.write_text(_dump(provenance), encoding="utf-8")
        manifest = {
            "manifest_id": f"manifest_{INGEST_JOB_PREFIX}_{_checksum12(digest)}",
            "evidence_id": evidence_id,
            "not_rc2": True,
            "files": [
                {"path": "payload.json", "sha256": sha_value, "bytes": len(data)},
                {
                    "path": "provenance.json",
                    "sha256": _sha256_label(_digest(provenance_path.read_bytes())),
                    "bytes": provenance_path.stat().st_size,
                },
            ],
        }
        (dest_dir / "manifest.json").write_text(_dump(manifest), encoding="utf-8")
        context.heartbeat(stage="archiving", current=3, total=3)
        return {
            "outputs": [evidence_id],
            "manifest_id": manifest["manifest_id"],
            "archive_verified": True,
            "row_count": 2,
            "field_count": 3,
            "detail": provenance,
        }

    def _synthesize_handler(self, context, evidence_id: str) -> dict[str, Any]:
        current = self.evidence(evidence_id)
        source_path = Path(current["vault_source_path"])
        if not source_path.is_file():
            raise FileNotFoundError("preserved ingest bytes are missing")
        data = source_path.read_bytes()
        digest = _digest(data)
        if _sha256_label(digest) != current["sha256"]:
            raise ValueError("preserved bytes no longer match ingest provenance")
        payload = json.loads(data.decode("utf-8"))
        totals: dict[str, int] = {}
        for row in payload.get("records") or ():
            totals[str(row["entity"])] = totals.get(str(row["entity"]), 0) + int(row["value"])
        panel = {
            "schema": "research_drive.test_ingest_panel.v1",
            "evidence_id": evidence_id,
            "source_sha256": _sha256_label(digest),
            "label": f"{TEST_INGEST_LABEL} derived panel — not RC2, not Query ready",
            "not_rc2": True,
            "not_query_ready": True,
            "grain": "entity",
            "rows": [{"entity": key, "value": value} for key, value in sorted(totals.items())],
        }
        panel_path = Path(current["vault_dir"]) / "panel.json"
        panel_bytes = _dump(panel).encode("utf-8")
        context.heartbeat(stage="running", current=1, total=2)
        panel_path.write_bytes(panel_bytes)
        if panel_path.read_bytes() != panel_bytes:
            panel_path.unlink(missing_ok=True)
            raise RuntimeError("synthesis failed to preserve derived panel bytes")
        dest_dir = Path(current["vault_dir"])
        manifest_path = dest_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {"files": []}
        files = [item for item in manifest.get("files") or [] if item.get("path") != "panel.json"]
        files.append({
            "path": "panel.json",
            "sha256": _sha256_label(_digest(panel_bytes)),
            "bytes": len(panel_bytes),
        })
        manifest.update({
            "manifest_id": f"manifest_{SYNTH_JOB_PREFIX}_{_checksum12(digest)}",
            "evidence_id": evidence_id,
            "not_rc2": True,
            "files": files,
        })
        manifest_path.write_text(_dump(manifest), encoding="utf-8")
        dataset_id = f"{evidence_id}_panel"
        context.heartbeat(stage="validating", current=2, total=2)
        return {
            "outputs": [dataset_id],
            "manifest_id": manifest["manifest_id"],
            "archive_verified": True,
            "row_count": len(panel["rows"]),
            "field_count": 2,
            "registration": {
                "dataset_id": dataset_id,
                "registry_id": f"registry:{dataset_id}",
                "revision_id": "test-ingest-20260919-rev1",
                "manifest_id": manifest["manifest_id"],
                "vault_path": str(panel_path),
                "archive_verified": True,
                "readiness": "registered",
                "title": f"{TEST_INGEST_LABEL} panel",
                "verification_state": "not_checked",
                "source": {
                    "label": TEST_INGEST_LABEL,
                    "fixture_id": TEST_INGEST_FIXTURE_ID,
                    "not_rc2": True,
                },
                "lineage_inputs": [evidence_id],
                "source_snapshots": [current["sha256"]],
                "checksum": current["sha256"],
                "grain": "entity",
                "rows": len(panel["rows"]),
                "fields": 2,
            },
        }


__all__ = [
    "RC2_GOLDEN_DATASET_ID",
    "TEST_INGEST_FIXTURE_ID",
    "TEST_INGEST_JOURNEY",
    "TEST_INGEST_LABEL",
    "IngestJourney",
    "evidence_id_for",
    "fixture_dir",
    "fixture_payload_path",
]
