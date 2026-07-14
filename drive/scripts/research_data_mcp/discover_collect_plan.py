"""Resolve Discover catalog / rail IDs into a launchable collect plan.

Catalog connectors (e.g. ``twse``) are logical desk IDs. Procurement connectors
are probed ``src_*`` rows. When no bounded HTTP file manifest exists yet, fall
back to a ``source_probe`` plan so Discover Collect still creates a durable,
Discover-linked pending job in History — without inventing a harvest.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse


def _https_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("http://") or text.startswith("https://"):
        return text
    # bare host / endpoint
    if "/" not in text and "." in text:
        return f"https://{text}"
    if text.startswith("//"):
        return f"https:{text}"
    return text


def _host_of(url_or_host: str) -> str:
    text = str(url_or_host or "").strip().lower()
    if not text:
        return ""
    if "://" not in text and "/" not in text:
        return text.removeprefix("www.")
    try:
        return (urlparse(_https_url(text)).hostname or "").lower().removeprefix("www.")
    except Exception:  # noqa: BLE001
        return ""



_PUBLIC_GOV_HOSTS = frozenset(
    {
        "www.sec.gov",
        "sec.gov",
        "data.sec.gov",
        "www.data.gov",
        "data.gov",
        "openapi.twse.com.tw",
        "www.twse.com.tw",
        "mops.twse.com.tw",
        "api.worldbank.org",
        "databank.worldbank.org",
    }
)


def _stamp_public_collect_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Mark clearly public HTTP manifests so approve-safe policy can launch them."""
    if not isinstance(plan, dict):
        return plan
    if str(plan.get("job_type") or "") != "http_manifest":
        return plan
    urls: list[str] = []
    if plan.get("url"):
        urls.append(str(plan.get("url")))
    for item in plan.get("items") or []:
        if isinstance(item, dict) and item.get("url"):
            urls.append(str(item["url"]))
        elif isinstance(item, str):
            urls.append(item)
    hosts = {_host_of(u) for u in urls if u}
    hosts.discard("")
    if hosts and hosts <= _PUBLIC_GOV_HOSTS:
        plan = dict(plan)
        plan.setdefault("public_direct_url", True)
        plan.setdefault("collect_class", "public_government")
        plan.setdefault("requires_approval", True)  # still explicit unless auto-approve policy says otherwise
    return plan

def _lookup_catalog_source(repo_root: Any, *, connector_id: str = "", source_id: str = "") -> dict[str, Any]:
    from pathlib import Path

    from scripts.research_data_mcp.discover_source_search import search_discover_sources

    root = Path(repo_root)
    needles: list[str] = []
    for raw in (source_id, connector_id):
        token = str(raw or "").strip()
        if token and token not in needles:
            needles.append(token)
    if not needles:
        return {}
    for needle in needles:
        payload = search_discover_sources(root, needle, limit=12)
        for row in payload.get("results") or []:
            if not isinstance(row, dict):
                continue
            sid = str(row.get("source_id") or "").strip()
            cid = str(row.get("connector_id") or row.get("desk_connector_id") or "").strip()
            if source_id and sid == source_id:
                return row
            if connector_id and cid == connector_id:
                return row
            if needle in {sid, cid}:
                return row
    return {}


def _match_procurement_id(store: Any, *, host: str = "", url: str = "") -> str:
    want_host = _host_of(host) or _host_of(url)
    want_url = _https_url(url).rstrip("/")
    if not want_host and not want_url:
        return ""
    try:
        rows = store.list() or []
    except Exception:  # noqa: BLE001
        return ""
    # Prefer approved with matching host, then any host match.
    ranked: list[tuple[int, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        cid = str(row.get("id") or row.get("connector_id") or "").strip()
        if not cid:
            continue
        spec = row.get("spec") if isinstance(row.get("spec"), dict) else {}
        row_url = str(row.get("source_url") or spec.get("source_url") or "").rstrip("/")
        row_host = str(spec.get("host") or _host_of(row_url) or "").lower().removeprefix("www.")
        score = 0
        if want_url and row_url and want_url == row_url:
            score += 40
        if want_host and row_host and want_host == row_host:
            score += 20
        if want_host and row_url and want_host in row_url.lower():
            score += 10
        if score <= 0:
            continue
        if str(row.get("status") or "") == "approved":
            score += 5
        ranked.append((score, cid))
    if not ranked:
        return ""
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][1]


def _probe_fallback_plan(
    *,
    url: str,
    title: str,
    connector_id: str,
    source_id: str,
    candidate_key: str,
    catalog_connector_id: str,
    prefer_browser: bool = True,
) -> dict[str, Any]:
    """When catalog has no file manifest: browser scrape (Spectator/windows_lab) or probe."""
    probe_url = _https_url(url)
    label = title or source_id or catalog_connector_id or connector_id or "Discover source"
    # Site roots / OpenAPI portals need Playwright — not a fake file harvest.
    path = ""
    try:
        from urllib.parse import urlparse
        path = (urlparse(probe_url).path or "").rstrip("/")
    except Exception:  # noqa: BLE001
        path = ""
    looks_like_portal = prefer_browser and probe_url.startswith("http") and (
        not path or path in {"", "/"} or path.endswith((".html", ".htm", "/openapi", "/api"))
        or "openapi." in probe_url
        or "mops." in probe_url
    )
    if looks_like_portal:
        return {
            "title": f"Discover scrape · {label}",
            "job_type": "scraper_run",
            "script_key": "generic_url_scrape",
            "url": probe_url,
            "scrape_mode": "page",
            "launchable": True,
            "requires_approval": True,
            "agent_initiated": True,
            "timeout_seconds": 1800,
            "connector_id": connector_id or catalog_connector_id,
            "catalog_connector_id": catalog_connector_id or connector_id,
            "source_id": source_id,
            "candidate_key": candidate_key,
            "collect_resolution": "catalog_browser_scrape_fallback",
            "collect_note": (
                "No bounded HTTP file manifest; queued Spectator generic_url_scrape "
                "on windows_lab (Discover-linked)."
            ),
            "pool_hint": "windows_lab",
        }
    return {
        "title": f"Discover collect · {label}",
        "job_type": "source_probe",
        "url": probe_url,
        "launchable": True,
        "requires_approval": True,
        "connector_id": connector_id or catalog_connector_id,
        "catalog_connector_id": catalog_connector_id or connector_id,
        "source_id": source_id,
        "candidate_key": candidate_key,
        "collect_resolution": "catalog_source_probe_fallback",
        "collect_note": (
            "Catalog connector has no bounded file manifest yet; "
            "queued as source_probe pending approval (Discover-linked)."
        ),
    }


def resolve_discover_collect_plan(
    procurement: Any,
    repo_root: Any,
    *,
    connector_id: str = "",
    source_id: str = "",
    limit: int = 200,
    title: str = "",
    url: str = "",
    candidate_key: str = "",
) -> dict[str, Any]:
    """Build a launchable plan for ``POST /library/discover/collect``.

    Resolution order:
    1. Procurement ``src_*`` (or any store id) with a bounded file manifest
    2. Catalog source → matched procurement connector by host/URL
    3. Catalog / payload URL → ``source_probe`` fallback (still Discover-linked)
    """
    cid = str(connector_id or "").strip()
    sid = str(source_id or "").strip()
    limit_n = min(max(int(limit or 200), 1), 2000)
    title_s = str(title or "").strip()
    url_s = _https_url(url)
    ck = str(candidate_key or "").strip()

    errors: list[str] = []

    def try_manifest(pid: str) -> dict[str, Any] | None:
        if not pid:
            return None
        try:
            plan = dict(procurement.manifest_plan_from_connector(pid, limit=limit_n))
            plan.setdefault("connector_id", pid)
            plan["collect_resolution"] = "procurement_manifest"
            if title_s:
                plan["title"] = title_s if title_s.lower().startswith("collect") else f"Collect {title_s}"
            if sid:
                plan["source_id"] = sid
            if ck:
                plan["candidate_key"] = ck
            if cid and cid != pid:
                plan["catalog_connector_id"] = cid
            return _stamp_public_collect_plan(plan)
        except KeyError as exc:
            errors.append(f"procurement_missing:{exc}")
            return None
        except ValueError as exc:
            errors.append(f"procurement_unusable:{exc}")
            return None

    # 1) Direct procurement / store id when provided
    if cid:
        plan = try_manifest(cid)
        if plan:
            return _stamp_public_collect_plan(plan)

    catalog = _lookup_catalog_source(repo_root, connector_id=cid, source_id=sid)
    catalog_cid = str(catalog.get("connector_id") or catalog.get("desk_connector_id") or cid).strip()
    catalog_sid = str(catalog.get("source_id") or sid).strip()
    catalog_title = title_s or str(catalog.get("title") or catalog.get("label") or "").strip()
    catalog_endpoint = str(catalog.get("endpoint") or "").strip()
    catalog_url = url_s or _https_url(catalog_endpoint) or _https_url(str(catalog.get("url") or catalog.get("source_url") or ""))
    if not ck:
        ck = str(catalog.get("candidate_key") or "").strip()

    matched = _match_procurement_id(
        getattr(procurement, "store", None),
        host=catalog_endpoint,
        url=catalog_url,
    )
    if matched:
        plan = try_manifest(matched)
        if plan:
            plan["catalog_connector_id"] = catalog_cid or cid
            plan["source_id"] = catalog_sid or sid
            if ck:
                plan["candidate_key"] = ck
            if catalog_title and not plan.get("title"):
                plan["title"] = f"Collect {catalog_title}"
            return _stamp_public_collect_plan(plan)

    # 3) Probe fallback — durable History row without inventing harvest files
    if catalog_url:
        return _probe_fallback_plan(
            url=catalog_url,
            title=catalog_title,
            connector_id=matched or cid or catalog_cid,
            source_id=catalog_sid or sid,
            candidate_key=ck,
            catalog_connector_id=catalog_cid or cid,
        )

    if url_s:
        return _probe_fallback_plan(
            url=url_s,
            title=catalog_title or title_s,
            connector_id=cid,
            source_id=sid,
            candidate_key=ck,
            catalog_connector_id=cid,
        )

    detail = "; ".join(errors[:4]) if errors else "no catalog endpoint or procurement manifest"
    raise KeyError(cid or sid or f"unresolvable_collect ({detail})")
