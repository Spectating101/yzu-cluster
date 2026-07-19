from __future__ import annotations

from pathlib import Path

from scripts.research_data_mcp.bootstrap import create_stack


REPO = Path(__file__).resolve().parents[1] / "drive"


def _quiet_stack(monkeypatch):
    stack = create_stack(repo_root=REPO)
    monkeypatch.setattr(stack.gateway, "reload_registry", lambda: None)
    monkeypatch.setattr(stack.campaign_runner, "on_job_completed", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(stack.orchestrator.collection_flywheel, "promote_after_collect", lambda *_args, **_kwargs: {})
    return stack


def test_generic_collection_archives_before_registry_promotion(monkeypatch) -> None:
    from scripts.research_data_mcp import drive_first, partition_wiring, semantic_index

    stack = _quiet_stack(monkeypatch)
    order: list[str] = []
    plan = {"job_type": "http_manifest", "dataset_id": "raw_usdt_history"}
    result = {"materialized": {"dataset_id": "raw_usdt_history", "canonical_dir": "data_lake/staging/usdt"}}
    job = stack.orchestrator.store.create("Collect USDT", {}, plan, status="running", job_id="archive-before-promote")

    def finalize(*_args, **kwargs):
        order.append("archive")
        assert kwargs["compact"] is False
        assert kwargs["stamp_registry"] is False
        return {
            "ok": True,
            "archives": [{"ok": True, "dataset_id": "raw_usdt_history", "local_path": "data_lake/staging/usdt"}],
            "registry_updates": [{"dataset_id": "raw_usdt_history", "canonical_remote": "gdrive:archive/usdt"}],
        }

    def promote(payload, **_kwargs):
        order.append("promote")
        assert payload["result"]["drive_finalize"]["ok"] is True
        return [{"dataset_id": "raw_usdt_history"}]

    monkeypatch.setattr(drive_first, "is_drive_first", lambda _root: True)
    monkeypatch.setattr(drive_first, "finalize_job_to_drive", finalize)
    monkeypatch.setattr(drive_first, "_stamp_registry_drive_paths", lambda *_args, **_kwargs: order.append("stamp"))
    monkeypatch.setattr(drive_first, "compact_finalized_archives", lambda *_args, **_kwargs: order.append("compact") or [])
    monkeypatch.setattr(semantic_index, "invalidate_semantic_index", lambda: None)
    monkeypatch.setattr(partition_wiring, "wire_promoted_to_partition", lambda *_args, **_kwargs: {"wired": False})
    monkeypatch.setattr(stack.orchestrator.registry_promoter, "promote_job", promote)

    promoted = stack.orchestrator._on_job_completed(job["id"], plan, result)

    assert promoted == [{"dataset_id": "raw_usdt_history"}]
    assert order == ["archive", "promote", "stamp", "compact"]


def test_metadata_only_job_does_not_promote_without_an_archive(monkeypatch) -> None:
    from scripts.research_data_mcp import drive_first

    stack = _quiet_stack(monkeypatch)
    plan = {"job_type": "source_probe", "url": "https://example.test"}
    job = stack.orchestrator.store.create("Probe source", {}, plan, status="running", job_id="probe-no-promotion")

    monkeypatch.setattr(drive_first, "is_drive_first", lambda _root: True)
    monkeypatch.setattr(
        stack.orchestrator.registry_promoter,
        "promote_job",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("probe must not promote")),
    )

    assert stack.orchestrator._on_job_completed(job["id"], plan, {"summary": "reachable"}) == []
