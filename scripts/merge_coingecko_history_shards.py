#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def ensure_history_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS coin_history (
            coin_id TEXT NOT NULL,
            ts_ms INTEGER NOT NULL,
            price REAL,
            market_cap REAL,
            total_volume REAL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (coin_id, ts_ms)
        );

        CREATE TABLE IF NOT EXISTS coin_history_ranges (
            coin_id TEXT NOT NULL,
            from_ts INTEGER NOT NULL,
            to_ts INTEGER NOT NULL,
            point_count INTEGER NOT NULL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (coin_id, from_ts, to_ts)
        );
        """
    )
    conn.commit()


def merge_one(main_conn: sqlite3.Connection, shard_path: Path, alias: str) -> None:
    main_conn.execute(f"ATTACH DATABASE ? AS {alias}", (str(shard_path),))
    main_conn.execute(
        f"""
        INSERT OR REPLACE INTO coin_history(coin_id, ts_ms, price, market_cap, total_volume, retrieved_at)
        SELECT coin_id, ts_ms, price, market_cap, total_volume, retrieved_at
        FROM {alias}.coin_history
        """
    )
    main_conn.execute(
        f"""
        INSERT OR REPLACE INTO coin_history_ranges(coin_id, from_ts, to_ts, point_count, retrieved_at)
        SELECT coin_id, from_ts, to_ts, point_count, retrieved_at
        FROM {alias}.coin_history_ranges
        """
    )
    main_conn.commit()
    main_conn.execute(f"DETACH DATABASE {alias}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Merge CoinGecko history shard DBs into a main archive DB.")
    ap.add_argument("--main-db", type=Path, required=True)
    ap.add_argument("--shard-db", action="append", type=Path, default=[], help="Repeatable shard DB path.")
    args = ap.parse_args()

    conn = sqlite3.connect(str(args.main_db))
    ensure_history_tables(conn)
    for idx, shard_db in enumerate(args.shard_db):
        print(f"merging\t{shard_db}")
        merge_one(conn, shard_db, f"shard_{idx}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
