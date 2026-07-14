"""Bounded Discover Explore source preview.

Statuses: ready | schema_only | access_required | failed
Never dumps unbounded nested JSON. Reuses probe/open/query when valid.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.research_data_mcp.candidate_key import candidate_key
from scripts.research_data_mcp.discover_source_search import search_discover_sources
from scripts.research_data_mcp.source_map import load_desk_connectors, load_source_map

PREVIEW_STATUSES = frozenset({"ready", "schema_only", "access_required", "failed"})
_SAMPLE_ROW_CAP = 8
_COLUMN_CAP = 40
_COVERAGE_CAP = 12
_NOTE_CAP = 400


def _trim_rows(rows: Any, *, limit: int = _SAMPLE_ROW_CAP) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if isinstance(row, dict):
            # Flatten to scalar-ish values only
            compact: dict[str, Any] = {}
            for i, (k, v) in enumerate(row.items()):
                if i >= _COLUMN_CAP:
                    break
                if isinstance(v, (dict, list)):
                    compact[str(k)[:80]] = str(v)[:120]
                else:
                    compact[str(k)[:80]] = v if isinstance(v, (int, float, bool)) or v is None else str(v)[:200]
            out.append(compact)
        elif isinstance(row, (list, tuple)):
            out.append({f"c{i}": (str(v)[:200] if v is not None else None) for i, v in enumerate(row[:_COLUMN_CAP])})
        else:
            out.append({"value": str(row)[:200]})
    return out


def _trim_columns(columns: Any) -> list[str]:
    if not isinstance(columns, list):
        return []
    return [str(c)[:120] for c in columns[:_COLUMN_CAP]]


def _base(
    *,
    status: str,
    source_id: str = "",
    connector_id: str = "",
    candidate_key_value: str = "",
    provider: str = "",
    label: str = "",
    coverage: list[str] | None = None,
    schema: dict[str, Any] | None = None,
    sample_rows: list[dict[str, Any]] | None = None,
    notes: str = "",
    reason: str = "",
) -> dict[str, Any]:
    if status not in PREVIEW_STATUSES:
        status = "failed"
    out: dict[str, Any] = {
        "status": status,
        "source_id": source_id or None,
        "connector_id": connector_id or None,
        "candidate_key": candidate_key_value or None,
        "provider": provider or None,
        "label": label or None,
        "coverage": (coverage or [])[:_COVERAGE_CAP],
        "schema": schema or None,
        "sample_rows": sample_rows or [],
        "sample_row_count": len(sample_rows or []),
        "truncated": True,
        "notes": (notes or "")[:_NOTE_CAP] or None,
        "reason": (reason or "")[:_NOTE_CAP] or None,
    }
    return {k: v for k, v in out.items() if v not in (None, "", [])}


def _lookup_catalog(repo_root: Path, *, source_id: str = "", connector_id: str = "") -> dict[str, Any]:
    hits = search_discover_sources(repo_root, source_id or connector_id or "", limit=50)
    for row in hits.get("results") or []:
        if source_id and str(row.get("source_id") or "") == source_id:
            return row
        if connector_id and str(row.get("connector_id") or "") == connector_id:
            return row
    if source_id:
        sm = load_source_map(repo_root)
        for src in sm.get("sources") or []:
            if str(src.get("id") or "") == source_id:
                return {
                    "source_id": source_id,
                    "provider": src.get("provider"),
                    "label": src.get("label"),
                    "access_mode": src.get("access_mode"),
                    "status": src.get("status"),
                    "capabilities": src.get("capabilities") or [],
                    "connector_id": src.get("desk_connector_id"),
                    "subscription_status": None,
                }
    return {}


def _preview_from_probe(gateway: Any, url: str, name: str = "") -> dict[str, Any]:
    try:
        raw = gateway.probe_source(url, name)
    except Exception as exc:  # noqa: BLE001 — honest failed preview
        return _base(status="failed", reason=f"probe failed: {exc}")

    if not isinstance(raw, dict):
        return _base(status="failed", reason="probe returned non-object")

    connector = raw.get("connector") if isinstance(raw.get("connector"), dict) else {}
    spec = connector.get("spec") if isinstance(connector.get("spec"), dict) else {}
    sample = spec.get("sample") if isinstance(spec.get("sample"), dict) else {}

    columns = _trim_columns(sample.get("columns") or sample.get("fields") or [])
    rows = _trim_rows(sample.get("rows") or [])
    schema = {"columns": columns, "field_count": sample.get("field_count") or len(columns)} if columns else None
    cid = str(connector.get("connector_id") or connector.get("id") or "").strip()

    if rows:
        return _base(
            status="ready",
            connector_id=cid,
            candidate_key_value=candidate_key({"url": url, "connector_id": cid, "title": name}),
            label=name or str(spec.get("name") or ""),
            schema=schema,
            sample_rows=rows,
            notes=str(spec.get("recommended_action") or raw.get("summary") or "")[:_NOTE_CAP],
        )
    if columns or schema:
        return _base(
            status="schema_only",
            connector_id=cid,
            candidate_key_value=candidate_key({"url": url, "connector_id": cid, "title": name}),
            label=name or str(spec.get("name") or ""),
            schema=schema or {"columns": columns},
            notes="Probe returned schema/fields without sample rows.",
        )
    access = str(spec.get("access_mode") or "").lower()
    if "auth" in access or "login" in access or "credential" in access:
        return _base(
            status="access_required",
            connector_id=cid,
            reason="Probe indicates authenticated access is required.",
            notes=str(raw.get("summary") or "")[:_NOTE_CAP],
        )
    return _base(
        status="schema_only" if cid else "failed",
        connector_id=cid,
        notes=str(raw.get("summary") or "Probe completed without sample rows.")[:_NOTE_CAP],
        reason=None if cid else "No connector or sample produced",
    )


def _preview_from_dataset(gateway: Any, dataset_id: str, *, limit: int) -> dict[str, Any]:
    """Reuse query engine when a held dataset id is explicitly supplied — not Explore default."""
    try:
        described = gateway.describe_dataset(dataset_id)
    except Exception as exc:  # noqa: BLE001
        return _base(status="failed", reason=f"describe failed: {exc}", source_id=dataset_id)

    schema_cols = []
    for field in (described.get("fields") or described.get("schema") or [])[:_COLUMN_CAP]:
        if isinstance(field, dict):
            schema_cols.append(str(field.get("name") or field.get("id") or "")[:120])
        else:
            schema_cols.append(str(field)[:120])
    schema_cols = [c for c in schema_cols if c]

    try:
        queried = gateway.query_dataset(dataset_id, {"limit": min(limit, _SAMPLE_ROW_CAP)})
        rows = _trim_rows((queried or {}).get("rows") or (queried or {}).get("data") or [], limit=min(limit, _SAMPLE_ROW_CAP))
        if not schema_cols:
            schema_cols = _trim_columns((queried or {}).get("columns") or [])
    except Exception:
        rows = []

    ck = candidate_key({"dataset_id": dataset_id, "title": described.get("name") or dataset_id})
    if rows:
        return _base(
            status="ready",
            source_id=dataset_id,
            candidate_key_value=ck,
            label=str(described.get("name") or dataset_id),
            schema={"columns": schema_cols} if schema_cols else None,
            sample_rows=rows,
            notes="Preview from held registry dataset (explicit dataset_id). Explore search does not default to this.",
            coverage=[str(described.get("grain") or ""), str(described.get("analysis_readiness") or "")],
        )
    if schema_cols:
        return _base(
            status="schema_only",
            source_id=dataset_id,
            candidate_key_value=ck,
            label=str(described.get("name") or dataset_id),
            schema={"columns": schema_cols},
            notes="Registry schema available; sample query returned no rows.",
        )
    return _base(
        status="access_required" if str(described.get("access_shape") or "").startswith("remote") else "failed",
        source_id=dataset_id,
        candidate_key_value=ck,
        label=str(described.get("name") or dataset_id),
        reason="No schema or sample available for this dataset id.",
    )


def preview_discover_source(
    gateway: Any,
    *,
    source_id: str = "",
    connector_id: str = "",
    candidate_key_value: str = "",
    url: str = "",
    doi: str = "",
    dataset_id: str = "",
    name: str = "",
    limit: int = 5,
) -> dict[str, Any]:
    """Bounded source preview for Discover Explore."""
    root = Path(gateway.repo_root).resolve()
    limit = max(1, min(int(limit or 5), _SAMPLE_ROW_CAP))
    source_id = str(source_id or "").strip()
    connector_id = str(connector_id or "").strip()
    url = str(url or "").strip()
    doi = str(doi or "").strip()
    dataset_id = str(dataset_id or "").strip()
    ck = str(candidate_key_value or "").strip()

    if url.startswith("http"):
        out = _preview_from_probe(gateway, url, name=name)
        if ck:
            out["candidate_key"] = ck
        return out

    if doi:
        try:
            resolved = gateway.datacite_resolve_repository(doi)
        except Exception as exc:  # noqa: BLE001
            return _base(status="failed", reason=f"doi resolve failed: {exc}", candidate_key_value=ck or f"doi:{doi.lower()}")
        files = list(resolved.get("files") or [])[:5]
        schema_preview = resolved.get("schema_preview") if isinstance(resolved.get("schema_preview"), dict) else None
        rows = _trim_rows((schema_preview or {}).get("rows") or [], limit=limit)
        columns = _trim_columns((schema_preview or {}).get("columns") or [])
        if rows:
            return _base(
                status="ready",
                candidate_key_value=ck or f"doi:{doi.lower()}",
                label=str(resolved.get("title") or doi),
                schema={"columns": columns} if columns else {"file_count": len(files)},
                sample_rows=rows,
                coverage=[f"files:{len(resolved.get('files') or [])}"],
                notes="DOI repository resolve returned a bounded sample.",
            )
        if files or columns:
            return _base(
                status="schema_only",
                candidate_key_value=ck or f"doi:{doi.lower()}",
                label=str(resolved.get("title") or doi),
                schema={"columns": columns, "files": [{"key": f.get("key"), "size": f.get("size")} for f in files if isinstance(f, dict)][:5]},
                notes="DOI metadata/files known; no sample rows fetched.",
            )
        return _base(
            status="failed",
            candidate_key_value=ck or f"doi:{doi.lower()}",
            reason="DOI resolve returned no files or schema.",
        )

    if dataset_id:
        return _preview_from_dataset(gateway, dataset_id, limit=limit)

    catalog = _lookup_catalog(root, source_id=source_id, connector_id=connector_id)
    if not catalog and not source_id and not connector_id:
        return _base(status="failed", reason="source_id, connector_id, url, doi, or dataset_id is required")

    sid = source_id or str(catalog.get("source_id") or "")
    cid = connector_id or str(catalog.get("connector_id") or "")
    provider = str(catalog.get("provider") or "")
    label = str(catalog.get("label") or catalog.get("title") or sid or cid)
    coverage = [str(x) for x in (catalog.get("capabilities") or [])[:_COVERAGE_CAP]]
    sub = str(catalog.get("subscription_status") or "").lower()
    access_mode = str(catalog.get("access_mode") or "").lower()
    status_flag = str(catalog.get("status") or "").lower()
    ck_final = ck or str(catalog.get("candidate_key") or "") or candidate_key(
        {"source_id": sid, "provider": provider, "external_id": sid or cid, "title": label}
    )

    if sub in {"unavailable"} or status_flag in {"not_available_on_desk"}:
        return _base(
            status="access_required",
            source_id=sid,
            connector_id=cid,
            candidate_key_value=ck_final,
            provider=provider,
            label=label,
            coverage=coverage,
            reason="Source is unavailable or not entitled on this desk.",
            notes=str(catalog.get("notes") or "")[:_NOTE_CAP],
        )

    if access_mode in {"planned"} or sub in {"internal"}:
        return _base(
            status="access_required",
            source_id=sid,
            connector_id=cid,
            candidate_key_value=ck_final,
            provider=provider,
            label=label,
            coverage=coverage,
            reason="Access or licensing required before sample preview.",
            notes=str(catalog.get("notes") or "")[:_NOTE_CAP],
        )

    # Honest schema_only from catalog facts — do not invent sample rows.
    schema = {
        "columns": [],
        "fetch_modes": list(catalog.get("fetch_modes") or [])[:8],
        "access_mode": access_mode or None,
        "subscription_status": catalog.get("subscription_status"),
    }
    desk = load_desk_connectors(root)
    desk_row = desk.get(cid) if cid else None
    if isinstance(desk_row, dict) and desk_row.get("routes"):
        schema["routes"] = str(desk_row.get("routes"))[:240]

    return _base(
        status="schema_only",
        source_id=sid,
        connector_id=cid,
        candidate_key_value=ck_final,
        provider=provider,
        label=label,
        coverage=coverage,
        schema=schema,
        notes=str(catalog.get("notes") or "Catalog schema/access facts only; no live sample claimed.")[:_NOTE_CAP],
    )
