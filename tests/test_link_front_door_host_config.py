#!/usr/bin/env python3
"""Tests for Optiplex front-door host config linker."""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "drive/scripts/research_query_engine/link_front_door_host_config.sh"

EXPECTED = [
    "collection_partitions.json",
    "collection_semantic.json",
    "databank_access_scope.json",
    "databank_coverage_proxies.json",
    "databank_source_map.json",
    "data_collection_queue.json",
    "desk_demo_catalog.json",
    "desk_sources.json",
    "procurement_governance.json",
    "procurement_magic.json",
    "procurement_registry_map.json",
    "research_query_registry.json",
    "storage_tiers.json",
    "synthesis_profiles.json",
    "yzu_cluster.json",
]


def test_link_front_door_host_config_dry_run_lists_expected_files():
    assert SCRIPT.is_file()
    out = subprocess.check_output(["bash", str(SCRIPT), "--dry-run"], text=True)
    for name in EXPECTED:
        assert f"../drive/config/{name}" in out or f"ok_link={name}" in out or f"skip_existing_file={name}" in out or f"would_link={name}" in out or f"linked={name}" in out
    assert "missing_source=0" in out
    assert "dry_run=1" in out
    assert not any(line.startswith("missing_source=/") for line in out.splitlines())


def test_expected_sources_exist_under_drive_config():
    for name in EXPECTED:
        assert (REPO / "drive/config" / name).is_file(), name
