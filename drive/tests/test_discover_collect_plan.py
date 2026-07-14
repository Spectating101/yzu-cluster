from __future__ import annotations

from scripts.research_data_mcp.bootstrap import create_stack
from scripts.research_data_mcp.discover_collect_plan import resolve_discover_collect_plan


def test_catalog_twse_resolves_to_probe_fallback():
    stack = create_stack()
    plan = resolve_discover_collect_plan(
        stack.gateway.procurement,
        stack.gateway.repo_root,
        connector_id="twse",
        source_id="twse_official",
        limit=5,
        title="TWSE Open API",
    )
    assert plan["job_type"] == "source_probe"
    assert "openapi.twse.com.tw" in plan["url"]
    assert plan.get("collect_resolution") == "catalog_source_probe_fallback"
    assert plan.get("launchable") is True


def test_procurement_manifest_still_preferred_when_available():
    stack = create_stack()
    plan = resolve_discover_collect_plan(
        stack.gateway.procurement,
        stack.gateway.repo_root,
        connector_id="src_ace4a0fb8e9e",
        limit=5,
    )
    assert plan["job_type"] == "http_manifest"
    assert plan.get("collect_resolution") == "procurement_manifest"
    assert plan.get("items")
