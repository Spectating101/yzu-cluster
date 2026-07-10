#!/usr/bin/env python3
"""Canonical Discover candidate identity (D0b — mirrors frontend candidateKey.js).

Precedence:
1. server-provided candidate_key
2. dataset_id
3. canonical DOI
4. source-specific external identifier
5. canonical URL
6. namespaced normalized title fallback (last resort; never raw title alone)

Typed prefixes prevent cross-type collisions:
  dataset:<id> | doi:<doi> | source:<provider>:<id> | url:<url> | title:<provider>:<title>
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit


def _trim(value: Any) -> str:
    return str(value or "").strip()


def canonicalize_doi(value: Any) -> str:
    doi = _trim(value)
    if not doi:
        return ""
    doi = re.sub(r"^doi:\s*", "", doi, flags=re.IGNORECASE)
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    return doi.lower()


def canonicalize_url(value: Any) -> str:
    """Canonical URL for identity — keep meaningful query params; drop fragment."""
    raw = _trim(value)
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
        if not parts.scheme or not parts.hostname:
            return raw.lower()
        scheme = parts.scheme.lower()
        host = parts.hostname.lower()
        port = parts.port
        if port is not None and not (
            (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
        ):
            netloc = f"{host}:{port}"
        else:
            netloc = host
        if parts.username:
            auth = parts.username
            if parts.password:
                auth = f"{auth}:{parts.password}"
            netloc = f"{auth}@{netloc}"
        path = parts.path or ""
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        return urlunsplit((scheme, netloc, path, parts.query, ""))
    except Exception:
        return raw.lower()


def normalize_title(value: Any) -> str:
    return re.sub(r"\s+", " ", _trim(value)).lower()


def slugify_provider(value: Any) -> str:
    """Unicode-safe provider namespace (D0.2).

    NFKC → trim → casefold → keep letters/numbers/._- → collapse other runs to _.
    """
    import unicodedata

    raw = _trim(value)
    if not raw:
        return "unknown"
    s = unicodedata.normalize("NFKC", raw).casefold().strip()
    parts: list[str] = []
    prev_us = False
    for ch in s:
        if ch.isalnum() or ch in "._-":
            parts.append(ch)
            prev_us = False
        else:
            if not prev_us:
                parts.append("_")
                prev_us = True
    slug = "".join(parts).strip("_")
    slug = "".join(list(slug)[:80])
    if not any(ch.isalnum() for ch in slug):
        return "unknown"
    return slug or "unknown"


def _provider_slug(row: dict[str, Any]) -> str:
    host = ""
    url = _trim(row.get("url") or row.get("source_url") or row.get("resolved_url") or "")
    if url:
        try:
            host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
        except Exception:
            host = ""
    raw = (
        _trim(row.get("provider"))
        or _trim(row.get("publisher"))
        or _trim(row.get("source"))
        or _trim(row.get("collect_via"))
        or _trim(row.get("kind"))
        or host
        or ""
    )
    return slugify_provider(raw)


def _source_external_id(row: dict[str, Any]) -> tuple[str, str] | None:
    kind = _trim(row.get("kind")).lower()
    handle = _trim(row.get("handle") or row.get("open_handle"))
    if handle.startswith("hf:"):
        return ("huggingface", handle[3:])
    if handle.startswith("doi:"):
        return None
    if kind == "huggingface":
        ext = _trim(row.get("hf_id") or row.get("id") or row.get("external_id"))
        if ext and "://" not in ext:
            return ("huggingface", ext)
    external = _trim(row.get("external_id") or row.get("source_id"))
    if external:
        return (_provider_slug(row), external)
    return None


def candidate_key(row: dict[str, Any] | None) -> str:
    """Return typed candidate key, or empty string if nothing usable."""
    if not isinstance(row, dict):
        return ""

    server_key = _trim(row.get("candidate_key"))
    if server_key:
        return server_key

    dataset_id = _trim(row.get("dataset_id"))
    if not dataset_id and _trim(row.get("kind")).lower() == "local_registry":
        dataset_id = _trim(row.get("id"))
    if dataset_id:
        return f"dataset:{dataset_id}"

    doi = canonicalize_doi(row.get("doi"))
    if doi:
        return f"doi:{doi}"

    ext = _source_external_id(row)
    if ext and ext[1]:
        return f"source:{ext[0]}:{ext[1]}"

    url = canonicalize_url(row.get("resolved_url") or row.get("source_url") or row.get("url"))
    if url:
        return f"url:{url}"

    title = normalize_title(row.get("title") or row.get("name"))
    if title:
        return f"title:{_provider_slug(row)}:{title}"

    return ""


def with_candidate_key(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return a shallow copy stamped with candidate_key (does not invent empty keys)."""
    if not isinstance(row, dict):
        return row
    key = candidate_key(row)
    if not key or row.get("candidate_key") == key:
        return row
    out = dict(row)
    out["candidate_key"] = key
    return out


def stamp_rows(rows: list[Any] | None) -> list[Any]:
    if not rows:
        return []
    stamped: list[Any] = []
    for row in rows:
        stamped.append(with_candidate_key(row) if isinstance(row, dict) else row)
    return stamped
