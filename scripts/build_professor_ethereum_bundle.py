#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class ProfessorRow:
    coin_id: str
    symbol: str
    name: str
    beg_date: str
    beg_year: int
    beg_month: int
    beg_day: int
    ethereum: int

    @property
    def beg_ts_ms(self) -> int:
        dt = datetime(self.beg_year, self.beg_month, self.beg_day, tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)


def load_professor_rows(path: Path) -> list[ProfessorRow]:
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        rows = []
        for row in csv.DictReader(f, delimiter="\t"):
            coin_id = str(row.get("coingecko_id") or "").strip()
            if not coin_id:
                continue
            rows.append(
                ProfessorRow(
                    coin_id=coin_id,
                    symbol=str(row.get("symbol") or "").strip(),
                    name=str(row.get("name") or "").strip(),
                    beg_date=str(row.get("Beg_Date") or "").strip(),
                    beg_year=int(row.get("Beg_Year") or 0),
                    beg_month=int(row.get("Beg_Month") or 0),
                    beg_day=int(row.get("Beg_Day") or 0),
                    ethereum=int(row.get("Ethereum") or 0),
                )
            )
    return rows


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS coin_catalog (
            coin_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            beg_date TEXT NOT NULL,
            beg_year INTEGER NOT NULL,
            beg_month INTEGER NOT NULL,
            beg_day INTEGER NOT NULL,
            beg_ts_ms INTEGER NOT NULL,
            ethereum INTEGER NOT NULL,
            detail_available INTEGER NOT NULL,
            detail_source TEXT NOT NULL,
            history_source TEXT NOT NULL,
            asset_platform_id TEXT,
            hashing_algorithm TEXT,
            categories_json TEXT NOT NULL,
            links_json TEXT NOT NULL,
            image_json TEXT NOT NULL,
            platforms_json TEXT NOT NULL,
            raw_json TEXT,
            retrieved_at TEXT,
            note TEXT
        );

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

        CREATE TABLE IF NOT EXISTS coverage_summary (
            coin_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            beg_date TEXT NOT NULL,
            detail_available INTEGER NOT NULL,
            detail_source TEXT NOT NULL,
            history_source TEXT NOT NULL,
            history_rows INTEGER NOT NULL,
            history_range_count INTEGER NOT NULL,
            first_ts_ms INTEGER,
            last_ts_ms INTEGER,
            rows_on_or_after_beg_date INTEGER NOT NULL,
            first_ts_on_or_after_beg_ms INTEGER,
            note TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_coin_history_coin_id ON coin_history(coin_id);
        CREATE INDEX IF NOT EXISTS idx_coin_history_ranges_coin_id ON coin_history_ranges(coin_id);
        """
    )
    conn.commit()


def fetch_coin_id_set(conn: sqlite3.Connection, query: str) -> set[str]:
    return {str(row[0]) for row in conn.execute(query)}


def detail_payload(detail_row: sqlite3.Row | None) -> dict[str, object]:
    if detail_row is None:
        return {
            "asset_platform_id": None,
            "hashing_algorithm": None,
            "categories_json": "[]",
            "links_json": "{}",
            "image_json": "{}",
            "platforms_json": "{}",
            "raw_json": None,
            "retrieved_at": None,
        }
    return {
        "asset_platform_id": detail_row["asset_platform_id"],
        "hashing_algorithm": detail_row["hashing_algorithm"],
        "categories_json": detail_row["categories_json"],
        "links_json": detail_row["links_json"],
        "image_json": detail_row["image_json"],
        "platforms_json": detail_row["platforms_json"],
        "raw_json": detail_row["raw_json"],
        "retrieved_at": detail_row["retrieved_at"],
    }


def populate_catalog(
    out_conn: sqlite3.Connection,
    professor_rows: list[ProfessorRow],
    main_conn: sqlite3.Connection,
    side_conn: sqlite3.Connection,
) -> None:
    main_conn.row_factory = sqlite3.Row
    side_conn.row_factory = sqlite3.Row
    main_details = fetch_coin_id_set(main_conn, "SELECT coin_id FROM coin_details")
    side_details = fetch_coin_id_set(side_conn, "SELECT coin_id FROM coin_details")
    main_history = fetch_coin_id_set(main_conn, "SELECT DISTINCT coin_id FROM coin_history_ranges")
    side_history = fetch_coin_id_set(side_conn, "SELECT DISTINCT coin_id FROM coin_history_ranges")

    payload = []
    for row in professor_rows:
        detail_row = None
        detail_source = "professor_file_only"
        note = None
        if row.coin_id in main_details:
            detail_row = main_conn.execute("SELECT * FROM coin_details WHERE coin_id = ?", (row.coin_id,)).fetchone()
            detail_source = "active_archive"
        elif row.coin_id in side_details:
            detail_row = side_conn.execute("SELECT * FROM coin_details WHERE coin_id = ?", (row.coin_id,)).fetchone()
            detail_source = "professor_sidecar"
        else:
            note = "CoinGecko detail endpoint unavailable during archive build; professor-file metadata preserved."

        has_main_history = row.coin_id in main_history
        has_side_history = row.coin_id in side_history
        if has_main_history and has_side_history:
            history_source = "active_archive+professor_sidecar"
        elif has_main_history:
            history_source = "active_archive"
        elif has_side_history:
            history_source = "professor_sidecar"
        else:
            history_source = "missing"

        d = detail_payload(detail_row)
        payload.append(
            (
                row.coin_id,
                row.symbol,
                row.name,
                row.beg_date,
                row.beg_year,
                row.beg_month,
                row.beg_day,
                row.beg_ts_ms,
                row.ethereum,
                1 if detail_row is not None else 0,
                detail_source,
                history_source,
                d["asset_platform_id"],
                d["hashing_algorithm"],
                d["categories_json"],
                d["links_json"],
                d["image_json"],
                d["platforms_json"],
                d["raw_json"],
                d["retrieved_at"],
                note,
            )
        )

    out_conn.executemany(
        """
        INSERT OR REPLACE INTO coin_catalog(
            coin_id, symbol, name, beg_date, beg_year, beg_month, beg_day, beg_ts_ms, ethereum,
            detail_available, detail_source, history_source, asset_platform_id, hashing_algorithm,
            categories_json, links_json, image_json, platforms_json, raw_json, retrieved_at, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        payload,
    )
    out_conn.commit()


def copy_history(out_conn: sqlite3.Connection, professor_rows: list[ProfessorRow], main_db: Path, side_db: Path) -> None:
    ids = [(row.coin_id,) for row in professor_rows]
    out_conn.execute("CREATE TEMP TABLE professor_ids(coin_id TEXT PRIMARY KEY)")
    out_conn.executemany("INSERT OR IGNORE INTO professor_ids(coin_id) VALUES (?)", ids)
    out_conn.execute("ATTACH DATABASE ? AS main_src", (str(main_db),))
    out_conn.execute("ATTACH DATABASE ? AS side_src", (str(side_db),))

    for src in ["main_src", "side_src"]:
        out_conn.execute(
            f"""
            INSERT OR REPLACE INTO coin_history(coin_id, ts_ms, price, market_cap, total_volume, retrieved_at)
            SELECT h.coin_id, h.ts_ms, h.price, h.market_cap, h.total_volume, h.retrieved_at
            FROM {src}.coin_history h
            JOIN professor_ids p ON p.coin_id = h.coin_id
            """
        )
        out_conn.execute(
            f"""
            INSERT OR REPLACE INTO coin_history_ranges(coin_id, from_ts, to_ts, point_count, retrieved_at)
            SELECT r.coin_id, r.from_ts, r.to_ts, r.point_count, r.retrieved_at
            FROM {src}.coin_history_ranges r
            JOIN professor_ids p ON p.coin_id = r.coin_id
            """
        )
        out_conn.commit()

    out_conn.execute("DETACH DATABASE main_src")
    out_conn.execute("DETACH DATABASE side_src")
    out_conn.execute("DROP TABLE professor_ids")
    out_conn.commit()


def build_coverage_summary(out_conn: sqlite3.Connection) -> None:
    out_conn.execute("DELETE FROM coverage_summary")
    out_conn.execute(
        """
        INSERT INTO coverage_summary(
            coin_id, symbol, name, beg_date, detail_available, detail_source, history_source,
            history_rows, history_range_count, first_ts_ms, last_ts_ms,
            rows_on_or_after_beg_date, first_ts_on_or_after_beg_ms, note
        )
        SELECT
            c.coin_id,
            c.symbol,
            c.name,
            c.beg_date,
            c.detail_available,
            c.detail_source,
            c.history_source,
            COALESCE(hs.history_rows, 0) AS history_rows,
            COALESCE(hr.history_range_count, 0) AS history_range_count,
            hs.first_ts_ms,
            hs.last_ts_ms,
            COALESCE(hs.rows_on_or_after_beg_date, 0) AS rows_on_or_after_beg_date,
            hs.first_ts_on_or_after_beg_ms,
            c.note
        FROM coin_catalog c
        LEFT JOIN (
            SELECT
                c2.coin_id,
                COUNT(h.ts_ms) AS history_rows,
                MIN(h.ts_ms) AS first_ts_ms,
                MAX(h.ts_ms) AS last_ts_ms,
                SUM(CASE WHEN h.ts_ms >= c2.beg_ts_ms THEN 1 ELSE 0 END) AS rows_on_or_after_beg_date,
                MIN(CASE WHEN h.ts_ms >= c2.beg_ts_ms THEN h.ts_ms END) AS first_ts_on_or_after_beg_ms
            FROM coin_catalog c2
            LEFT JOIN coin_history h ON h.coin_id = c2.coin_id
            GROUP BY c2.coin_id, c2.beg_ts_ms
        ) hs ON hs.coin_id = c.coin_id
        LEFT JOIN (
            SELECT coin_id, COUNT(*) AS history_range_count
            FROM coin_history_ranges
            GROUP BY coin_id
        ) hr ON hr.coin_id = c.coin_id
        """
    )
    out_conn.commit()


def annotate_zero_history(out_conn: sqlite3.Connection) -> None:
    suffix = "CoinGecko returned no history points for this coin during archive build."
    out_conn.execute(
        """
        UPDATE coverage_summary
        SET note = TRIM(COALESCE(note || ' ', '') || ?)
        WHERE history_rows = 0
        """,
        (suffix,),
    )
    out_conn.execute(
        """
        UPDATE coin_catalog
        SET note = TRIM(COALESCE(note || ' ', '') || ?)
        WHERE coin_id IN (SELECT coin_id FROM coverage_summary WHERE history_rows = 0)
        """,
        (suffix,),
    )
    out_conn.commit()


def export_coverage_csv(out_conn: sqlite3.Connection, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = out_conn.execute(
        """
        SELECT
            c.coin_id,
            c.symbol,
            c.name,
            c.beg_date,
            c.detail_available,
            c.detail_source,
            c.history_source,
            s.history_rows,
            s.history_range_count,
            s.first_ts_ms,
            s.last_ts_ms,
            s.rows_on_or_after_beg_date,
            s.first_ts_on_or_after_beg_ms,
            c.note
        FROM coin_catalog c
        JOIN coverage_summary s ON s.coin_id = c.coin_id
        ORDER BY c.coin_id
        """
    ).fetchall()
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "coin_id",
                "symbol",
                "name",
                "beg_date",
                "detail_available",
                "detail_source",
                "history_source",
                "history_rows",
                "history_range_count",
                "first_ts_ms",
                "last_ts_ms",
                "rows_on_or_after_beg_date",
                "first_ts_on_or_after_beg_ms",
                "note",
            ]
        )
        writer.writerows(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a consolidated professor Ethereum CoinGecko bundle.")
    ap.add_argument("--professor-file", type=Path, required=True)
    ap.add_argument("--main-db", type=Path, required=True)
    ap.add_argument("--sidecar-db", type=Path, required=True)
    ap.add_argument("--output-db", type=Path, required=True)
    ap.add_argument("--coverage-csv", type=Path, required=True)
    args = ap.parse_args()

    professor_rows = load_professor_rows(args.professor_file)
    args.output_db.parent.mkdir(parents=True, exist_ok=True)
    if args.output_db.exists():
        args.output_db.unlink()

    out_conn = sqlite3.connect(str(args.output_db))
    main_conn = sqlite3.connect(str(args.main_db))
    side_conn = sqlite3.connect(str(args.sidecar_db))
    try:
        init_db(out_conn)
        populate_catalog(out_conn, professor_rows, main_conn, side_conn)
        copy_history(out_conn, professor_rows, args.main_db, args.sidecar_db)
        build_coverage_summary(out_conn)
        annotate_zero_history(out_conn)
        export_coverage_csv(out_conn, args.coverage_csv)
    finally:
        side_conn.close()
        main_conn.close()
        out_conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
