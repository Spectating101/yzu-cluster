from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one patch target in {path}, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


Path("drive/scripts/research_data_mcp/registry_transaction.py").write_text(
    '''"""Atomic, process-safe updates for the canonical JSON registry."""
from __future__ import annotations

import json
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, TypeVar

try:  # POSIX controller path.
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover - Windows fallback.
    fcntl = None

try:  # pragma: no cover - exercised only on Windows controllers.
    import msvcrt  # type: ignore
except ImportError:  # pragma: no cover
    msvcrt = None

T = TypeVar("T")
_LOCKS_GUARD = threading.Lock()
_LOCKS: dict[Path, threading.RLock] = {}


def _thread_lock(path: Path) -> threading.RLock:
    canonical = path.resolve()
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(canonical, threading.RLock())


@contextmanager
def _advisory_lock(path: Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        elif msvcrt is not None:  # pragma: no cover - Windows controller fallback.
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            elif msvcrt is not None:  # pragma: no cover
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def _atomic_write(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp_path = Path(raw_tmp)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, ensure_ascii=False)
            handle.write("\\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
        if os.name != "nt" and hasattr(os, "O_DIRECTORY"):
            directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        tmp_path.unlink(missing_ok=True)


def atomic_update_json(path: str | Path, mutate: Callable[[dict[str, Any]], T]) -> T:
    """Reload, mutate, and atomically replace a JSON document under one lock."""

    target = Path(path).resolve()
    with _thread_lock(target), _advisory_lock(target):
        document = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else {}
        result = mutate(document)
        _atomic_write(target, document)
        return result
''',
    encoding="utf-8",
)

replace_once(
    "drive/scripts/research_data_mcp/registry_promotion.py",
    "from scripts.research_data_mcp.drive_first import is_drive_first\n",
    "from scripts.research_data_mcp.drive_first import is_drive_first\nfrom scripts.research_data_mcp.registry_transaction import atomic_update_json\n",
)

replace_once(
    "drive/scripts/research_data_mcp/registry_promotion.py",
    '''    def _upsert_dataset(self, spec: dict[str, Any], *, task_id: str, job_id: str, campaign_id: str = "") -> dict[str, Any]:
        if not is_drive_first(self.repo_root):
            raise PermissionError("canonical registry promotion requires Drive-first verified storage")
        registry = json.loads(self.registry_path.read_text(encoding="utf-8"))
        datasets = list(registry.get("datasets") or [])
        dataset_id = spec["dataset_id"]
        now = datetime.now(timezone.utc).isoformat()
        entry = dict(spec)
        job_type = (
            "huggingface_collect"
            if task_id.startswith("hf_")
            else "http_manifest"
            if task_id.startswith("procured_")
            else "scraper_run"
            if task_id.startswith("scrape_")
            else "synthesis_execute"
            if str(dataset_id).startswith("synthesis_")
            else "registered_pipeline"
            if (self._map.get("pipelines") or {}).get(task_id)
            else "collection_queue"
        )
        entry["procurement"] = {
            "source_task_id": task_id,
            "promoted_at": now,
            "promoted_from_job": job_id,
            "job_type": job_type,
        }
        if campaign_id:
            entry.setdefault("lineage", {})
            entry["lineage"]["campaign_id"] = campaign_id
            entry["lineage"]["alpha_ready"] = True
            entry["lineage"]["join_keys"] = spec.get("join_keys") or spec.get("grain", "")
        replaced = False
        for index, row in enumerate(datasets):
            if row.get("dataset_id") == dataset_id:
                merged = dict(row)
                merged.update(entry)
                datasets[index] = merged
                entry = merged
                replaced = True
                break
        if not replaced:
            datasets.append(entry)
        registry["datasets"] = datasets
        registry["updated_at"] = now
        self.registry_path.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
        return {"dataset_id": dataset_id, "replaced": replaced, "promoted_at": now}
''',
    '''    def _upsert_dataset(self, spec: dict[str, Any], *, task_id: str, job_id: str, campaign_id: str = "") -> dict[str, Any]:
        if not is_drive_first(self.repo_root):
            raise PermissionError("canonical registry promotion requires Drive-first verified storage")
        dataset_id = spec["dataset_id"]
        now = datetime.now(timezone.utc).isoformat()
        entry = dict(spec)
        job_type = (
            "huggingface_collect"
            if task_id.startswith("hf_")
            else "http_manifest"
            if task_id.startswith("procured_")
            else "scraper_run"
            if task_id.startswith("scrape_")
            else "synthesis_execute"
            if str(dataset_id).startswith("synthesis_")
            else "registered_pipeline"
            if (self._map.get("pipelines") or {}).get(task_id)
            else "collection_queue"
        )
        entry["procurement"] = {
            "source_task_id": task_id,
            "promoted_at": now,
            "promoted_from_job": job_id,
            "job_type": job_type,
        }
        if campaign_id:
            entry.setdefault("lineage", {})
            entry["lineage"]["campaign_id"] = campaign_id
            entry["lineage"]["alpha_ready"] = True
            entry["lineage"]["join_keys"] = spec.get("join_keys") or spec.get("grain", "")

        def mutate(registry: dict[str, Any]) -> dict[str, Any]:
            datasets = list(registry.get("datasets") or [])
            replaced = False
            stored = entry
            for index, row in enumerate(datasets):
                if row.get("dataset_id") == dataset_id:
                    merged = dict(row)
                    merged.update(entry)
                    datasets[index] = merged
                    stored = merged
                    replaced = True
                    break
            if not replaced:
                datasets.append(entry)
            registry["datasets"] = datasets
            registry["updated_at"] = now
            return {
                "dataset_id": dataset_id,
                "replaced": replaced,
                "promoted_at": now,
                "stored": stored,
            }

        result = atomic_update_json(self.registry_path, mutate)
        result.pop("stored", None)
        return result
''',
)

Path("tests/test_registry_transaction.py").write_text(
    '''from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from scripts.research_data_mcp.registry_promotion import RegistryPromoter
from scripts.research_data_mcp.registry_transaction import atomic_update_json


def _drive_first_root(root: Path) -> Path:
    (root / "config").mkdir()
    (root / "config/yzu_cluster.json").write_text(
        json.dumps({"storage": {"drive_first": True}}),
        encoding="utf-8",
    )
    registry = root / "config/research_query_registry.json"
    registry.write_text(json.dumps({"updated_at": "before", "datasets": []}), encoding="utf-8")
    return registry


def test_atomic_update_json_preserves_concurrent_mutations(tmp_path: Path) -> None:
    registry = _drive_first_root(tmp_path)
    barrier = threading.Barrier(2)

    def add(dataset_id: str) -> None:
        barrier.wait()

        def mutate(document: dict) -> None:
            rows = list(document.get("datasets") or [])
            time.sleep(0.05)
            rows.append({"dataset_id": dataset_id})
            document["datasets"] = rows

        atomic_update_json(registry, mutate)

    threads = [threading.Thread(target=add, args=(dataset_id,)) for dataset_id in ("asset-a", "asset-b")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)

    document = json.loads(registry.read_text(encoding="utf-8"))
    assert {row["dataset_id"] for row in document["datasets"]} == {"asset-a", "asset-b"}
    assert not list(registry.parent.glob(f".{registry.name}.*.tmp"))


def test_registry_promoter_uses_transactional_upsert_for_concurrent_assets(tmp_path: Path) -> None:
    registry = _drive_first_root(tmp_path)
    promoters = [RegistryPromoter(tmp_path, registry), RegistryPromoter(tmp_path, registry)]
    barrier = threading.Barrier(2)
    errors: list[Exception] = []

    def promote(index: int) -> None:
        try:
            barrier.wait()
            dataset_id = f"asset-{index}"
            promoters[index]._upsert_dataset(
                {
                    "dataset_id": dataset_id,
                    "name": dataset_id,
                    "backend": "remote_drive_asset",
                    "canonical_remote": f"gdrive:datasets/{dataset_id}",
                },
                task_id=f"procured_{index}",
                job_id=f"job-{index}",
            )
        except Exception as exc:  # pragma: no cover - assertion reports worker errors.
            errors.append(exc)

    threads = [threading.Thread(target=promote, args=(index,)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)

    assert errors == []
    document = json.loads(registry.read_text(encoding="utf-8"))
    assert {row["dataset_id"] for row in document["datasets"]} == {"asset-0", "asset-1"}
    assert all(row.get("procurement", {}).get("promoted_from_job") for row in document["datasets"])
''',
    encoding="utf-8",
)
