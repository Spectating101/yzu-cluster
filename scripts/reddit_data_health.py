#!/usr/bin/env python3
"""
Reddit ingestion health report (non-destructive).

Produces a compact summary of:
  - raw ingest folder coverage
  - SQLite index growth (submissions/comments counts)
  - daily counts (last N days) from SQLite
  - daily signal panel coverage (dates/tickers)

Outputs:
  - data_lake/sentiment/reddit_health.json
  - data_lake/sentiment/reddit_health.md
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_date_str(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _sql_scalar(conn: sqlite3.Connection, q: str, params: Tuple[Any, ...] = ()) -> int:
    cur = conn.execute(q, params)
    row = cur.fetchone()
    return int(row[0] or 0) if row else 0


def _sql_daily_counts(conn: sqlite3.Connection, table: str, *, days: int) -> List[Dict[str, Any]]:
    # created_utc is stored as epoch seconds (float).
    # SQLite: datetime(epoch,'unixepoch') yields UTC; we aggregate by date().
    q = f"""
      SELECT date(datetime(created_utc,'unixepoch')) AS d, COUNT(*) AS n
      FROM {table}
      WHERE created_utc IS NOT NULL
        AND datetime(created_utc,'unixepoch') >= datetime('now','-{int(days)} days')
      GROUP BY d
      ORDER BY d ASC
    """
    cur = conn.execute(q)
    out: List[Dict[str, Any]] = []
    for d, n in cur.fetchall():
        out.append({"date": str(d), "count": int(n)})
    return out


def _raw_coverage(raw_root: Path, *, days: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    now = _utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(int(days)):
        day = now - timedelta(days=int(days) - 1 - i)
        day_str = _as_date_str(day)
        ddir = raw_root / day_str
        posts = ddir / "posts.jsonl"
        comments = ddir / "comments.jsonl"
        out.append(
            {
                "date": day_str,
                "has_posts": bool(posts.exists() and posts.stat().st_size > 0),
                "has_comments": bool(comments.exists() and comments.stat().st_size > 0),
                "posts_bytes": int(posts.stat().st_size) if posts.exists() else 0,
                "comments_bytes": int(comments.stat().st_size) if comments.exists() else 0,
            }
        )
    return out


def _panel_summary(panel_path: Path) -> Dict[str, Any]:
    if not panel_path.exists():
        return {"exists": False}
    try:
        s = pd.read_parquet(panel_path) if panel_path.suffix.lower() in {".parquet", ".pq"} else pd.read_csv(panel_path)
    except Exception as e:
        return {"exists": True, "error": str(e)}
    if "Date" not in s.columns or "Ticker" not in s.columns:
        return {"exists": True, "error": "missing Date/Ticker columns"}
    s["Date"] = pd.to_datetime(s["Date"], errors="coerce")
    s = s.dropna(subset=["Date", "Ticker"]).copy()
    s["Ticker"] = s["Ticker"].astype(str)
    out: Dict[str, Any] = {
        "exists": True,
        "rows": int(len(s)),
        "n_dates": int(s["Date"].nunique()),
        "n_tickers": int(s["Ticker"].nunique()),
        "min_date": str(s["Date"].min().date()) if not s.empty else "",
        "max_date": str(s["Date"].max().date()) if not s.empty else "",
    }
    # Top tickers by mention_posts in the last 7 days (if available).
    if "mention_posts" in s.columns:
        last7 = s[s["Date"] >= (s["Date"].max() - pd.Timedelta(days=7))].copy()
        if not last7.empty:
            last7["mention_posts"] = pd.to_numeric(last7["mention_posts"], errors="coerce").fillna(0.0)
            top = (
                last7.groupby("Ticker")["mention_posts"]
                .sum()
                .sort_values(ascending=False)
                .head(15)
                .reset_index()
                .to_dict(orient="records")
            )
            out["top_mentions_7d"] = [{"ticker": r["Ticker"], "mention_posts": float(r["mention_posts"])} for r in top]
    return out


def _to_md(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Reddit Ingest Health")
    lines.append("")
    lines.append(f"- generated_utc: `{report.get('generated_utc','')}`")
    lines.append(f"- db: `{report.get('db','')}`")
    lines.append(f"- raw_root: `{report.get('raw_root','')}`")
    lines.append(f"- panel: `{report.get('panel_path','')}`")
    lines.append("")
    dbs = report.get("db_stats") or {}
    lines.append("## SQLite counts")
    lines.append(f"- submissions: `{dbs.get('submissions',0)}`")
    lines.append(f"- comments: `{dbs.get('comments',0)}`")
    lines.append("")
    lines.append("## Last 14 days raw coverage")
    for row in report.get("raw_coverage_last14", [])[:14]:
        lines.append(
            f"- {row['date']}: posts={row['has_posts']} comments={row['has_comments']} "
            f"(posts_bytes={row['posts_bytes']}, comments_bytes={row['comments_bytes']})"
        )
    lines.append("")
    lines.append("## Daily counts (SQLite, last 30 days)")
    lines.append("- submissions:")
    for row in report.get("daily_submissions_last30", [])[-30:]:
        lines.append(f"  - {row['date']}: {row['count']}")
    lines.append("- comments:")
    for row in report.get("daily_comments_last30", [])[-30:]:
        lines.append(f"  - {row['date']}: {row['count']}")
    lines.append("")
    lines.append("## Signals panel")
    ps = report.get("panel_summary") or {}
    if not ps.get("exists"):
        lines.append("- panel missing")
        return "\n".join(lines) + "\n"
    if ps.get("error"):
        lines.append(f"- panel error: `{ps['error']}`")
        return "\n".join(lines) + "\n"
    lines.append(f"- rows: `{ps.get('rows')}` dates: `{ps.get('n_dates')}` tickers: `{ps.get('n_tickers')}`")
    lines.append(f"- date range: `{ps.get('min_date')}` .. `{ps.get('max_date')}`")
    if ps.get("top_mentions_7d"):
        lines.append("- top mentions (7d):")
        for r in ps["top_mentions_7d"]:
            lines.append(f"  - {r['ticker']}: {r['mention_posts']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    sr_root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Reddit ingestion health report.")
    ap.add_argument("--db", type=Path, default=sr_root / "data_lake/sentiment/reddit_ingest.sqlite")
    ap.add_argument("--raw-root", type=Path, default=sr_root / "data_lake/sentiment/reddit/raw")
    ap.add_argument("--panel", type=Path, default=sr_root / "data_lake/sentiment/reddit_daily_signals.parquet")
    ap.add_argument("--out-json", type=Path, default=sr_root / "data_lake/sentiment/reddit_health.json")
    ap.add_argument("--out-md", type=Path, default=sr_root / "data_lake/sentiment/reddit_health.md")
    args = ap.parse_args()

    report: Dict[str, Any] = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "db": str(args.db),
        "raw_root": str(args.raw_root),
        "panel_path": str(args.panel),
    }

    if args.db.exists():
        with sqlite3.connect(str(args.db)) as conn:
            report["db_stats"] = {
                "submissions": _sql_scalar(conn, "SELECT COUNT(*) FROM submissions"),
                "comments": _sql_scalar(conn, "SELECT COUNT(*) FROM comments"),
            }
            report["daily_submissions_last30"] = _sql_daily_counts(conn, "submissions", days=30)
            report["daily_comments_last30"] = _sql_daily_counts(conn, "comments", days=30)
    else:
        report["db_stats"] = {"submissions": 0, "comments": 0}
        report["daily_submissions_last30"] = []
        report["daily_comments_last30"] = []

    report["raw_coverage_last14"] = _raw_coverage(Path(args.raw_root), days=14)
    report["panel_summary"] = _panel_summary(Path(args.panel))

    _ensure_parent(args.out_json)
    args.out_json.write_text(json.dumps(report, indent=2) + "\n")
    _ensure_parent(args.out_md)
    args.out_md.write_text(_to_md(report))
    print(json.dumps({"out_json": str(args.out_json), "out_md": str(args.out_md)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
