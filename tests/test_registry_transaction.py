from __future__ import annotations

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
