"""CKAN package_search as read-only Research Drive Discover candidates.

Never downloads dataset bytes or marks resources collected/registered/query-ready.
Only named, operator-reviewed HTTPS catalog hosts are reachable.
"""
from __future__ import annotations

import argparse
import json
import re
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

CATALOGS = {
    "data.gov.au": "https://data.gov.au/data/api/3/action/package_search",
}
UA = "ResearchDriveCKANCandidate/0.1 (https://github.com/Spectating101/yzu-cluster)"

def _get(url: str) -> Any:
    req = Request(url, headers={"Accept": "application/json", "User-Agent": UA})
    # Refuse redirects before any second destination can be fetched.
    class RejectRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError("external API redirect refused")
    with build_opener(RejectRedirect()).open(req, timeout=8) as response:
        if "json" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("non-JSON catalog response")
        body = response.read(524289)
        if len(body) > 524288:
            raise ValueError("oversize catalog response")
    return json.loads(body)

def discover(query: str, *, catalog: str = "data.gov.au", limit: int = 5, fetch_json: Callable[[str], Any] = _get) -> dict[str, Any]:
    if catalog not in CATALOGS:
        raise ValueError("catalog not in reviewed allowlist")
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 120:
        raise ValueError("query must be 2-120 characters")
    if not 1 <= limit <= 10:
        raise ValueError("limit must be 1-10")
    query = query.strip()
    url = CATALOGS[catalog] + "?" + urlencode({"q": query, "rows": limit})
    payload = fetch_json(url)
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("result"), dict):
        raise ValueError("CKAN API did not confirm a successful result")
    data = payload["result"]
    if not isinstance(data.get("results"), list):
        raise ValueError("missing CKAN package results")
    candidates = []
    for row in data["results"][:limit]:
        if not isinstance(row, dict) or not row.get("id") or not row.get("title"):
            continue
        # Resource links can be remote, licensed or restricted: do not fetch or authorize them.
        resources = row.get("resources")
        slug = str(row.get("name") or row["id"])
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", slug):
            continue
        candidates.append({
            "source": "ckan", "catalog": catalog, "dataset_id": str(row["id"])[:160],
            "title": str(row["title"])[:300], "notes": str(row.get("notes") or "")[:600],
            "dataset_url": "https://data.gov.au/data/dataset/" + slug,
            "resource_count": len(resources) if isinstance(resources, list) else 0,
            "license_id": str(row.get("license_id") or "")[:100],
            "status": "discovered_needs_access_and_fitness_probe",
            "approved": False, "collected": False, "registered": False, "query_ready": False,
        })
    return {"query": query, "catalog": catalog, "candidates": candidates,
            "reported_total": data.get("count"), "authority": "discovery_only",
            "collect_or_register_authorized": False}

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="yzu-ckan-discover")
    parser.add_argument("query")
    parser.add_argument("--catalog", choices=sorted(CATALOGS), default="data.gov.au")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args(argv)
    print(json.dumps(discover(args.query, catalog=args.catalog, limit=args.limit), indent=2, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
