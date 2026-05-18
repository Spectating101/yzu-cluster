#!/usr/bin/env python3
"""Audit CoinGecko panel freshness and broad-universe coverage."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd


REPO = Path(__file__).resolve().parents[1]
DEFAULT_EXPORTS = REPO / "data_lake/crypto_pipeline/exports"
DEFAULT_DB = REPO / "data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3"
DEFAULT_OUT = REPO / "data_lake/crypto_pipeline/reports/coingecko_coverage_audit.json"


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def panel_stats(path: Path) -> dict:
    header = pd.read_csv(path, nrows=0)
    df = pd.read_csv(path, low_memory=False)
    latest = df.iloc[-1]
    latest_date = str(latest["date"])
    return {
        "file": str(path),
        "rows": int(len(df)),
        "columns": int(len(header.columns) - 1),
        "min_date": str(df["date"].min()),
        "max_date": latest_date,
        "latest_non_null": int(latest.drop(labels=["date"]).notna().sum()),
    }


def archive_stats(db_path: Path, min_daily_rows: int) -> dict:
    with sqlite3.connect(db_path) as conn:
        overall = conn.execute(
            """
            SELECT COUNT(*), COUNT(DISTINCT coin_id),
                   MIN(date(ts_ms / 1000, 'unixepoch')),
                   MAX(date(ts_ms / 1000, 'unixepoch'))
            FROM coin_history
            """
        ).fetchone()
        broad = conn.execute(
            """
            SELECT d, n
            FROM (
                SELECT date(ts_ms / 1000, 'unixepoch') AS d, COUNT(*) AS n
                FROM coin_history
                GROUP BY d
            )
            WHERE n >= ?
            ORDER BY d DESC
            LIMIT 1
            """,
            [int(min_daily_rows)],
        ).fetchone()
    return {
        "rows": int(overall[0]),
        "coins": int(overall[1]),
        "min_date": overall[2],
        "max_date_any": overall[3],
        "latest_broad_date": broad[0] if broad else None,
        "latest_broad_rows": int(broad[1]) if broad else 0,
        "broad_row_threshold": int(min_daily_rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exports", type=Path, default=DEFAULT_EXPORTS)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--max-full-lag-days", type=int, default=2)
    parser.add_argument("--min-full-latest-prices", type=int, default=10_000)
    parser.add_argument("--min-archive-broad-rows", type=int, default=1_000)
    parser.add_argument("--strict", action="store_true", help="Exit nonzero when checks fail.")
    args = parser.parse_args()

    panels = {
        "price_full": panel_stats(args.exports / "price_panel_wide.csv"),
        "price_clean": panel_stats(args.exports / "price_panel_clean.csv"),
        "market_cap": panel_stats(args.exports / "mcap_panel_wide.csv"),
        "volume": panel_stats(args.exports / "volume_panel_wide.csv"),
    }
    archive = archive_stats(args.db, args.min_archive_broad_rows)

    today = _utc_today()
    full_max = datetime.strptime(panels["price_full"]["max_date"], "%Y-%m-%d").date()
    full_lag_days = (today - full_max).days
    failures: list[str] = []
    if full_lag_days > args.max_full_lag_days:
        failures.append(
            f"full price panel lag {full_lag_days}d exceeds {args.max_full_lag_days}d"
        )
    if panels["price_full"]["latest_non_null"] < args.min_full_latest_prices:
        failures.append(
            f"full latest row has {panels['price_full']['latest_non_null']} prices, "
            f"below {args.min_full_latest_prices}"
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "today_utc": str(today),
        "status": "fail" if failures else "pass",
        "failures": failures,
        "archive": archive,
        "panels": panels,
        "checks": {
            "full_lag_days": full_lag_days,
            "max_full_lag_days": int(args.max_full_lag_days),
            "min_full_latest_prices": int(args.min_full_latest_prices),
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if args.strict and failures:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
