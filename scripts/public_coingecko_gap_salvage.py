#!/usr/bin/env python3
"""Slow public CoinGecko gap salvage into a staging SQLite database.

This intentionally does not write production CSV panels while collecting.
Use `promote` only after coverage for a date is high enough.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd


REPO = Path(__file__).resolve().parents[1]
EXPORTS = REPO / "data_lake/crypto_pipeline/exports"
DEFAULT_DB = REPO / "data_lake/crypto_pipeline/staging/coingecko_public_gap_salvage.sqlite3"
DEFAULT_QUEUE = REPO / "data_lake/crypto_pipeline/staging/coingecko_public_gap_queue.csv"
DEFAULT_ARCHIVE = REPO / "data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3"
ENV = REPO / ".env.local"
FREE_BASE = "https://api.coingecko.com/api/v3"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SharpeRenaissance/1.0"
VALID_COIN_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*[a-z0-9]$")


def _load_demo_key() -> str:
    key = os.environ.get("COINGECKO_API_KEY", "")
    if not key and ENV.exists():
        for raw in ENV.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if line.startswith("COINGECKO_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'").strip('"')
    return key


def _request_json(url: str, api_key: str, retries: int = 6) -> Any:
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", UA)
    if api_key:
        # CoinGecko demo/public keys use this header on api.coingecko.com.
        req.add_header("x-cg-demo-api-key", api_key)
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                wait = min(900, 30 * (2**attempt)) + random.uniform(1, 5)
                print(f"    rate limited; sleeping {wait:.1f}s", flush=True)
                time.sleep(wait)
                continue
            if exc.code in {408, 500, 502, 503, 504}:
                wait = min(300, 10 * (attempt + 1)) + random.uniform(1, 5)
                print(f"    transient HTTP {exc.code}; sleeping {wait:.1f}s", flush=True)
                time.sleep(wait)
                continue
            raise
        except (TimeoutError, urllib.error.URLError, OSError):
            if attempt >= retries:
                raise
            wait = min(300, 10 * (attempt + 1)) + random.uniform(1, 5)
            print(f"    network error; sleeping {wait:.1f}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"failed after retries: {url}")


def _date_to_ts(d: date, end: bool = False) -> int:
    dt = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    if end:
        dt = dt + timedelta(days=1) - timedelta(seconds=1)
    return int(dt.timestamp())


def _points_to_daily(points: list) -> dict[str, float]:
    out: dict[str, float] = {}
    for ts_ms, value in points or []:
        d = datetime.fromtimestamp(int(ts_ms) / 1000, tz=timezone.utc).date().isoformat()
        out[d] = float(value) if value is not None else None
    return {k: v for k, v in out.items() if v is not None}


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS queue (
            coin_id TEXT PRIMARY KEY,
            priority INTEGER NOT NULL DEFAULT 999999,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS prices (
            coin_id TEXT NOT NULL,
            date TEXT NOT NULL,
            price REAL,
            market_cap REAL,
            total_volume REAL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (coin_id, date)
        );
        CREATE TABLE IF NOT EXISTS runs (
            started_at TEXT PRIMARY KEY,
            mode TEXT NOT NULL,
            from_date TEXT,
            to_date TEXT,
            notes TEXT
        );
        """
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(queue)").fetchall()}
    if "priority" not in cols:
        conn.execute("ALTER TABLE queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 999999")
    return conn


def init_queue(args: argparse.Namespace) -> int:
    header = pd.read_csv(args.panel, nrows=0)
    panel_coins = [c for c in header.columns if c != "date" and VALID_COIN_ID.match(str(c))]
    ordered: list[str] = []
    if args.archive_db.exists():
        with sqlite3.connect(args.archive_db) as archive:
            rows = archive.execute(
                """
                WITH latest AS (SELECT MAX(retrieved_at) AS mx FROM coin_markets)
                SELECT coin_id
                FROM coin_markets, latest
                WHERE retrieved_at = latest.mx
                ORDER BY market_cap_rank IS NULL, market_cap_rank, coin_id
                """
            ).fetchall()
        ordered = [r[0] for r in rows if r[0] in set(panel_coins)]
    seen = set(ordered)
    ordered.extend([c for c in panel_coins if c not in seen])
    coins = ordered
    if args.limit:
        coins = coins[: int(args.limit)]
    conn = _connect(args.db)
    with conn:
        conn.executemany(
            """
            INSERT INTO queue(coin_id, priority, status, updated_at)
            VALUES (?, ?, 'pending', ?)
            ON CONFLICT(coin_id) DO UPDATE SET
                priority=MIN(queue.priority, excluded.priority),
                updated_at=excluded.updated_at
            """,
            [(c, i, datetime.now(timezone.utc).isoformat()) for i, c in enumerate(coins, 1)],
        )
    counts = conn.execute("SELECT status, COUNT(*) FROM queue GROUP BY status").fetchall()
    print(
        json.dumps(
            {
                "queued_from": str(args.panel),
                "archive_order_source": str(args.archive_db),
                "valid_panel_coins": len(panel_coins),
                "coins_queued_this_run": len(coins),
                "queue_counts": counts,
            },
            indent=2,
        )
    )
    return 0


def collect(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    api_key = "" if args.ignore_api_key else _load_demo_key()
    start = datetime.strptime(args.from_date, "%Y-%m-%d").date()
    end = datetime.strptime(args.to_date, "%Y-%m-%d").date()
    from_ts = _date_to_ts(start)
    to_ts = _date_to_ts(end, end=True)
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO runs(started_at, mode, from_date, to_date, notes) VALUES (?, ?, ?, ?, ?)",
            [now, "collect", str(start), str(end), "public slow salvage"],
        )

    processed = 0
    deadline = time.monotonic() + args.max_runtime_minutes * 60 if args.max_runtime_minutes else None
    while True:
        if deadline and time.monotonic() >= deadline:
            print("Reached max runtime; stopping cleanly.", flush=True)
            break
        row = conn.execute(
            """
            SELECT coin_id FROM queue
            WHERE status IN ('pending', 'error')
              AND attempts < ?
            ORDER BY
              CASE status WHEN 'pending' THEN 0 ELSE 1 END,
              attempts ASC,
              priority ASC,
              coin_id
            LIMIT 1
            """,
            [int(args.max_attempts)],
        ).fetchone()
        if not row:
            print("Queue exhausted.", flush=True)
            break
        coin = row[0]
        processed += 1
        print(f"[{processed}] fetching {coin}", flush=True)
        url = (
            f"{FREE_BASE}/coins/{urllib.parse.quote(coin)}/market_chart/range"
            f"?vs_currency=usd&from={from_ts}&to={to_ts}&interval=daily"
        )
        try:
            data = _request_json(url, api_key)
            prices = _points_to_daily(data.get("prices", []))
            mcaps = _points_to_daily(data.get("market_caps", []))
            vols = _points_to_daily(data.get("total_volumes", []))
            dates = sorted(set(prices) | set(mcaps) | set(vols))
            retrieved_at = datetime.now(timezone.utc).isoformat()
            with conn:
                conn.executemany(
                    """
                    INSERT INTO prices(coin_id, date, price, market_cap, total_volume, retrieved_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(coin_id, date) DO UPDATE SET
                        price=excluded.price,
                        market_cap=excluded.market_cap,
                        total_volume=excluded.total_volume,
                        retrieved_at=excluded.retrieved_at
                    """,
                    [
                        (coin, d, prices.get(d), mcaps.get(d), vols.get(d), retrieved_at)
                        for d in dates
                    ],
                )
                status = "done" if dates else "empty"
                conn.execute(
                    """
                    UPDATE queue SET status=?, attempts=attempts+1, last_error=NULL, updated_at=?
                    WHERE coin_id=?
                    """,
                    [status, retrieved_at, coin],
                )
            print(f"    stored {len(dates)} days", flush=True)
        except Exception as exc:
            msg = str(exc)[:1000]
            with conn:
                conn.execute(
                    """
                    UPDATE queue SET status='error', attempts=attempts+1, last_error=?, updated_at=?
                    WHERE coin_id=?
                    """,
                    [msg, datetime.now(timezone.utc).isoformat(), coin],
                )
            print(f"    error: {msg}", flush=True)
        time.sleep(max(0.0, float(args.sleep_seconds)))
    return 0


def status(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    queue = conn.execute("SELECT status, COUNT(*) FROM queue GROUP BY status ORDER BY status").fetchall()
    coverage = conn.execute(
        """
        SELECT date, COUNT(*) AS rows, COUNT(price) AS prices, COUNT(market_cap) AS market_caps,
               COUNT(total_volume) AS volumes
        FROM prices
        GROUP BY date
        ORDER BY date
        """
    ).fetchall()
    print(json.dumps({"queue": queue, "coverage": coverage}, indent=2))
    return 0


def _upsert_panel(path: Path, staging: pd.DataFrame, value_col: str, min_rows: int) -> dict:
    panel = pd.read_csv(path, low_memory=False)
    panel["date"] = panel["date"].astype(str)
    panel = panel.set_index("date")
    wide = staging.pivot_table(index="date", columns="coin_id", values=value_col, aggfunc="last")
    keep_dates = [d for d, n in wide.notna().sum(axis=1).items() if int(n) >= min_rows]
    wide = wide.loc[keep_dates]
    all_cols = panel.columns.union(wide.columns)
    out = panel.reindex(index=panel.index.union(wide.index), columns=all_cols).sort_index()
    out.update(wide.reindex(columns=all_cols))
    out.index.name = "date"
    out.to_csv(path)
    return {"file": str(path), "promoted_dates": keep_dates, "columns": int(len(out.columns))}


def promote(args: argparse.Namespace) -> int:
    conn = _connect(args.db)
    staging = pd.read_sql_query("SELECT coin_id, date, price, market_cap, total_volume FROM prices", conn)
    if staging.empty:
        raise SystemExit("No staging data to promote.")
    coverage = staging.groupby("date")["price"].count()
    good_dates = sorted([d for d, n in coverage.items() if int(n) >= args.min_prices_per_date])
    if not good_dates:
        raise SystemExit(f"No dates meet min coverage {args.min_prices_per_date}.")
    staging = staging[staging["date"].isin(good_dates)]
    backup_dir = EXPORTS.parent / "backups" / f"public_gap_promote_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    targets = [
        (EXPORTS / "price_panel_wide.csv", "price"),
        (EXPORTS / "mcap_panel_wide.csv", "market_cap"),
        (EXPORTS / "volume_panel_wide.csv", "total_volume"),
    ]
    for path, _ in targets:
        shutil.copy2(path, backup_dir / path.name)
    results = [_upsert_panel(path, staging, col, args.min_prices_per_date) for path, col in targets]
    report = {"backup_dir": str(backup_dir), "min_prices_per_date": args.min_prices_per_date, "results": results}
    report_path = EXPORTS.parent / "reports/public_gap_promote_last_run.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("init-queue")
    q.add_argument("--panel", type=Path, default=EXPORTS / "price_panel_wide.csv")
    q.add_argument("--archive-db", type=Path, default=DEFAULT_ARCHIVE)
    q.add_argument("--limit", type=int, default=0)
    q.set_defaults(func=init_queue)

    c = sub.add_parser("collect")
    c.add_argument("--from-date", required=True)
    c.add_argument("--to-date", required=True)
    c.add_argument("--sleep-seconds", type=float, default=5.0)
    c.add_argument("--max-runtime-minutes", type=float, default=0.0)
    c.add_argument("--max-attempts", type=int, default=5)
    c.add_argument("--ignore-api-key", action="store_true", help="Use unauthenticated public API even if .env.local has a key.")
    c.set_defaults(func=collect)

    s = sub.add_parser("status")
    s.set_defaults(func=status)

    pr = sub.add_parser("promote")
    pr.add_argument("--min-prices-per-date", type=int, default=10_000)
    pr.set_defaults(func=promote)
    return p


def main() -> int:
    args = parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
