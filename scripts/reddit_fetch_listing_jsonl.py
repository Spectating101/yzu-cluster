#!/usr/bin/env python3
"""
Fetch recent Reddit submissions (posts) via public listing endpoints and write JSONL.

This uses endpoints like:
  https://www.reddit.com/r/wallstreetbets/new.json

Notes:
  - This does NOT use OAuth and only reliably supports *recent* history.
  - Respect rate limits; use --sleep-secs.
  - Output is JSONL with fields used by reddit_build_sentiment_panel.py.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

import requests


def iter_listing(
    *,
    subreddit: str,
    sort: str,
    limit: int,
    max_pages: int,
    sleep_secs: float,
    user_agent: str,
) -> Iterator[Dict[str, Any]]:
    after: Optional[str] = None
    sort = sort.strip().lower()
    if sort not in {"new", "top", "hot", "rising"}:
        sort = "new"

    for _ in range(int(max_pages)):
        url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
        params = {"limit": int(min(100, max(1, limit)))}
        if after:
            params["after"] = after

        r = requests.get(url, params=params, headers={"User-Agent": user_agent}, timeout=30)
        if r.status_code != 200:
            break
        data = r.json()
        listing = (data or {}).get("data") or {}
        children = listing.get("children") or []
        if not children:
            break

        for ch in children:
            d = (ch or {}).get("data") or {}
            if d:
                yield d

        after = listing.get("after")
        if not after:
            break
        time.sleep(float(max(0.0, sleep_secs)))


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch recent Reddit listing posts to JSONL.")
    ap.add_argument("--subreddits", nargs="+", default=["wallstreetbets", "stocks", "investing", "options"])
    ap.add_argument("--sort", default="new", choices=["new", "top", "hot", "rising"])
    ap.add_argument("--limit", type=int, default=100, help="Items per page (<=100).")
    ap.add_argument("--max-pages", type=int, default=15)
    ap.add_argument("--sleep-secs", type=float, default=1.2)
    ap.add_argument("--user-agent", default="SharpeRenaissanceResearchBot/0.1 (contact: local)")
    ap.add_argument("--out", type=Path, default=Path("data_lake/reddit_recent.jsonl"))
    ap.add_argument("--append", action="store_true", help="Append to --out if it exists (dedupes by post id).")
    args = ap.parse_args()

    out_path: Path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    seen = set()
    if args.append and out_path.exists():
        try:
            with out_path.open("r", encoding="utf-8", errors="ignore") as rf:
                for line in rf:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if isinstance(obj, dict):
                        pid = obj.get("id") or obj.get("name") or ""
                        if pid:
                            seen.add(pid)
        except Exception:
            pass
    n = 0
    mode = "a" if args.append else "w"
    with out_path.open(mode, encoding="utf-8") as f:
        for sub in args.subreddits:
            for d in iter_listing(
                subreddit=str(sub),
                sort=str(args.sort),
                limit=int(args.limit),
                max_pages=int(args.max_pages),
                sleep_secs=float(args.sleep_secs),
                user_agent=str(args.user_agent),
            ):
                pid = d.get("id") or d.get("name") or ""
                if pid and pid in seen:
                    continue
                if pid:
                    seen.add(pid)
                rec = {
                    "created_utc": d.get("created_utc"),
                    "subreddit": d.get("subreddit"),
                    "author": d.get("author"),
                    "title": d.get("title"),
                    "selftext": d.get("selftext"),
                    "id": d.get("id") or d.get("name"),
                    "score": d.get("score"),
                    "ups": d.get("ups"),
                    "upvote_ratio": d.get("upvote_ratio"),
                    "num_comments": d.get("num_comments"),
                    "permalink": d.get("permalink"),
                    "url": d.get("url"),
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n += 1

    print(json.dumps({"out": str(out_path), "n_records": n, "n_unique": len(seen)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
