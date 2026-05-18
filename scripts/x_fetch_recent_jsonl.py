#!/usr/bin/env python3
"""
Fetch recent X (Twitter) posts via the official X API v2 recent search endpoint.

Requirements:
  - An X Developer account + an API bearer token with access to /2/tweets/search/recent
  - Provide token via --bearer-token or env var X_BEARER_TOKEN

Writes JSONL with fields compatible with `reddit_daily_signals.py`:
  - created_at (ISO)
  - text
  - id
  - score (engagement proxy)
  - plus metadata fields to support later analysis
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterator, Optional, Set, Tuple

import requests


API_URL = "https://api.twitter.com/2/tweets/search/recent"


def _iter_jsonl_ids(path: Path) -> Set[str]:
    seen: Set[str] = set()
    if not path.exists():
        return seen
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if isinstance(obj, dict):
                    tid = obj.get("id")
                    if isinstance(tid, str) and tid:
                        seen.add(tid)
    except Exception:
        pass
    return seen


def _compute_score(metrics: Dict[str, Any]) -> int:
    like_count = int(metrics.get("like_count") or 0)
    retweet_count = int(metrics.get("retweet_count") or 0)
    quote_count = int(metrics.get("quote_count") or 0)
    reply_count = int(metrics.get("reply_count") or 0)
    return int(like_count + 2 * retweet_count + 2 * quote_count + reply_count)


def iter_recent_search(
    *,
    bearer_token: str,
    query: str,
    max_pages: int,
    max_results: int,
    sleep_secs: float,
    timeout_s: int,
) -> Iterator[Dict[str, Any]]:
    headers = {"Authorization": f"Bearer {bearer_token}", "Accept": "application/json"}
    params: Dict[str, Any] = {
        "query": query,
        "max_results": int(min(100, max(10, max_results))),
        "tweet.fields": "created_at,lang,public_metrics,author_id,conversation_id,referenced_tweets,entities",
        "user.fields": "username,name,verified,public_metrics",
        "expansions": "author_id",
    }
    next_token: Optional[str] = None

    with requests.Session() as sess:
        for _ in range(int(max_pages)):
            if next_token:
                params["next_token"] = next_token
            else:
                params.pop("next_token", None)

            r = sess.get(API_URL, headers=headers, params=params, timeout=int(timeout_s))
            if r.status_code == 429:
                time.sleep(float(max(5.0, sleep_secs)) * 3.0)
                continue
            if r.status_code != 200:
                break
            payload = r.json()
            data = payload.get("data") or []
            includes = payload.get("includes") or {}
            users = {u.get("id"): u for u in (includes.get("users") or []) if isinstance(u, dict)}

            for t in data:
                if not isinstance(t, dict):
                    continue
                metrics = t.get("public_metrics") or {}
                author_id = t.get("author_id")
                u = users.get(author_id) if author_id else None
                username = (u or {}).get("username")
                yield {
                    "source": "x",
                    "id": t.get("id"),
                    "created_at": t.get("created_at"),
                    "author_id": author_id,
                    "author_username": username,
                    "author": username,
                    "author_verified": (u or {}).get("verified"),
                    "text": t.get("text"),
                    "lang": t.get("lang"),
                    "conversation_id": t.get("conversation_id"),
                    "referenced_tweets": t.get("referenced_tweets"),
                    "entities": t.get("entities"),
                    "public_metrics": metrics,
                    "score": _compute_score(metrics),
                    "subreddit": "x",
                }

            meta = payload.get("meta") or {}
            next_token = meta.get("next_token")
            if not next_token:
                break
            time.sleep(float(max(0.0, sleep_secs)))


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch recent X (Twitter) posts via X API v2 recent search.")
    ap.add_argument("--query", required=True, help='X query, e.g. "($TSLA OR TSLA) (earnings OR guidance)"')
    ap.add_argument("--bearer-token", default="", help="X API bearer token (or env X_BEARER_TOKEN).")
    ap.add_argument("--max-pages", type=int, default=5)
    ap.add_argument("--max-results", type=int, default=100, help="Per page (10..100).")
    ap.add_argument("--sleep-secs", type=float, default=1.0)
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--out", type=Path, default=Path("data_lake/sentiment/x_recent.jsonl"))
    ap.add_argument("--append", action="store_true", help="Append to --out if it exists (dedupes by tweet id).")
    args = ap.parse_args()

    token = (args.bearer_token or os.getenv("X_BEARER_TOKEN") or "").strip()
    if not token:
        raise SystemExit("Missing bearer token. Provide --bearer-token or set X_BEARER_TOKEN.")

    out_path: Path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    seen = _iter_jsonl_ids(out_path) if args.append else set()
    mode = "a" if args.append else "w"
    n_written = 0

    with out_path.open(mode, encoding="utf-8") as f:
        for rec in iter_recent_search(
            bearer_token=token,
            query=str(args.query),
            max_pages=int(args.max_pages),
            max_results=int(args.max_results),
            sleep_secs=float(args.sleep_secs),
            timeout_s=int(args.timeout),
        ):
            tid = rec.get("id")
            if isinstance(tid, str) and tid:
                if tid in seen:
                    continue
                seen.add(tid)
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n_written += 1

    print(json.dumps({"out": str(out_path), "n_new": n_written, "n_seen_total": len(seen)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
