from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.research_data_mcp import drive_first


@pytest.mark.parametrize("mode", ["page", "catalog"])
def test_scraper_output_is_normalized_before_archive(monkeypatch, tmp_path: Path, mode: str) -> None:
    job_id = f"scrape-{mode}"
    scrape_dir = tmp_path / "data_lake/spectator_engine/scrapes" / job_id
    scrape_dir.mkdir(parents=True)
    if mode == "page":
        output = scrape_dir / "extract.json"
        output.write_text('{"title": "Example"}\n', encoding="utf-8")
        result = {"extract_path": str(output.relative_to(tmp_path))}
    else:
        (scrape_dir / "manifest.json").write_text('{"pages": 1}\n', encoding="utf-8")
        (scrape_dir / "records.jsonl").write_text('{"id": 1}\n', encoding="utf-8")
        result = {"catalog_dir": str(scrape_dir.relative_to(tmp_path))}

    archived: list[tuple[str, str, str]] = []

    def archive(_repo_root: Path, local_rel: str, remote_suffix: str, **_kwargs):
        archived.append((local_rel, remote_suffix, f"gdrive:{remote_suffix}"))
        return {
            "ok": True,
            "verified": True,
            "local_path": local_rel,
            "remote_path": f"gdrive:{remote_suffix}",
            "remote_suffix": remote_suffix,
        }

    monkeypatch.setattr(drive_first, "archive_local_to_remote", archive)
    monkeypatch.setattr(
        drive_first,
        "remote_suffix_for_collect",
        lambda _root, _plan, *, dataset_id, job_id: f"collection/{dataset_id}",
    )
    materialized: dict = {}

    finalized = drive_first.finalize_job_to_drive(
        tmp_path,
        job_id=job_id,
        plan={"job_type": "scraper_run", "partition_id": "web_sources", "scrape_mode": mode},
        result=result,
        materialized=materialized,
        compact=False,
        stamp_registry=False,
    )

    dataset_id = f"scrape_{job_id}"
    manifest_id = f"scrape_manifest_{job_id}"
    manifest_path = tmp_path / materialized["manifest_path"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert finalized["ok"] is True
    assert materialized["dataset_id"] == dataset_id
    assert result["output_manifest_id"] == manifest_id
    assert manifest["manifest_id"] == manifest_id
    assert manifest["output"]["dataset_id"] == dataset_id
    assert manifest["validation"]["ok"] is True
    assert archived == [
        (
            f"data_lake/spectator_engine/scrapes/{job_id}",
            f"collection/{dataset_id}",
            f"gdrive:collection/{dataset_id}",
        )
    ]
    assert finalized["registry_updates"][0]["dataset_id"] == dataset_id


def test_scraper_without_output_fails_before_archive(monkeypatch, tmp_path: Path) -> None:
    archived = False

    def archive(*_args, **_kwargs):
        nonlocal archived
        archived = True
        return {"ok": True}

    monkeypatch.setattr(drive_first, "archive_local_to_remote", archive)

    finalized = drive_first.finalize_job_to_drive(
        tmp_path,
        job_id="missing-scrape",
        plan={"job_type": "scraper_run", "partition_id": "web_sources"},
        result={},
        compact=False,
        stamp_registry=False,
    )

    assert finalized["ok"] is False
    assert finalized["error"] == "scrape_manifest_failed"
    assert archived is False
