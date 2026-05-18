#!/usr/bin/env python3
"""
Fetch Reddit comments for a set of submissions and write JSONL.

This uses public endpoints like:
  https://www.reddit.com/r/wallstreetbets/comments/<id>.json

Notes:
  - No OAuth; be gentle with rate limits.
  - Comment history is limited by what Reddit returns for the thread.
  - Output is JSONL intended to feed into reddit_daily_signals.py (uses `body` field).
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

import requests


def iter_jsonl(path: Path) -> Iterator[Dict[str, Any]]:
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
                yield obj


def _thread_url_from_post(post: Dict[str, Any]) -> Optional[str]:
    permalink = (post.get("permalink") or "").strip()
    if permalink:
        if permalink.startswith("http"):
            url = permalink
        else:
            url = f"https://www.reddit.com{permalink}"
        # Ensure JSON endpoint.
        if not url.rstrip("/").endswith(".json"):
            url = url.rstrip("/") + ".json"
        return url
    pid = (post.get("id") or "").strip()
    if pid:
        return f"https://www.reddit.com/comments/{pid}.json"
    return None


def _flatten_comment_tree(node: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
    # `node` is a "listing" or a "thing"; recurse on listing children.
    kind = node.get("kind")
    data = node.get("data") or {}
    if kind == "Listing":
        for ch in (data.get("children") or []):
            if isinstance(ch, dict):
                yield from _flatten_comment_tree(ch)
        return
    if kind == "t1":
        yield node
        # replies may be empty string or a listing.
        replies = data.get("replies")
        if isinstance(replies, dict):
            yield from _flatten_comment_tree(replies)
        return
    # Ignore "more" and anything else.


def _fetch_thread(session: requests.Session, url: str, user_agent: str, timeout_s: int) -> Optional[List[Any]]:
    try:
        r = session.get(
            url,
            params={"limit": 500, "sort": "new"},
            headers={"User-Agent": user_agent, "Accept": "application/json"},
            timeout=int(timeout_s),
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch Reddit comments for submissions JSONL to JSONL.")
    ap.add_argument("--in-posts-jsonl", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("data_lake/sentiment/reddit_comments_recent.jsonl"))
    ap.add_argument("--max-posts", type=int, default=25)
    ap.add_argument("--sleep-secs", type=float, default=1.2)
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--user-agent", default="SharpeRenaissanceResearchBot/0.1 (contact: local)")
    ap.add_argument("--append", action="store_true", help="Append to --out if it exists (dedupes by comment id).")
    args = ap.parse_args()

    posts = list(iter_jsonl(args.in_posts_jsonl))[: int(args.max_posts)]
    if not posts:
        print("No posts loaded.")
        return 2

    args.out.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    if args.append and args.out.exists():
        try:
            for obj in iter_jsonl(args.out):
                cid = obj.get("id") or obj.get("name") or ""
                if cid:
                    seen.add(cid)
        except Exception:
            pass
    n_comments = 0
    n_threads_ok = 0

    mode = "a" if args.append else "w"
    with requests.Session() as sess, args.out.open(mode, encoding="utf-8") as f:
        for i, post in enumerate(posts, 1):
            url = _thread_url_from_post(post)
            if not url:
                continue

            payload = _fetch_thread(sess, url, str(args.user_agent), int(args.timeout))
            if not payload or not isinstance(payload, list) or len(payload) < 2:
                time.sleep(float(max(0.0, args.sleep_secs)))
                continue
            n_threads_ok += 1

            # payload[1] is the comments listing
            comments_listing = payload[1] if isinstance(payload[1], dict) else None
            if not comments_listing:
                time.sleep(float(max(0.0, args.sleep_secs)))
                continue

            post_id = post.get("id") or ""
            subreddit = post.get("subreddit") or ""
            for node in _flatten_comment_tree(comments_listing):
                d = node.get("data") or {}
                body = d.get("body")
                if not isinstance(body, str) or not body.strip():
                    continue
                if body.strip() in {"[removed]", "[deleted]"}:
                    continue
                cid = d.get("id") or d.get("name") or ""
                if cid and cid in seen:
                    continue
                if cid:
                    seen.add(cid)

                rec = {
                    "created_utc": d.get("created_utc"),
                    "subreddit": subreddit or d.get("subreddit"),
                    "author": d.get("author"),
                    "link_id": d.get("link_id"),
                    "parent_id": d.get("parent_id"),
                    "post_id": post_id,
                    "id": d.get("id") or d.get("name"),
                    "score": d.get("score"),
                    "body": body,
                    "permalink": d.get("permalink"),
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n_comments += 1

            time.sleep(float(max(0.0, args.sleep_secs)))

    print(
        json.dumps(
            {
                "out": str(args.out),
                "n_posts": len(posts),
                "n_threads_ok": n_threads_ok,
                "n_comments": n_comments,
                "n_unique_comments": len(seen),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
