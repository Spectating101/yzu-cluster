#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def parse_datetime_to_unix(value: str) -> int:
    v = (value or "").strip().lower()
    if v == "now":
        return int(datetime.now(timezone.utc).timestamp())
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def count_chunks(history_from: str, history_to: str, chunk_days: int) -> int:
    start_ts = parse_datetime_to_unix(history_from)
    end_ts = parse_datetime_to_unix(history_to)
    chunk_s = max(1, int(chunk_days)) * 24 * 60 * 60
    chunks = 0
    cur = start_ts
    while cur < end_ts:
        cur = min(cur + chunk_s, end_ts)
        chunks += 1
    return chunks


def fetch_scalar(conn: sqlite3.Connection, query: str) -> int:
    return int(conn.execute(query).fetchone()[0])


def latest_run(conn: sqlite3.Connection) -> tuple[str, str, str | None] | None:
    row = conn.execute(
        "SELECT run_id, started_at, status FROM ingest_runs ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    return str(row[0]), str(row[1]), str(row[2])


def find_process(db_path: Path) -> tuple[int, int, str] | None:
    try:
        out = subprocess.check_output(
            ["ps", "-eo", "pid=,etimes=,cmd="],
            text=True,
        )
    except Exception:
        return None

    needle = f"--db-path {db_path}"
    for raw_line in out.splitlines():
        line = raw_line.strip()
        if "scripts/coingecko_bulk_collect.py" not in line or needle not in line:
            continue
        parts = line.split(None, 2)
        if len(parts) < 3:
            continue
        return int(parts[0]), int(parts[1]), parts[2]
    return None


def fmt_pct(done: int, total: int) -> str:
    if total <= 0:
        return "n/a"
    return f"{(100.0 * done / total):.2f}%"


def fmt_seconds(seconds: float | None) -> str:
    if seconds is None or seconds < 0 or math.isinf(seconds):
        return "n/a"
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h {minutes}m"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def main() -> int:
    ap = argparse.ArgumentParser(description="Summarize CoinGecko archive scrape progress.")
    ap.add_argument("--db-path", type=Path, required=True)
    ap.add_argument("--extra-db", action="append", type=Path, default=[])
    ap.add_argument("--coins-total-override", type=int, default=0)
    ap.add_argument("--history-from", default="2009-01-01T00:00:00+00:00")
    ap.add_argument("--history-to", default="now")
    ap.add_argument("--history-chunk-days", type=int, default=365)
    args = ap.parse_args()

    conn = sqlite3.connect(str(args.db_path))
    run = latest_run(conn)
    total_coins = int(args.coins_total_override) if int(args.coins_total_override) > 0 else fetch_scalar(conn, "SELECT COUNT(*) FROM coins")
    detail_done = fetch_scalar(conn, "SELECT COUNT(*) FROM coin_details")
    history_chunk_done = fetch_scalar(conn, "SELECT COUNT(*) FROM coin_history_ranges")
    history_points = fetch_scalar(conn, "SELECT COUNT(*) FROM coin_history")
    failures = fetch_scalar(conn, "SELECT COUNT(*) FROM failures")
    chunk_count = count_chunks(args.history_from, args.history_to, int(args.history_chunk_days))
    history_chunk_total = total_coins * chunk_count
    history_coin_done = 0
    if chunk_count > 0:
        history_coin_done = fetch_scalar(
            conn,
            f"SELECT COUNT(*) FROM (SELECT coin_id FROM coin_history_ranges GROUP BY coin_id HAVING COUNT(*) >= {chunk_count})",
        )
    conn.close()

    for extra_db in args.extra_db:
        extra_conn = sqlite3.connect(str(extra_db))
        history_chunk_done += fetch_scalar(extra_conn, "SELECT COUNT(*) FROM coin_history_ranges")
        history_points += fetch_scalar(extra_conn, "SELECT COUNT(*) FROM coin_history")
        failures += fetch_scalar(extra_conn, "SELECT COUNT(*) FROM failures")
        if chunk_count > 0:
            history_coin_done += fetch_scalar(
                extra_conn,
                f"SELECT COUNT(*) FROM (SELECT coin_id FROM coin_history_ranges GROUP BY coin_id HAVING COUNT(*) >= {chunk_count})",
            )
        extra_conn.close()

    print(f"db_path={args.db_path}")
    if run:
        print(f"run_id={run[0]}")
        print(f"run_started_at={run[1]}")
        print(f"run_status={run[2]}")
    else:
        print("run_id=n/a")
        print("run_started_at=n/a")
        print("run_status=n/a")

    print(f"coins_total={total_coins}")
    print(f"details_done={detail_done} ({fmt_pct(detail_done, total_coins)})")
    print(
        f"history_chunks_done={history_chunk_done}/{history_chunk_total} ({fmt_pct(history_chunk_done, history_chunk_total)})"
    )
    print(f"history_coins_done={history_coin_done}/{total_coins} ({fmt_pct(history_coin_done, total_coins)})")
    print(f"history_points={history_points}")
    print(f"failures={failures}")

    proc = find_process(args.db_path)
    if proc is None:
        print("process=not_found")
        return 0

    pid, elapsed_s, cmd = proc
    print(f"process_pid={pid}")
    print(f"process_elapsed={fmt_seconds(elapsed_s)}")
    print(f"process_cmd={cmd}")

    if history_chunk_done > 0:
        rate = history_chunk_done / max(elapsed_s, 1)
        remaining = max(history_chunk_total - history_chunk_done, 0)
        eta_s = remaining / rate if rate > 0 else None
        print(f"history_chunk_rate_per_hour={rate * 3600:.2f}")
        print(f"rough_eta={fmt_seconds(eta_s)}")
    else:
        print("history_chunk_rate_per_hour=n/a")
        print("rough_eta=n/a")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
