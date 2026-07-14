#!/usr/bin/env python3
"""Stack-fast Ask turns — direct equipment paths that should not wait on Composer."""

from __future__ import annotations

import re
from typing import Any

from scripts.research_data_mcp.desk_brain import AgentTurn
from scripts.research_data_mcp.http_router import _compact_probe_response
from scripts.research_data_mcp.scrape_plan import extract_urls

_PROBE_INTENT = re.compile(r"\bprobe\b", re.I)


def probe_url_from_message(message: str, rail_context: dict[str, Any] | None = None) -> str | None:
    """Return a URL when the user clearly asked to probe, not plan."""
    text = (message or "").strip()
    if not text:
        return None
    urls = extract_urls(text)
    if not urls:
        return None
    actions = rail_context.get("actions") if isinstance(rail_context, dict) else None
    if isinstance(actions, list) and any(str(a).lower() == "probe" for a in actions):
        return urls[0]
    if _PROBE_INTENT.search(text[:160]):
        return urls[0]
    return None


def is_direct_probe_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return probe_url_from_message(message, rail_context) is not None


_SEARCH_BLOCK = re.compile(
    r"\b(probe|collect|compare|plan|explain|why|how\s+should|summarize)\b",
    re.I,
)
_SEARCH_PATTERNS = (
    re.compile(
        r"^\s*(?:search|find|look\s+up)(?:\s+(?:the\s+)?(?:vault|lab|library|registry))?(?:\s+for)?\s+(.+?)\s*[?.!]*\s*$",
        re.I,
    ),
    re.compile(
        r"^\s*what\s+do\s+we\s+have\s+(?:on|for|about)\s+(.+?)\s*[?.!]*\s*$",
        re.I,
    ),
    re.compile(
        r"^\s*search\s+(?!https?://)([a-z0-9][\w\s\-./]{1,120}?)\s*[?.!]*\s*$",
        re.I,
    ),
)


def search_query_from_message(message: str, rail_context: dict[str, Any] | None = None) -> str | None:
    """Return a query when the user clearly asked to search the vault, not plan."""
    text = (message or "").strip()
    if not text or _SEARCH_BLOCK.search(text[:200]):
        return None
    rail = rail_context if isinstance(rail_context, dict) else {}
    actions = [str(a).lower() for a in (rail.get("actions") or [])]
    if "search" in actions:
        explicit = str(rail.get("search_query") or "").strip()
        if explicit:
            return explicit
    for pattern in _SEARCH_PATTERNS:
        match = pattern.match(text)
        if not match:
            continue
        query = match.group(1).strip().strip('"').strip("'")
        if len(query) >= 2:
            return query
    return None


def is_direct_search_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return search_query_from_message(message, rail_context) is not None


_DOI_RE = re.compile(r"(?:doi:\s*)?(10\.\d{4,9}/[^\s'\"<>]+)", re.I)
_COLLECT_BLOCK = re.compile(r"\b(plan|compare|explain|why|should|summarize)\b", re.I)
_COLLECT_INTENT = re.compile(r"\bcollect\b", re.I)
_DESCRIBE_PATTERNS = (
    re.compile(
        r"^\s*(?:describe|show|open|inspect)\s+(?:dataset\s+)?([a-z0-9][\w:./-]{2,120})\s*[?.!]*\s*$",
        re.I,
    ),
)
_QUERY_PATTERNS = (
    re.compile(
        r"^\s*query\s+(?:dataset\s+)?([a-z0-9][\w:./-]{2,120})(?:\s+limit\s+(\d+))?\s*[?.!]*\s*$",
        re.I,
    ),
)


def doi_from_message(message: str, rail_context: dict[str, Any] | None = None) -> str | None:
    text = (message or "").strip()
    if not text:
        return None
    rail = rail_context if isinstance(rail_context, dict) else {}
    actions = [str(a).lower() for a in (rail.get("actions") or [])]
    explicit = str(rail.get("doi") or "").strip()
    if explicit and ("collect" in actions or _COLLECT_INTENT.search(text[:120])):
        match = _DOI_RE.search(explicit)
        return match.group(1) if match else explicit
    if not _COLLECT_INTENT.search(text[:160]):
        return None
    if _COLLECT_BLOCK.search(text[:120]):
        return None
    match = _DOI_RE.search(text)
    return match.group(1) if match else None


def is_direct_collect_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return doi_from_message(message, rail_context) is not None


def dataset_id_from_message(
    message: str,
    rail_context: dict[str, Any] | None = None,
    *,
    mode: str = "describe",
) -> str | None:
    text = (message or "").strip()
    if not text:
        return None
    rail = rail_context if isinstance(rail_context, dict) else {}
    explicit = str(rail.get("dataset_id") or "").strip()
    if explicit:
        return explicit
    patterns = _DESCRIBE_PATTERNS if mode == "describe" else _QUERY_PATTERNS
    for pattern in patterns:
        match = pattern.match(text)
        if match:
            return match.group(1).strip()
    return None


def query_limit_from_message(message: str) -> int:
    text = (message or "").strip()
    for pattern in _QUERY_PATTERNS:
        match = pattern.match(text)
        if match and match.lastindex and match.lastindex >= 2 and match.group(2):
            try:
                return max(1, min(50, int(match.group(2))))
            except ValueError:
                pass
    return 10


def is_direct_describe_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return dataset_id_from_message(message, rail_context, mode="describe") is not None


def is_direct_query_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return dataset_id_from_message(message, rail_context, mode="query") is not None


def is_direct_discovery_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return (
        is_direct_probe_message(message, rail_context)
        or is_direct_search_message(message, rail_context)
        or is_direct_status_message(message)
        or is_direct_describe_message(message, rail_context)
        or is_direct_query_message(message, rail_context)
        or is_direct_schedule_message(message, rail_context)
    )


def is_direct_procurement_submit_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    """Explicit collect/submit — skips Composer but work continues on cluster."""
    return is_direct_collect_message(message, rail_context)


def is_direct_equipment_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    """Any turn that should not wait on Composer priming or planning."""
    return is_direct_discovery_message(message, rail_context) or is_direct_procurement_submit_message(
        message, rail_context
    )


_STATUS_INTENT = re.compile(r"^(?:status|check\s+status|job\s+status)\s*[?.!]*$", re.I)


def is_direct_status_message(message: str) -> bool:
    return bool(_STATUS_INTENT.match((message or "").strip()))


def try_direct_status_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    if not is_direct_status_message(message):
        return None
    lines: list[str] = []
    if state.get("composer_pending"):
        lines.append(
            "Composer is still finishing your previous planning turn in the background. "
            "You can keep using Discover and Probe while it completes."
        )
    pending_job_id = str(state.get("pending_job_id") or "").strip()
    if pending_job_id:
        try:
            job = gateway.orchestrator.store.get(pending_job_id)
            status = str(job.get("status") or "unknown")
            lines.append(f"Pending job `{pending_job_id[:12]}…` is **{status}**.")
        except Exception as exc:  # noqa: BLE001
            lines.append(f"Pending job `{pending_job_id[:12]}…` — could not load status ({exc}).")
    campaign_id = str(state.get("campaign_id") or "").strip()
    if campaign_id:
        lines.append(f"Active campaign: `{campaign_id[:16]}…`")
    if not lines:
        lines.append("No pending Composer turn or collection job for this session.")
    return AgentTurn(
        plan={"action": "status", "fast_path": True},
        action_result={"action": "status", "fast_path": True},
        reply="\n".join(lines),
        suggested_prompts=["Search vault for related datasets", "Probe a candidate URL"],
        tool_name="desk_status",
    )


def _search_reply(query: str, out: dict[str, Any]) -> str:
    rows = list(out.get("rows") or [])
    if not rows:
        note = ""
        if out.get("timed_out_layers"):
            note = f" Some layers timed out ({', '.join(out['timed_out_layers'])}); retry Discover for a fuller pass."
        return f"No vault matches for **{query}**.{note}"
    lines = [f"Found **{len(rows)}** match(es) for **{query}**:"]
    for row in rows[:6]:
        title = str(row.get("title") or row.get("dataset_id") or row.get("doi") or row.get("id") or "untitled")
        kind = str(row.get("kind") or row.get("source") or "result")
        lines.append(f"- {title} ({kind})")
    if len(rows) > 6:
        lines.append(f"- …and {len(rows) - 6} more")
    if out.get("timed_out_layers"):
        lines.append(f"_Partial results — timed out: {', '.join(out['timed_out_layers'])}_")
    return "\n".join(lines)


def try_direct_search_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    """Run vault search equipment directly, skip Composer."""
    query = search_query_from_message(message, state.get("rail_context"))
    if not query:
        return None
    email = str(state.get("user_email") or "").strip()
    if email:
        out = gateway.unified_search_with_profile(query, email=email, limit=12, parallel_profile=True)
    else:
        out = gateway.unified_dataset_search(query, limit=12)
    reply = _search_reply(query, out)
    return AgentTurn(
        plan={"action": "search", "fast_path": True, "query": query},
        action_result={
            "action": "search",
            "fast_path": True,
            "query": query,
            "search": out,
            "preview": out,
            "total": out.get("total"),
            "timed_out_layers": out.get("timed_out_layers") or [],
        },
        reply=reply,
        suggested_prompts=[
            f"Probe the top result for {query}",
            f"Queue cluster collection for the best {query} match",
        ],
        tool_name="research_unified_search",
    )



_SCHEDULE_INTENT = re.compile(
    r"\b(schedule|subscribe|subscription|auto[- ]?refresh|recurring|"
    r"every\s+monday|every\s+week|weekly|daily|monthly|cron)\b",
    re.I,
)


def _rail_selected(rail_context: dict[str, Any] | None) -> dict[str, Any]:
    rail = rail_context if isinstance(rail_context, dict) else {}
    for key in ("selected", "object", "candidate", "source", "dataset", "entity"):
        val = rail.get(key)
        if isinstance(val, dict) and val:
            return val
    return rail if any(k in rail for k in ("source_id", "connector_id", "candidate_key", "dataset_id")) else {}


def parse_schedule_request(
    message: str,
    rail_context: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Return cadence + source identity when the user asked to schedule a refresh."""
    text = (message or "").strip()
    if not text or not _SCHEDULE_INTENT.search(text[:240]):
        return None
    # Avoid treating pure "status" / probe as schedule.
    if is_direct_status_message(text) or is_direct_probe_message(text, rail_context):
        return None
    lowered = text.lower()
    if re.search(r"\bevery\s+day\b|\bdaily\b", lowered):
        cadence = "daily"
    elif re.search(r"\bmonthly\b|\bevery\s+month\b", lowered):
        cadence = "monthly"
    elif re.search(r"\bmanual\b", lowered):
        cadence = "manual"
    else:
        # Monday 10am / weekly / every week / generic schedule → weekly bucket
        cadence = "weekly"

    selected = _rail_selected(rail_context)
    source_id = str(
        selected.get("source_id")
        or selected.get("id")
        or ""
    ).strip()
    # Prefer explicit twse_official style ids over titles
    if source_id and (" " in source_id or source_id.lower() in {"twse open api", "selected"}):
        source_id = str(selected.get("source_id") or "").strip()
    connector_id = str(selected.get("connector_id") or selected.get("desk_connector_id") or "").strip()
    candidate_key = str(selected.get("candidate_key") or "").strip()
    if not candidate_key and source_id:
        candidate_key = f"source:{source_id}"
    # Parse inline source_id=... from message when rail is thin
    m_src = re.search(r"source_id\s*=\s*([a-z0-9_.:-]+)", text, re.I)
    m_conn = re.search(r"connector_id\s*=\s*([a-z0-9_.:-]+)", text, re.I)
    if m_src:
        source_id = m_src.group(1)
        candidate_key = candidate_key or f"source:{source_id}"
    if m_conn:
        connector_id = m_conn.group(1)
    if not (source_id or connector_id or candidate_key):
        return None
    # Keep faculty wording for History (e.g. every Monday at 10:00)
    requested = text
    for prefix in ("For the selected", "Please ", "Can you ", "Could you "):
        if requested.lower().startswith(prefix.lower()):
            requested = requested[len(prefix):].strip()
            break
    requested = re.sub(r"\s+", " ", requested)[:240]
    return {
        "cadence": cadence,
        "source_id": source_id,
        "connector_id": connector_id,
        "candidate_key": candidate_key,
        "requested_schedule": requested,
        "destination": "ask-schedule",
    }


def is_direct_schedule_message(message: str, rail_context: dict[str, Any] | None = None) -> bool:
    return parse_schedule_request(message, rail_context) is not None


def try_direct_schedule_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    """Persist a Discover refresh subscription immediately — agent operates the platform."""
    req = parse_schedule_request(message, state.get("rail_context"))
    if not req:
        return None
    try:
        sub = gateway.discover_refresh_create(
            cadence=req["cadence"],
            destination=req.get("destination") or "ask-schedule",
            source_id=req.get("source_id") or "",
            connector_id=req.get("connector_id") or "",
            candidate_key=req.get("candidate_key") or "",
            enabled=True,
            requested_schedule=req.get("requested_schedule") or "",
            schedule_note=(
                "Registered from Ask. Visible in Discover → History → Scheduled. "
                "Per-source auto-run is not claimed yet."
            ),
        )
    except Exception as exc:  # noqa: BLE001
        return AgentTurn(
            plan={"action": "schedule_refresh", "fast_path": True, **req},
            action_result={"action": "schedule_refresh", "fast_path": True, "error": str(exc), **req},
            reply=f"Could not register the refresh subscription: {exc}",
            suggested_prompts=["Open Discover History", "Probe this source first"],
            tool_name="research_discover_create_refresh_subscription",
        )

    sub_id = str(sub.get("id") or "")
    cadence = str(sub.get("cadence") or req["cadence"])
    requested = str(sub.get("requested_schedule") or req.get("requested_schedule") or cadence)
    target = sub.get("source_id") or sub.get("connector_id") or sub.get("candidate_key") or "source"
    reply = (
        f"Registered refresh for **{target}** in Discover History.\n"
        f"- Requested: {requested}\n"
        f"- Platform cadence bucket: `{cadence}`\n"
        f"- Subscription `{sub_id[:12]}…` · status **{sub.get('status') or 'active'}**\n\n"
        "Open **Discover → History → Scheduled** to see it. "
        "This record is durable on the platform; automatic Monday execution is not claimed yet "
        "(YZU has no per-source subscription runner)."
    )
    try:
        from scripts.research_data_mcp.desk_activity import record_activity

        record_activity(
            "refresh_subscription",
            str(target)[:200],
            repo_root=getattr(gateway, "repo_root", None),
            meta={"subscription_id": sub_id, "cadence": cadence, "requested_schedule": requested},
        )
    except Exception:
        pass
    return AgentTurn(
        plan={"action": "schedule_refresh", "fast_path": True, **req},
        action_result={
            "action": "schedule_refresh",
            "fast_path": True,
            "subscription": sub,
            "subscription_id": sub_id,
            "cadence": cadence,
            "requested_schedule": requested,
            "history_kind": "subscription",
            "platform_registered": True,
        },
        reply=reply,
        suggested_prompts=[
            "Open Discover History Scheduled",
            "Pause this refresh subscription",
            "Probe this source",
        ],
        tool_name="research_discover_create_refresh_subscription",
    )


def try_direct_equipment_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    status = try_direct_status_turn(gateway, message, state)
    if status is not None:
        return status
    schedule = try_direct_schedule_turn(gateway, message, state)
    if schedule is not None:
        return schedule
    probe = try_direct_probe_turn(gateway, message, state)
    if probe is not None:
        return probe
    describe = try_direct_describe_turn(gateway, message, state)
    if describe is not None:
        return describe
    query = try_direct_query_turn(gateway, message, state)
    if query is not None:
        return query
    collect = try_submit_collect_turn(gateway, message, state)
    if collect is not None:
        return collect
    return try_direct_search_turn(gateway, message, state)


def _describe_reply(dataset_id: str, out: dict[str, Any]) -> str:
    title = str(out.get("title") or out.get("name") or dataset_id)
    readiness = str(out.get("readiness") or out.get("access_mode") or "unknown")
    lines = [f"**{title}** (`{dataset_id}`) — readiness: {readiness}"]
    summary = str(out.get("summary") or out.get("description") or "").strip()
    if summary:
        lines.append(summary[:500])
    local = out.get("local_path") or out.get("path")
    if local:
        lines.append(f"Local path: `{local}`")
    return "\n".join(lines)


def try_direct_describe_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    dataset_id = dataset_id_from_message(message, state.get("rail_context"), mode="describe")
    if not dataset_id:
        return None
    try:
        out = gateway.describe_dataset(dataset_id)
    except Exception as exc:  # noqa: BLE001
        return AgentTurn(
            plan={"action": "describe_dataset", "fast_path": True, "dataset_id": dataset_id},
            action_result={"action": "describe_dataset", "fast_path": True, "error": str(exc), "dataset_id": dataset_id},
            reply=f"Could not describe `{dataset_id}`: {exc}",
            suggested_prompts=[f"Search vault for {dataset_id}"],
            tool_name="research_describe_dataset",
        )
    return AgentTurn(
        plan={"action": "describe_dataset", "fast_path": True, "dataset_id": dataset_id},
        action_result={"action": "describe_dataset", "fast_path": True, "dataset": out, "dataset_id": dataset_id},
        reply=_describe_reply(dataset_id, out),
        suggested_prompts=[f"Query sample rows from {dataset_id}", f"Queue DOI collect for {dataset_id}"],
        tool_name="research_describe_dataset",
    )


def _query_reply(dataset_id: str, out: dict[str, Any]) -> str:
    rows = list(out.get("rows") or out.get("data") or [])
    columns = out.get("columns") or []
    lines = [f"Query on **{dataset_id}** — {len(rows)} row(s) returned."]
    if columns:
        lines.append(f"Columns: {', '.join(str(c) for c in columns[:12])}")
    for row in rows[:5]:
        if isinstance(row, dict):
            preview = ", ".join(f"{k}={v!r}" for k, v in list(row.items())[:4])
            lines.append(f"- {preview}")
        else:
            lines.append(f"- {row!r}")
    if len(rows) > 5:
        lines.append(f"- …and {len(rows) - 5} more")
    return "\n".join(lines)


def try_direct_query_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    dataset_id = dataset_id_from_message(message, state.get("rail_context"), mode="query")
    if not dataset_id:
        return None
    limit = query_limit_from_message(message)
    try:
        out = gateway.query_dataset(dataset_id, {"limit": limit})
    except Exception as exc:  # noqa: BLE001
        return AgentTurn(
            plan={"action": "query_dataset", "fast_path": True, "dataset_id": dataset_id},
            action_result={"action": "query_dataset", "fast_path": True, "error": str(exc), "dataset_id": dataset_id},
            reply=f"Query failed for `{dataset_id}`: {exc}",
            suggested_prompts=[f"Describe {dataset_id}"],
            tool_name="research_query_dataset",
        )
    return AgentTurn(
        plan={"action": "query_dataset", "fast_path": True, "dataset_id": dataset_id, "limit": limit},
        action_result={"action": "query_dataset", "fast_path": True, "query": out, "dataset_id": dataset_id},
        reply=_query_reply(dataset_id, out),
        suggested_prompts=[f"Describe {dataset_id}", "Search vault for related datasets"],
        tool_name="research_query_dataset",
    )


def try_submit_collect_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    """Queue a DOI collect on the cluster — discovery is done; download is background."""
    doi = doi_from_message(message, state.get("rail_context"))
    if not doi:
        return None
    try:
        out = gateway.collect_datacite_doi(doi, auto_execute=True)
    except Exception as exc:  # noqa: BLE001
        return AgentTurn(
            plan={"action": "submit_collect", "procurement_submit": True, "doi": doi},
            action_result={
                "action": "submit_collect",
                "procurement_submit": True,
                "error": str(exc),
                "doi": doi,
            },
            reply=f"Could not queue collect for `{doi}`: {exc}",
            suggested_prompts=[f"Probe landing page for {doi}"],
            tool_name="datacite_collect_doi",
        )
    if out.get("blocked"):
        gate = out.get("gate") if isinstance(out.get("gate"), dict) else {}
        reason = str(out.get("message") or gate.get("blocked_reason") or "approval required")
        return AgentTurn(
            plan={"action": "submit_collect", "procurement_submit": True, "doi": doi, "blocked": True},
            action_result={
                "action": "submit_collect",
                "procurement_submit": True,
                "collect": out,
                "doi": doi,
            },
            reply=f"Collect for `{doi}` needs approval before the cluster can run: {reason}",
            suggested_prompts=["Approve license and retry collect"],
            tool_name="datacite_collect_doi",
        )
    job = out.get("job") if isinstance(out.get("job"), dict) else {}
    job_id = str(job.get("id") or job.get("job_id") or out.get("job_id") or "").strip()
    job_status = str(job.get("status") or ("pending_approval" if out.get("blocked") else "queued"))
    campaign = str(out.get("campaign_id") or job.get("campaign_id") or "").strip()
    title = str((out.get("resolved") or {}).get("title") or doi)
    reply = (
        f"Queued **{title}** (`{doi}`) for cluster collection. "
        "The download runs in the background — check job status or keep browsing Discover."
    )
    if job_id:
        reply += f" Job `{job_id[:12]}…`."
    elif campaign:
        reply += f" Campaign `{campaign[:16]}…`."
    if job_id:
        state["pending_job_id"] = job_id
        state["job_status"] = job_status
    return AgentTurn(
        plan={"action": "submit_collect", "procurement_submit": True, "doi": doi},
        action_result={
            "action": "submit_collect",
            "procurement_submit": True,
            "collect": out,
            "doi": doi,
            "job_id": job_id,
            "job": job if job else None,
            "background": True,
        },
        reply=reply,
        suggested_prompts=["Check job status", f"Search vault for related {doi}"],
        tool_name="datacite_collect_doi",
    )


try_direct_collect_turn = try_submit_collect_turn


def _probe_reply(url: str, out: dict[str, Any]) -> str:
    summary = str(out.get("summary") or "").strip()
    connector = out.get("connector") if isinstance(out.get("connector"), dict) else {}
    spec = connector.get("spec") if isinstance(connector.get("spec"), dict) else {}
    access = spec.get("access_mode") or "unknown"
    content = spec.get("content_type") or "unknown"
    files = spec.get("discovered_file_count")
    if summary:
        return summary
    parts = [f"`{url}` is reachable as **{access}** (`{content}`)"]
    if files is not None:
        parts.append(f"{files} downloadable file(s) detected")
    parts.append("Use **Add to lab** in Discover to queue cluster collection once fit is confirmed.")
    return " ".join(parts) + "."


def try_direct_probe_turn(
    gateway: Any,
    message: str,
    state: dict[str, Any],
) -> AgentTurn | None:
    """Run procurement probe equipment directly (~0.5s), skip Composer (~45–90s)."""
    url = probe_url_from_message(message, state.get("rail_context"))
    if not url:
        return None
    raw = gateway.probe_source(url, name=url[:120])
    if raw.get("error"):
        return AgentTurn(
            plan={"action": "probe_url", "fast_path": True},
            action_result={"action": "probe_url", "fast_path": True, "error": raw.get("error"), "url": url},
            reply=f"Probe failed for `{url}`: {raw.get('error')}",
            suggested_prompts=[],
            tool_name="procurement_probe_public_source",
        )
    compact = _compact_probe_response(raw)
    reply = _probe_reply(url, compact)
    return AgentTurn(
        plan={"action": "probe_url", "fast_path": True},
        action_result={
            "action": "probe_url",
            "fast_path": True,
            "probe": compact,
            "connector": compact.get("connector"),
            "url": url,
        },
        reply=reply,
        suggested_prompts=[
            "Add this source to the lab vault",
            "What registry datasets overlap this source?",
        ],
        tool_name="procurement_probe_public_source",
    )
