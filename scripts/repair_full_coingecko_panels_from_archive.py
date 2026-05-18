#!/usr/bin/env python3
"""Repair full CoinGecko wide panels from the local heavy SQLite archive.

This restores the broad universe for dates covered by the archive. It does not
try to reconstruct dates after the archive max date from public APIs.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd


REPO = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO / "data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3"
DEFAULT_EXPORTS = REPO / "data_lake/crypto_pipeline/exports"


def _read_dates(path: Path) -> pd.Series:
    return pd.read_csv(path, usecols=["date"])["date"].astype(str)


def _archive_max_date(conn: sqlite3.Connection, min_rows: int) -> str:
    row = conn.execute(
        """
        SELECT d
        FROM (
            SELECT date(ts_ms / 1000, 'unixepoch') AS d, COUNT(*) AS n
            FROM coin_history
            GROUP BY d
        )
        WHERE n >= ?
        ORDER BY d DESC
        LIMIT 1
        """,
        [int(min_rows)],
    ).fetchone()
    if not row or not row[0]:
        raise SystemExit("Archive has no coin_history rows.")
    return str(row[0])


def _next_date(date_str: str) -> str:
    return (datetime.strptime(date_str, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()


def _load_archive_slice(conn: sqlite3.Connection, start: str, end: str) -> pd.DataFrame:
    print(f"Loading archive slice {start} -> {end}...", flush=True)
    df = pd.read_sql_query(
        """
        SELECT
            coin_id AS cg_id,
            date(ts_ms / 1000, 'unixepoch') AS date,
            price AS price_usd,
            market_cap AS market_cap_usd,
            total_volume AS volume_usd
        FROM coin_history
        WHERE date(ts_ms / 1000, 'unixepoch') BETWEEN ? AND ?
        ORDER BY date, coin_id
        """,
        conn,
        params=[start, end],
    )
    if df.empty:
        raise SystemExit(f"Archive has no rows for {start} -> {end}.")
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    print(
        f"Archive slice rows={len(df):,} coins={df['cg_id'].nunique():,} "
        f"dates={df['date'].nunique():,}",
        flush=True,
    )
    return df


def _upsert_wide(path: Path, source: pd.DataFrame, value_col: str, dry_run: bool) -> dict:
    print(f"Preparing {path.name} from {value_col}...", flush=True)
    existing = pd.read_csv(path, low_memory=False)
    existing["date"] = pd.to_datetime(existing["date"]).dt.strftime("%Y-%m-%d")
    existing = existing.set_index("date")

    wide = source.pivot_table(index="date", columns="cg_id", values=value_col, aggfunc="last")
    wide = wide.dropna(axis=1, how="all")
    original_rows = len(existing)
    original_cols = len(existing.columns)

    all_cols = existing.columns.union(wide.columns)
    repaired = existing.reindex(columns=all_cols)
    repaired = repaired.reindex(repaired.index.union(wide.index))
    repaired.update(wide.reindex(columns=all_cols))
    repaired = repaired.sort_index()

    changed_window = repaired.loc[wide.index, wide.columns]
    non_null_after = int(changed_window.notna().sum().sum())
    result = {
        "file": str(path),
        "original_rows": int(original_rows),
        "original_columns": int(original_cols),
        "repaired_rows": int(len(repaired)),
        "repaired_columns": int(len(repaired.columns)),
        "archive_dates_upserted": int(wide.shape[0]),
        "archive_columns_upserted": int(wide.shape[1]),
        "non_null_cells_after_in_archive_window": non_null_after,
    }
    if dry_run:
        return result

    out = repaired.copy()
    out.index.name = "date"
    out.to_csv(path)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--exports", type=Path, default=DEFAULT_EXPORTS)
    parser.add_argument("--from-date", default="")
    parser.add_argument("--to-date", default="")
    parser.add_argument(
        "--min-archive-rows",
        type=int,
        default=1000,
        help="When --to-date is omitted, use latest archive date with at least this many rows.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    price_path = args.exports / "price_panel_wide.csv"
    mcap_path = args.exports / "mcap_panel_wide.csv"
    volume_path = args.exports / "volume_panel_wide.csv"
    for path in (price_path, mcap_path, volume_path):
        if not path.exists():
            raise SystemExit(f"Missing required panel: {path}")

    with sqlite3.connect(args.db) as conn:
        archive_end = args.to_date or _archive_max_date(conn, args.min_archive_rows)
        current_full_end = str(_read_dates(price_path).max())
        start = args.from_date or _next_date(current_full_end)
        if start > archive_end:
            print(f"No local archive repair needed: start={start}, archive_end={archive_end}", flush=True)
            return 0
        source = _load_archive_slice(conn, start, archive_end)

    backup_dir = None
    if not args.dry_run:
        backup_dir = (
            args.exports.parent
            / "backups"
            / f"full_panel_archive_repair_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        )
        backup_dir.mkdir(parents=True, exist_ok=True)
        for path in (price_path, mcap_path, volume_path):
            shutil.copy2(path, backup_dir / path.name)
        print(f"Backed up panels to {backup_dir}", flush=True)

    results = [
        _upsert_wide(price_path, source, "price_usd", args.dry_run),
        _upsert_wide(mcap_path, source, "market_cap_usd", args.dry_run),
        _upsert_wide(volume_path, source, "volume_usd", args.dry_run),
    ]

    report = {
        "mode": "dry_run" if args.dry_run else "repair",
        "archive_db": str(args.db),
        "from_date": start,
        "to_date": archive_end,
        "backup_dir": str(backup_dir) if backup_dir else None,
        "results": results,
    }
    report_dir = args.exports.parent / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "full_panel_archive_repair_last_run.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)
    print(f"Report: {report_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
