#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Split active CoinGecko IDs from a SQLite archive into shard files.")
    ap.add_argument("--db-path", type=Path, required=True)
    ap.add_argument("--num-shards", type=int, default=4)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--history-chunk-count", type=int, default=0, help="Exclude coins already having at least this many history ranges.")
    args = ap.parse_args()

    conn = sqlite3.connect(str(args.db_path))
    if int(args.history_chunk_count) > 0:
        rows = conn.execute(
            """
            SELECT id
            FROM coins
            WHERE id NOT IN (
              SELECT coin_id
              FROM coin_history_ranges
              GROUP BY coin_id
              HAVING COUNT(*) >= ?
            )
            ORDER BY id
            """,
            (int(args.history_chunk_count),),
        ).fetchall()
    else:
        rows = conn.execute("SELECT id FROM coins ORDER BY id").fetchall()
    conn.close()

    coin_ids = [str(row[0]) for row in rows if row and row[0]]
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for shard_idx in range(int(args.num_shards)):
        shard_ids = coin_ids[shard_idx :: int(args.num_shards)]
        out_path = args.output_dir / f"coingecko_active_ids_shard_{shard_idx:02d}.txt"
        out_path.write_text("".join(f"{coin_id}\n" for coin_id in shard_ids), encoding="utf-8")
        print(f"{out_path}\t{len(shard_ids)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
