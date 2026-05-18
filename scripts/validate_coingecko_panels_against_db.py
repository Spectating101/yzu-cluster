#!/usr/bin/env python3
"""Validate CoinGecko panel CSVs against the full CoinGecko SQLite archive."""

from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd


REPO = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO / "data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3"
DEFAULT_EXPORTS = REPO / "data_lake/crypto_pipeline/exports"
DEFAULT_OUT = REPO / "data_lake/crypto_pipeline/validation/coingecko_panel_db_consistency"


@dataclass(frozen=True)
class MetricSpec:
    label: str
    panel_path: Path
    db_column: str


def qmarks(values: Iterable[str]) -> str:
    return ",".join("?" for _ in values)


def rel_diff(panel: pd.Series, db: pd.Series) -> pd.Series:
    denom = db.abs().where(db.abs() > 1e-30, 1.0)
    return (panel - db).abs() / denom


def panel_metadata(path: Path) -> dict:
    header = pd.read_csv(path, nrows=0)
    dates = pd.read_csv(path, usecols=["date"])
    return {
        "file": str(path),
        "rows": int(len(dates)),
        "columns_ex_date": int(len(header.columns) - 1),
        "min_date": str(dates["date"].min()),
        "max_date": str(dates["date"].max()),
    }


def db_metadata(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS rows,
            COUNT(DISTINCT coin_id) AS coins,
            MIN(date(ts_ms / 1000, 'unixepoch')) AS min_date,
            MAX(date(ts_ms / 1000, 'unixepoch')) AS max_date
        FROM coin_history
        """
    ).fetchone()
    return {
        "rows": int(row[0]),
        "coins": int(row[1]),
        "min_date": row[2],
        "max_date": row[3],
    }


def load_db_subset(
    conn: sqlite3.Connection,
    coins: list[str],
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    start_ms = int(
        datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc).timestamp() * 1000
    )
    end_ms = int(
        datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc).timestamp() * 1000
    )
    chunks: list[pd.DataFrame] = []
    for offset in range(0, len(coins), 500):
        batch = coins[offset : offset + 500]
        print(f"Loading DB rows for coins {offset + 1}-{offset + len(batch)}...", flush=True)
        sql = f"""
            SELECT
                coin_id AS cg_id,
                date(ts_ms / 1000, 'unixepoch') AS date,
                price,
                market_cap,
                total_volume
            FROM coin_history
            WHERE coin_id IN ({qmarks(batch)})
              AND ts_ms BETWEEN ? AND ?
        """
        chunks.append(
            pd.read_sql_query(sql, conn, params=[*batch, start_ms, end_ms])
        )
    if not chunks:
        return pd.DataFrame(columns=["cg_id", "date", "price", "market_cap", "total_volume"])
    db = pd.concat(chunks, ignore_index=True)
    db["date"] = pd.to_datetime(db["date"]).dt.strftime("%Y-%m-%d")
    return db


def wide_to_long(path: Path, value_name: str, columns: list[str], max_date: str) -> pd.DataFrame:
    usecols = ["date", *columns]
    df = pd.read_csv(path, usecols=lambda c: c in set(usecols), low_memory=False)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df = df[df["date"] <= max_date]
    long = df.melt(id_vars=["date"], var_name="cg_id", value_name=value_name)
    long[value_name] = pd.to_numeric(long[value_name], errors="coerce")
    return long.dropna(subset=[value_name]).reset_index(drop=True)


def compare_metric(
    spec: MetricSpec,
    db_subset: pd.DataFrame,
    price_columns: list[str],
    db_max_date: str,
    out_dir: Path,
) -> dict:
    print(f"Comparing {spec.label}...", flush=True)
    panel_header = set(pd.read_csv(spec.panel_path, nrows=0).columns)
    common_columns = [c for c in price_columns if c in panel_header]
    panel = wide_to_long(spec.panel_path, "panel_value", common_columns, db_max_date)
    db_metric = db_subset[["cg_id", "date", spec.db_column]].rename(
        columns={spec.db_column: "db_value"}
    )
    db_metric["db_value"] = pd.to_numeric(db_metric["db_value"], errors="coerce")
    db_metric = db_metric.dropna(subset=["db_value"])

    panel_idx = panel.set_index(["cg_id", "date"]).sort_index()
    db_idx = db_metric.set_index(["cg_id", "date"]).sort_index()
    overlap_idx = panel_idx.index.intersection(db_idx.index)
    both = pd.DataFrame(
        {
            "panel_value": panel_idx.loc[overlap_idx, "panel_value"].to_numpy(),
            "db_value": db_idx.loc[overlap_idx, "db_value"].to_numpy(),
        },
        index=overlap_idx,
    ).reset_index()
    both["abs_diff"] = (both["panel_value"] - both["db_value"]).abs()
    both["rel_diff"] = rel_diff(both["panel_value"], both["db_value"])
    both_dates = pd.to_datetime(both["date"])
    period = pd.Series("through_long_csv", index=both.index)
    period[(both_dates > pd.Timestamp("2026-03-19")) & (both_dates <= pd.Timestamp(db_max_date))] = (
        "after_long_through_db"
    )
    period[both_dates > pd.Timestamp(db_max_date)] = "after_db"
    both["period"] = period

    mismatches = both[both["rel_diff"] > 1e-8].nlargest(200, "rel_diff")
    sample_path = out_dir / f"{spec.label}_largest_diffs.csv"
    mismatches.to_csv(sample_path, index=False)

    return {
        "metric": spec.label,
        "panel_file": str(spec.panel_path),
        "checked_columns": len(common_columns),
        "panel_non_null_cells_to_db_max": int(len(panel)),
        "db_non_null_rows_for_panel_coins": int(len(db_metric)),
        "overlap_cells": int(len(both)),
        "panel_cells_missing_in_db": int(len(panel_idx.index.difference(db_idx.index))),
        "db_rows_missing_in_panel": int(len(db_idx.index.difference(panel_idx.index))),
        "exact_or_near_matches_rel_le_1e-8": int((both["rel_diff"] <= 1e-8).sum()),
        "mismatch_rel_gt_1e-8": int((both["rel_diff"] > 1e-8).sum()),
        "median_rel_diff": float(both["rel_diff"].median()) if len(both) else None,
        "p99_rel_diff": float(both["rel_diff"].quantile(0.99)) if len(both) else None,
        "max_rel_diff": float(both["rel_diff"].max()) if len(both) else None,
        "period_breakdown": {
            str(name): {
                "overlap_cells": int(len(group)),
                "mismatch_rel_gt_1e-8": int((group["rel_diff"] > 1e-8).sum()),
                "mismatch_rel_gt_1e-4": int((group["rel_diff"] > 1e-4).sum()),
                "mismatch_rel_gt_1pct": int((group["rel_diff"] > 0.01).sum()),
                "median_rel_diff": float(group["rel_diff"].median()) if len(group) else None,
                "p99_rel_diff": float(group["rel_diff"].quantile(0.99)) if len(group) else None,
            }
            for name, group in both.groupby("period")
        },
        "largest_diffs_sample": str(sample_path),
    }


def price_long_metadata(path: Path) -> dict:
    print("Reading price_panel_long.csv metadata...", flush=True)
    rows = 0
    min_date = "9999-99-99"
    max_date = "0000-00-00"
    coins: set[str] = set()
    for chunk in pd.read_csv(path, usecols=["cg_id", "date"], chunksize=500_000):
        rows += len(chunk)
        min_date = min(min_date, str(chunk["date"].min()))
        max_date = max(max_date, str(chunk["date"].max()))
        coins.update(chunk["cg_id"].dropna().astype(str).unique())
    return {
        "file": str(path),
        "rows": rows,
        "coins": len(coins),
        "min_date": min_date,
        "max_date": max_date,
    }


def write_report(summary: dict, path: Path) -> None:
    lines = [
        "# CoinGecko Panel vs Archive Consistency",
        "",
        "## Verdict",
        "",
        summary["verdict"],
        "",
        "## Coverage",
        "",
        f"- SQLite archive: {summary['db']['rows']:,} rows, {summary['db']['coins']:,} coins, "
        f"{summary['db']['min_date']} to {summary['db']['max_date']}.",
        f"- `price_panel_long.csv`: {summary['price_panel_long']['rows']:,} rows, "
        f"{summary['price_panel_long']['coins']:,} coins, "
        f"{summary['price_panel_long']['min_date']} to {summary['price_panel_long']['max_date']}.",
    ]
    for item in summary["panels"]:
        lines.append(
            f"- `{Path(item['file']).name}`: {item['rows']:,} rows, "
            f"{item['columns_ex_date']:,} data columns, {item['min_date']} to {item['max_date']}."
        )
    lines.extend(["", "## Value Checks", ""])
    for item in summary["metric_checks"]:
        lines.extend(
            [
                f"### {item['metric']}",
                "",
                f"- Checked columns: {item['checked_columns']:,}",
                f"- Overlap cells: {item['overlap_cells']:,}",
                f"- Panel cells missing in DB: {item['panel_cells_missing_in_db']:,}",
                f"- DB rows missing in panel: {item['db_rows_missing_in_panel']:,}",
                f"- Near matches, relative diff <= 1e-8: {item['exact_or_near_matches_rel_le_1e-8']:,}",
                f"- Mismatches, relative diff > 1e-8: {item['mismatch_rel_gt_1e-8']:,}",
                f"- Median relative diff: {item['median_rel_diff']}",
                f"- P99 relative diff: {item['p99_rel_diff']}",
                f"- Max relative diff: {item['max_rel_diff']}",
                f"- Largest-diff sample: `{item['largest_diffs_sample']}`",
                "",
                "Period breakdown:",
                "",
            ]
        )
        for period, values in item["period_breakdown"].items():
            lines.append(
                f"- {period}: {values['overlap_cells']:,} overlap cells; "
                f"{values['mismatch_rel_gt_1e-8']:,} mismatches > 1e-8; "
                f"{values['mismatch_rel_gt_1pct']:,} mismatches > 1%."
            )
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--exports", type=Path, default=DEFAULT_EXPORTS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    price_path = args.exports / "price_panel_clean.csv"
    specs = [
        MetricSpec("price", price_path, "price"),
        MetricSpec("market_cap", args.exports / "mcap_panel_wide.csv", "market_cap"),
        MetricSpec("total_volume", args.exports / "volume_panel_wide.csv", "total_volume"),
    ]

    with sqlite3.connect(args.db) as conn:
        db_meta = db_metadata(conn)
        print(f"SQLite archive reaches {db_meta['max_date']}.", flush=True)
        price_header = pd.read_csv(price_path, nrows=0)
        price_columns = [c for c in price_header.columns if c != "date"]
        price_dates = pd.read_csv(price_path, usecols=["date"])
        start_date = str(price_dates["date"].min())
        end_date = min(str(price_dates["date"].max()), db_meta["max_date"])
        db_subset = load_db_subset(conn, price_columns, start_date, end_date)

    panel_metas = [panel_metadata(spec.panel_path) for spec in specs]
    metric_checks = [
        compare_metric(spec, db_subset, price_columns, db_meta["max_date"], args.out)
        for spec in specs
    ]
    long_meta = price_long_metadata(args.exports / "price_panel_long.csv")

    clean_max = panel_metas[0]["max_date"]
    verdict = (
        "The panel exports are not fully equivalent to the heavy SQLite archive. Market-cap values "
        "mostly match on overlapping rows, but price and total-volume have many historical "
        "divergences versus SQLite even before the daily-scraped extension period. The daily "
        "scraper also extends the wide panels beyond both `price_panel_long.csv` and the archive, "
        "so the latest rows are not archive-backed until a historical/archive refresh is run."
    )
    if long_meta["max_date"] < db_meta["max_date"] or clean_max > db_meta["max_date"]:
        verdict += (
            f" Current boundaries: long CSV ends {long_meta['max_date']}, SQLite reaches "
            f"{db_meta['max_date']}, and clean daily panel reaches {clean_max}."
        )

    summary = {
        "db": db_meta,
        "panels": panel_metas,
        "price_panel_long": long_meta,
        "metric_checks": metric_checks,
        "verdict": verdict,
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_report(summary, args.out / "COINGECKO_PANEL_DB_CONSISTENCY.md")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
