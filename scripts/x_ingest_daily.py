#!/usr/bin/env python3
"""
Idempotent daily X (Twitter) ingestion (raw JSONL + SQLite index).

This uses the official X API v2. It does not attempt to bypass access restrictions.

Outputs:
  - Raw JSONL per day: data_lake/sentiment/x/raw/YYYY-MM-DD/tweets.jsonl
  - SQLite index:      data_lake/sentiment/x_ingest.sqlite

Optionally, you can feed the raw JSONL into the existing daily panel builder:
  python3 Sharpe-Renaissance/scripts/reddit_daily_signals.py --in-jsonl <tweets.jsonl> ...
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

import requests


API_URL = "https://api.twitter.com/2/tweets/search/recent"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_ts(dt: Optional[datetime] = None) -> float:
    return float((dt or _utc_now()).timestamp())


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tweets (
          id TEXT PRIMARY KEY,
          created_at TEXT,
          author_id TEXT,
          author_username TEXT,
          lang TEXT,
          score INTEGER,
          text TEXT,
          public_metrics_json TEXT,
          query TEXT,
          first_seen_utc REAL,
          last_seen_utc REAL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tweets_query ON tweets(query);")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          started_utc REAL,
          ended_utc REAL,
          status TEXT,
          params_json TEXT,
          summary_json TEXT
        )
        """
    )
    conn.commit()


def _db_has(conn: sqlite3.Connection, row_id: str) -> bool:
    cur = conn.execute("SELECT 1 FROM tweets WHERE id=? LIMIT 1", (row_id,))
    return cur.fetchone() is not None


def _compute_score(metrics: Dict[str, Any]) -> int:
    like_count = int(metrics.get("like_count") or 0)
    retweet_count = int(metrics.get("retweet_count") or 0)
    quote_count = int(metrics.get("quote_count") or 0)
    reply_count = int(metrics.get("reply_count") or 0)
    return int(like_count + 2 * retweet_count + 2 * quote_count + reply_count)


def _fetch_json(
    session: requests.Session,
    *,
    bearer_token: str,
    params: Dict[str, Any],
    timeout_s: int,
) -> Optional[Dict[str, Any]]:
    try:
        r = session.get(
            API_URL,
            headers={"Authorization": f"Bearer {bearer_token}", "Accept": "application/json"},
            params=params,
            timeout=int(timeout_s),
        )
        if r.status_code != 200:
            return None
        payload = r.json()
        if isinstance(payload, dict):
            return payload
        return None
    except Exception:
        return None


def iter_recent_search(
    session: requests.Session,
    *,
    bearer_token: str,
    query: str,
    max_pages: int,
    max_results: int,
    sleep_secs: float,
    timeout_s: int,
) -> Iterator[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "query": query,
        "max_results": int(min(100, max(10, max_results))),
        "tweet.fields": "created_at,lang,public_metrics,author_id,conversation_id,referenced_tweets,entities",
        "user.fields": "username,name,verified,public_metrics",
        "expansions": "author_id",
    }
    next_token: Optional[str] = None

    for _ in range(int(max_pages)):
        if next_token:
            params["next_token"] = next_token
        else:
            params.pop("next_token", None)

        payload = _fetch_json(session, bearer_token=bearer_token, params=params, timeout_s=timeout_s)
        if not payload:
            break
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
                "query": query,
                "subreddit": "x",
            }

        meta = payload.get("meta") or {}
        next_token = meta.get("next_token")
        if not next_token:
            break
        time.sleep(float(max(0.0, sleep_secs)))


def main() -> int:
    sr_root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Idempotent daily X ingestion (raw + sqlite).")
    ap.add_argument("--query", required=True)
    ap.add_argument("--bearer-token", default="", help="X API bearer token (or env X_BEARER_TOKEN).")
    ap.add_argument("--max-pages", type=int, default=5)
    ap.add_argument("--max-results", type=int, default=100)
    ap.add_argument("--sleep-secs", type=float, default=1.0)
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--date", default="", help="UTC date YYYY-MM-DD (default: today).")

    ap.add_argument("--db", type=Path, default=sr_root / "data_lake/sentiment/x_ingest.sqlite")
    ap.add_argument("--raw-root", type=Path, default=sr_root / "data_lake/sentiment/x/raw")
    args = ap.parse_args()

    token = (args.bearer_token or os.getenv("X_BEARER_TOKEN") or "").strip()
    if not token:
        raise SystemExit("Missing bearer token. Provide --bearer-token or set X_BEARER_TOKEN.")

    started = _utc_ts()
    run_id = f"x_ingest_{int(started)}"

    if args.date.strip():
        run_date = datetime.strptime(args.date.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        run_date = _utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    day_str = run_date.strftime("%Y-%m-%d")
    raw_dir = Path(args.raw_root) / day_str
    out_path = raw_dir / "tweets.jsonl"
    _ensure_parent(out_path)

    _ensure_parent(args.db)
    with sqlite3.connect(str(args.db)) as conn:
        _init_db(conn)
        conn.execute(
            "INSERT OR REPLACE INTO runs(run_id, started_utc, status, params_json) VALUES(?,?,?,?)",
            (run_id, started, "running", json.dumps(vars(args), default=str)),
        )
        conn.commit()

        n_new = 0
        fetched_utc = _utc_ts()
        with requests.Session() as sess, out_path.open("a", encoding="utf-8") as f:
            for rec in iter_recent_search(
                sess,
                bearer_token=token,
                query=str(args.query),
                max_pages=int(args.max_pages),
                max_results=int(args.max_results),
                sleep_secs=float(args.sleep_secs),
                timeout_s=int(args.timeout),
            ):
                tid = (rec.get("id") or "").strip()
                if not tid or _db_has(conn, tid):
                    continue
                conn.execute(
                    """
                    INSERT INTO tweets(
                      id, created_at, author_id, author_username, lang, score, text,
                      public_metrics_json, query, first_seen_utc, last_seen_utc
                    )
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        tid,
                        rec.get("created_at"),
                        rec.get("author_id"),
                        rec.get("author_username"),
                        rec.get("lang"),
                        int(rec.get("score") or 0),
                        rec.get("text"),
                        json.dumps(rec.get("public_metrics") or {}, ensure_ascii=False),
                        str(args.query),
                        fetched_utc,
                        fetched_utc,
                    ),
                )
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n_new += 1

        conn.commit()
        summary = {
            "run_id": run_id,
            "date": day_str,
            "db": str(args.db),
            "raw_dir": str(raw_dir),
            "tweets_jsonl": str(out_path),
            "n_new_tweets": n_new,
        }
        ended = _utc_ts()
        conn.execute(
            "UPDATE runs SET ended_utc=?, status=?, summary_json=? WHERE run_id=?",
            (ended, "ok", json.dumps(summary, ensure_ascii=False), run_id),
        )
        conn.commit()
        print(json.dumps(summary, indent=2))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
