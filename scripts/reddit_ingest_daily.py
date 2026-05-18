#!/usr/bin/env python3
"""
Idempotent daily Reddit ingestion pipeline (raw JSONL + SQLite index + daily signals panel).

Goals:
  - Store raw posts/comments in date-stamped folders (non-destructive history).
  - Deduplicate across runs using a local SQLite index.
  - Optionally append/merge into `reddit_daily_signals.parquet` for backtests.

This uses Reddit's public JSON endpoints (no OAuth) and therefore supports *recent* history
unless you run it regularly and accumulate.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

import requests


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_ts(dt: Optional[datetime] = None) -> float:
    return float((dt or _utc_now()).timestamp())


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _iter_jsonl(path: Path) -> Iterator[Dict[str, Any]]:
    if not path.exists():
        return
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


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY,
          created_utc REAL,
          subreddit TEXT,
          author TEXT,
          title TEXT,
          selftext TEXT,
          score INTEGER,
          ups INTEGER,
          upvote_ratio REAL,
          num_comments INTEGER,
          permalink TEXT,
          url TEXT,
          first_seen_utc REAL,
          last_seen_utc REAL,
          last_fetched_utc REAL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_utc);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_submissions_subreddit ON submissions(subreddit);")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          created_utc REAL,
          subreddit TEXT,
          author TEXT,
          link_id TEXT,
          parent_id TEXT,
          post_id TEXT,
          score INTEGER,
          body TEXT,
          permalink TEXT,
          first_seen_utc REAL,
          last_fetched_utc REAL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_utc);")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS threads (
          post_id TEXT PRIMARY KEY,
          last_fetched_utc REAL,
          n_comments_last INTEGER
        )
        """
    )

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


def _db_has(conn: sqlite3.Connection, table: str, row_id: str) -> bool:
    cur = conn.execute(f"SELECT 1 FROM {table} WHERE id=? LIMIT 1", (row_id,))
    return cur.fetchone() is not None


def _upsert_submission(conn: sqlite3.Connection, rec: Dict[str, Any], fetched_utc: float) -> None:
    conn.execute(
        """
        INSERT INTO submissions(
          id, created_utc, subreddit, author, title, selftext,
          score, ups, upvote_ratio, num_comments, permalink, url,
          first_seen_utc, last_seen_utc, last_fetched_utc
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          created_utc=COALESCE(excluded.created_utc, submissions.created_utc),
          subreddit=COALESCE(excluded.subreddit, submissions.subreddit),
          author=COALESCE(excluded.author, submissions.author),
          title=COALESCE(excluded.title, submissions.title),
          selftext=COALESCE(excluded.selftext, submissions.selftext),
          score=COALESCE(excluded.score, submissions.score),
          ups=COALESCE(excluded.ups, submissions.ups),
          upvote_ratio=COALESCE(excluded.upvote_ratio, submissions.upvote_ratio),
          num_comments=COALESCE(excluded.num_comments, submissions.num_comments),
          permalink=COALESCE(excluded.permalink, submissions.permalink),
          url=COALESCE(excluded.url, submissions.url),
          last_seen_utc=?,
          last_fetched_utc=?
        """,
        (
            rec.get("id"),
            rec.get("created_utc"),
            rec.get("subreddit"),
            rec.get("author"),
            rec.get("title"),
            rec.get("selftext"),
            rec.get("score"),
            rec.get("ups"),
            rec.get("upvote_ratio"),
            rec.get("num_comments"),
            rec.get("permalink"),
            rec.get("url"),
            fetched_utc,
            fetched_utc,
            fetched_utc,
            fetched_utc,
            fetched_utc,
        ),
    )


def _upsert_comment(conn: sqlite3.Connection, rec: Dict[str, Any], fetched_utc: float) -> None:
    conn.execute(
        """
        INSERT INTO comments(
          id, created_utc, subreddit, author, link_id, parent_id, post_id,
          score, body, permalink, first_seen_utc, last_fetched_utc
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          created_utc=COALESCE(excluded.created_utc, comments.created_utc),
          subreddit=COALESCE(excluded.subreddit, comments.subreddit),
          author=COALESCE(excluded.author, comments.author),
          link_id=COALESCE(excluded.link_id, comments.link_id),
          parent_id=COALESCE(excluded.parent_id, comments.parent_id),
          post_id=COALESCE(excluded.post_id, comments.post_id),
          score=COALESCE(excluded.score, comments.score),
          body=COALESCE(excluded.body, comments.body),
          permalink=COALESCE(excluded.permalink, comments.permalink),
          last_fetched_utc=?
        """,
        (
            rec.get("id"),
            rec.get("created_utc"),
            rec.get("subreddit"),
            rec.get("author"),
            rec.get("link_id"),
            rec.get("parent_id"),
            rec.get("post_id"),
            rec.get("score"),
            rec.get("body"),
            rec.get("permalink"),
            fetched_utc,
            fetched_utc,
            fetched_utc,
        ),
    )


def _thread_url(post: Dict[str, Any]) -> Optional[str]:
    permalink = (post.get("permalink") or "").strip()
    if permalink:
        if permalink.startswith("http"):
            url = permalink
        else:
            url = f"https://www.reddit.com{permalink}"
        if not url.rstrip("/").endswith(".json"):
            url = url.rstrip("/") + ".json"
        return url
    pid = (post.get("id") or "").strip()
    if pid:
        return f"https://www.reddit.com/comments/{pid}.json"
    return None


def _flatten_comment_tree(node: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
    kind = node.get("kind")
    data = node.get("data") or {}
    if kind == "Listing":
        for ch in (data.get("children") or []):
            if isinstance(ch, dict):
                yield from _flatten_comment_tree(ch)
        return
    if kind == "t1":
        yield node
        replies = data.get("replies")
        if isinstance(replies, dict):
            yield from _flatten_comment_tree(replies)
        return


def _fetch_json(session: requests.Session, url: str, *, params: Dict[str, Any], user_agent: str, timeout_s: int) -> Optional[Any]:
    try:
        r = session.get(
            url,
            params=params,
            headers={"User-Agent": user_agent, "Accept": "application/json"},
            timeout=int(timeout_s),
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def _iter_listing(
    session: requests.Session,
    *,
    subreddit: str,
    sort: str,
    time_filter: str,
    limit: int,
    max_pages: int,
    sleep_secs: float,
    user_agent: str,
    timeout_s: int,
    stop_after_known: int,
    conn: sqlite3.Connection,
) -> Iterator[Dict[str, Any]]:
    after: Optional[str] = None
    known_hits = 0
    sort = sort.strip().lower()
    if sort not in {"new", "top", "hot", "rising"}:
        sort = "new"

    for _ in range(int(max_pages)):
        url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
        params: Dict[str, Any] = {"limit": int(min(100, max(1, limit)))}
        if sort == "top" and time_filter:
            params["t"] = time_filter
        if after:
            params["after"] = after

        payload = _fetch_json(session, url, params=params, user_agent=user_agent, timeout_s=timeout_s)
        if not payload or not isinstance(payload, dict):
            break
        listing = (payload.get("data") or {}) if isinstance(payload.get("data"), dict) else {}
        children = listing.get("children") or []
        if not children:
            break

        for ch in children:
            d = (ch or {}).get("data") or {}
            pid = d.get("id") or d.get("name") or ""
            if pid and _db_has(conn, "submissions", str(pid)):
                known_hits += 1
                if stop_after_known > 0 and known_hits >= int(stop_after_known):
                    return
                continue
            if d:
                yield d

        after = listing.get("after")
        if not after:
            break
        time.sleep(float(max(0.0, sleep_secs)))


def _select_posts_for_comments(
    conn: sqlite3.Connection,
    *,
    lookback_hours: float,
    max_posts: int,
    min_refetch_hours: float,
) -> List[Dict[str, Any]]:
    cutoff = _utc_ts(_utc_now() - timedelta(hours=float(max(0.0, lookback_hours))))
    cur = conn.execute(
        """
        SELECT s.id, s.subreddit, s.permalink, s.num_comments, s.score, t.last_fetched_utc
        FROM submissions s
        LEFT JOIN threads t ON t.post_id = s.id
        WHERE s.created_utc IS NOT NULL AND s.created_utc >= ?
        ORDER BY COALESCE(s.num_comments,0) DESC, COALESCE(s.score,0) DESC
        LIMIT ?
        """,
        (cutoff, int(max_posts) * 3),
    )
    out: List[Dict[str, Any]] = []
    now = _utc_ts()
    for row in cur.fetchall():
        pid, subreddit, permalink, num_comments, score, last_fetched = row
        if last_fetched is not None and float(now - float(last_fetched)) < float(min_refetch_hours) * 3600.0:
            continue
        out.append(
            {
                "id": pid,
                "subreddit": subreddit,
                "permalink": permalink,
                "num_comments": num_comments,
                "score": score,
            }
        )
        if len(out) >= int(max_posts):
            break
    return out


def _write_jsonl(path: Path, recs: Iterable[Dict[str, Any]]) -> int:
    _ensure_parent(path)
    n = 0
    with path.open("a", encoding="utf-8") as f:
        for rec in recs:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
    return n


def main() -> int:
    sr_root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Idempotent daily Reddit ingestion (raw + sqlite + panel).")
    ap.add_argument("--subreddits", nargs="+", default=["wallstreetbets", "stocks", "investing", "options"])
    ap.add_argument("--sort", default="new", choices=["new", "top", "hot", "rising"])
    ap.add_argument("--time-filter", default="day", choices=["hour", "day", "week", "month", "year", "all"])
    ap.add_argument(
        "--fetch-modes",
        nargs="*",
        default=[],
        help='Optional list of modes like "new" "hot" "top:day" "top:week". If provided, overrides --sort/--time-filter.',
    )
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--max-pages", type=int, default=10)
    ap.add_argument("--sleep-secs", type=float, default=1.2)
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--stop-after-known", type=int, default=40, help="Early stop after N already-indexed posts per subreddit (0=never).")
    ap.add_argument("--user-agent", default="SharpeRenaissanceResearchBot/0.2 (contact: local)")

    ap.add_argument("--db", type=Path, default=sr_root / "data_lake/sentiment/reddit_ingest.sqlite")
    ap.add_argument("--raw-root", type=Path, default=sr_root / "data_lake/sentiment/reddit/raw")
    ap.add_argument("--date", default="", help="UTC date YYYY-MM-DD (default: today).")

    ap.add_argument("--no-comments", action="store_true")
    ap.add_argument("--comments-lookback-hours", type=float, default=24.0)
    ap.add_argument("--comments-max-posts", type=int, default=50)
    ap.add_argument("--comments-min-refetch-hours", type=float, default=24.0)

    ap.add_argument("--tickers-file", type=Path, default=sr_root / "config/tickers_reddit_nasdaq100_plus_spy.txt")
    ap.add_argument("--panel-out", type=Path, default=sr_root / "data_lake/sentiment/reddit_daily_signals.parquet")
    ap.add_argument("--no-panel", action="store_true")
    ap.add_argument("--lookback-days", type=int, default=30)
    ap.add_argument("--min-upvotes", type=int, default=0)
    args = ap.parse_args()

    started = _utc_ts()
    run_id = f"reddit_ingest_{int(started)}"

    day = args.date.strip()
    if day:
        run_date = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        run_date = _utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    day_str = run_date.strftime("%Y-%m-%d")

    raw_dir = Path(args.raw_root) / day_str
    posts_path = raw_dir / "posts.jsonl"
    comments_path = raw_dir / "comments.jsonl"
    _ensure_parent(posts_path)
    _ensure_parent(comments_path)

    _ensure_parent(args.db)
    with sqlite3.connect(str(args.db)) as conn:
        _init_db(conn)
        conn.execute(
            "INSERT OR REPLACE INTO runs(run_id, started_utc, status, params_json) VALUES(?,?,?,?)",
            (run_id, started, "running", json.dumps(vars(args), default=str)),
        )
        conn.commit()

        fetched_utc = _utc_ts()
        n_new_posts = 0
        n_new_comments = 0
        n_threads_ok = 0

        new_post_recs: List[Dict[str, Any]] = []
        modes: List[Tuple[str, str]] = []
        if args.fetch_modes:
            for raw in args.fetch_modes:
                token = str(raw).strip().lower()
                if not token:
                    continue
                if token.startswith("top:"):
                    tf = token.split(":", 1)[1].strip() or "day"
                    modes.append(("top", tf))
                else:
                    modes.append((token, "day"))
        else:
            modes.append((str(args.sort), str(args.time_filter)))

        with requests.Session() as sess:
            for sub in args.subreddits:
                for sort, tf in modes:
                    for d in _iter_listing(
                        sess,
                        subreddit=str(sub),
                        sort=str(sort),
                        time_filter=str(tf),
                        limit=int(args.limit),
                        max_pages=int(args.max_pages),
                        sleep_secs=float(args.sleep_secs),
                        user_agent=str(args.user_agent),
                        timeout_s=int(args.timeout),
                        stop_after_known=int(args.stop_after_known),
                        conn=conn,
                    ):
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
                        pid = (rec.get("id") or "").strip()
                        if not pid:
                            continue
                        if _db_has(conn, "submissions", pid):
                            continue
                        _upsert_submission(conn, rec, fetched_utc)
                        new_post_recs.append(rec)
                        n_new_posts += 1

                conn.commit()

            if new_post_recs:
                _write_jsonl(posts_path, new_post_recs)

            if not args.no_comments:
                posts_for_comments = _select_posts_for_comments(
                    conn,
                    lookback_hours=float(args.comments_lookback_hours),
                    max_posts=int(args.comments_max_posts),
                    min_refetch_hours=float(args.comments_min_refetch_hours),
                )
                for post in posts_for_comments:
                    url = _thread_url(post)
                    if not url:
                        continue
                    payload = _fetch_json(
                        sess,
                        url,
                        params={"limit": 500, "sort": "new"},
                        user_agent=str(args.user_agent),
                        timeout_s=int(args.timeout),
                    )
                    if not payload or not isinstance(payload, list) or len(payload) < 2:
                        time.sleep(float(max(0.0, args.sleep_secs)))
                        continue
                    comments_listing = payload[1] if isinstance(payload[1], dict) else None
                    if not comments_listing:
                        time.sleep(float(max(0.0, args.sleep_secs)))
                        continue
                    n_threads_ok += 1

                    post_id = str(post.get("id") or "")
                    subreddit = str(post.get("subreddit") or "")
                    new_comment_recs: List[Dict[str, Any]] = []
                    for node in _flatten_comment_tree(comments_listing):
                        d = node.get("data") or {}
                        body = d.get("body")
                        if not isinstance(body, str) or not body.strip():
                            continue
                        if body.strip() in {"[removed]", "[deleted]"}:
                            continue
                        cid = (d.get("id") or d.get("name") or "").strip()
                        if not cid:
                            continue
                        if _db_has(conn, "comments", cid):
                            continue
                        rec = {
                            "created_utc": d.get("created_utc"),
                            "subreddit": subreddit or d.get("subreddit"),
                            "author": d.get("author"),
                            "link_id": d.get("link_id"),
                            "parent_id": d.get("parent_id"),
                            "post_id": post_id,
                            "id": cid,
                            "score": d.get("score"),
                            "body": body,
                            "permalink": d.get("permalink"),
                        }
                        _upsert_comment(conn, rec, fetched_utc)
                        new_comment_recs.append(rec)
                        n_new_comments += 1

                    if new_comment_recs:
                        _write_jsonl(comments_path, new_comment_recs)

                    conn.execute(
                        "INSERT OR REPLACE INTO threads(post_id, last_fetched_utc, n_comments_last) VALUES(?,?,?)",
                        (post_id, fetched_utc, int(len(new_comment_recs))),
                    )
                    conn.commit()
                    time.sleep(float(max(0.0, args.sleep_secs)))

        # Optional: build/append panel for this day only (fast + idempotent via Date/Ticker merge).
        panel_status: Dict[str, Any] = {"ran": False}
        if not args.no_panel:
            tickers_file = Path(args.tickers_file)
            if not tickers_file.exists():
                raise SystemExit(f"tickers file not found: {tickers_file}")
            from subprocess import run

            in_args = [str(posts_path)]
            if comments_path.exists() and comments_path.stat().st_size > 0:
                in_args.append(str(comments_path))
            daily_signals_script = sr_root / "scripts/reddit_daily_signals.py"
            cmd = [
                "python3",
                str(daily_signals_script),
                "--in-jsonl",
                *in_args,
                "--tickers-file",
                str(tickers_file),
                "--out",
                str(args.panel_out),
                "--append",
                "--lookback-days",
                str(int(args.lookback_days)),
                "--min-upvotes",
                str(int(args.min_upvotes)),
            ]
            r = run(cmd, capture_output=True, text=True)
            panel_status = {"ran": True, "returncode": r.returncode, "stdout": r.stdout[-2000:], "stderr": r.stderr[-2000:]}

        summary = {
            "run_id": run_id,
            "date": day_str,
            "db": str(args.db),
            "raw_dir": str(raw_dir),
            "posts_jsonl": str(posts_path),
            "comments_jsonl": str(comments_path),
            "n_new_posts": n_new_posts,
            "n_new_comments": n_new_comments,
            "n_threads_ok": n_threads_ok,
            "panel": panel_status,
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
