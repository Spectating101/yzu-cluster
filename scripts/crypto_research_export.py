#!/usr/bin/env python3
"""
Crypto Research Data Exporter

Exports the research SQLite database to researcher-friendly flat files
(CSV and optional Excel) for direct use in R, Stata, Python, or any
statistical software.

── Outputs (all written to <out-dir>/) ──────────────────────────────────────
  coin_profiles.csv        — One row per coin, all metadata columns
  exchange_profiles.csv    — One row per exchange, all metadata columns
  categories.csv           — CoinGecko category list with market-cap data
  price_panel_long.csv     — Long-format daily time series
                             (cg_id, date, price_usd, market_cap_usd, volume_usd)
  price_panel_wide.csv     — Wide-format price panel
                             (date as index, one column per coin — price_usd)
  mcap_panel_wide.csv      — Wide-format market-cap panel
  volume_panel_wide.csv    — Wide-format volume panel
  coverage_report.md       — Plain-text summary of what is in the database

── Usage ─────────────────────────────────────────────────────────────────────
  # Default paths:
  python3 scripts/crypto_research_export.py

  # Custom paths:
  python3 scripts/crypto_research_export.py \\
      --db-path data_lake/crypto_pipeline/research_db.sqlite3 \\
      --out-dir data_lake/crypto_pipeline/exports

  # Include Excel workbook (requires openpyxl):
  python3 scripts/crypto_research_export.py --excel

  # Limit price panels to top N coins by market-cap rank:
  python3 scripts/crypto_research_export.py --top-n 500
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

_HERE     = Path(__file__).resolve()
_REPO     = _HERE.parents[1]
DEFAULT_DB  = _REPO / "data_lake" / "crypto_pipeline" / "research_db.sqlite3"
DEFAULT_OUT = _REPO / "data_lake" / "crypto_pipeline" / "exports"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_pandas():
    try:
        import pandas as pd
        return pd
    except ImportError:
        print("ERROR: pandas is required.  pip install pandas", file=sys.stderr)
        sys.exit(1)


# ── Exporters ──────────────────────────────────────────────────────────────────

def export_coin_profiles(conn: sqlite3.Connection, out: Path, pd) -> int:
    df = pd.read_sql_query(
        """SELECT
               cg_id, symbol, name, web_slug, genesis_date, country_origin,
               description_en, categories_json, homepage, whitepaper,
               twitter_handle, facebook_username, telegram_channel,
               reddit_url, github_url, discord_url,
               coingecko_rank, coingecko_score, community_score,
               developer_score, liquidity_score,
               cp_id, metadata_source, updated_at
           FROM coin_profiles
           ORDER BY coingecko_rank NULLS LAST, cg_id""",
        conn,
    )
    path = out / "coin_profiles.csv"
    df.to_csv(path, index=False)
    print(f"  coin_profiles.csv       rows={len(df)}", flush=True)
    return len(df)


def export_exchange_profiles(conn: sqlite3.Connection, out: Path, pd) -> int:
    df = pd.read_sql_query(
        """SELECT
               exchange_id, name, year_established, country, description,
               url, twitter_handle, facebook_url, reddit_url, slack_url,
               other_url_1, other_url_2, trust_score, trust_score_rank,
               trade_volume_24h_btc, centralized, has_trading_incentive,
               retrieved_at
           FROM exchange_profiles
           ORDER BY trust_score_rank NULLS LAST, exchange_id""",
        conn,
    )
    path = out / "exchange_profiles.csv"
    df.to_csv(path, index=False)
    print(f"  exchange_profiles.csv   rows={len(df)}", flush=True)
    return len(df)


def export_categories(conn: sqlite3.Connection, out: Path, pd) -> int:
    df = pd.read_sql_query(
        """SELECT category_id, name, market_cap_usd,
                  market_cap_change_24h, volume_24h_usd, retrieved_at
           FROM categories
           ORDER BY market_cap_usd DESC NULLS LAST""",
        conn,
    )
    path = out / "categories.csv"
    df.to_csv(path, index=False)
    print(f"  categories.csv          rows={len(df)}", flush=True)
    return len(df)


def export_price_panels(
    conn: sqlite3.Connection, out: Path, pd, top_n: int
) -> tuple[int, int]:
    """Export long + wide price / mcap / volume panels."""

    # Optionally restrict to top-N coins by rank
    if top_n > 0:
        rank_filter = f"""
            AND h.cg_id IN (
                SELECT cg_id FROM coin_profiles
                WHERE coingecko_rank IS NOT NULL
                ORDER BY coingecko_rank LIMIT {int(top_n)}
            )"""
    else:
        rank_filter = ""

    df = pd.read_sql_query(
        f"""SELECT h.cg_id, h.date, h.price_usd, h.market_cap_usd, h.volume_usd,
                   p.symbol, p.name, p.coingecko_rank
            FROM coin_history h
            LEFT JOIN coin_profiles p ON p.cg_id = h.cg_id
            WHERE h.price_usd IS NOT NULL AND h.price_usd > 0
            {rank_filter}
            ORDER BY h.date, h.cg_id""",
        conn,
    )

    if df.empty:
        print("  [warn] no history data found yet — run the pipeline first", flush=True)
        return 0, 0

    df["date"] = pd.to_datetime(df["date"])

    # ── Long format ──
    long_cols = ["cg_id", "symbol", "name", "date",
                 "price_usd", "market_cap_usd", "volume_usd"]
    df[long_cols].to_csv(out / "price_panel_long.csv", index=False)
    print(f"  price_panel_long.csv    rows={len(df)}", flush=True)

    # ── Wide format panels ──
    for col, fname in [
        ("price_usd",      "price_panel_wide.csv"),
        ("market_cap_usd", "mcap_panel_wide.csv"),
        ("volume_usd",     "volume_panel_wide.csv"),
    ]:
        wide = df.pivot_table(index="date", columns="cg_id", values=col, aggfunc="last")
        wide.index.name = "date"
        wide.to_csv(out / fname)

    n_coins = df["cg_id"].nunique()
    n_dates = df["date"].nunique()
    print(f"  price_panel_wide.csv    coins={n_coins}  dates={n_dates}", flush=True)
    print(f"  mcap_panel_wide.csv     coins={n_coins}  dates={n_dates}", flush=True)
    print(f"  volume_panel_wide.csv   coins={n_coins}  dates={n_dates}", flush=True)
    return n_coins, n_dates


def export_excel(out: Path, pd) -> None:
    """Bundle all CSVs into a single Excel workbook (openpyxl required)."""
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        print("  [warn] openpyxl not installed — skipping Excel export", file=sys.stderr)
        return

    xl_path = out / "crypto_research_data.xlsx"
    sheets = {
        "coin_profiles":    "coin_profiles.csv",
        "exchange_profiles":"exchange_profiles.csv",
        "categories":       "categories.csv",
        "price_long":       "price_panel_long.csv",
    }
    with pd.ExcelWriter(xl_path, engine="openpyxl") as writer:
        for sheet, fname in sheets.items():
            fpath = out / fname
            if fpath.exists():
                pd.read_csv(fpath).to_excel(writer, sheet_name=sheet, index=False)
    print(f"  crypto_research_data.xlsx  (workbook)", flush=True)


def write_coverage_report(conn: sqlite3.Connection, out: Path, top_n: int) -> None:
    """Write a plain-text markdown coverage report."""

    def q(sql: str) -> int:
        try:
            return conn.execute(sql).fetchone()[0] or 0
        except Exception:
            return 0

    n_coins        = q("SELECT COUNT(*) FROM coin_profiles")
    n_enriched     = q("SELECT COUNT(*) FROM coin_profiles WHERE metadata_source NOT IN ('', 'cg_list') AND metadata_source IS NOT NULL")
    n_with_web     = q("SELECT COUNT(*) FROM coin_profiles WHERE homepage IS NOT NULL AND homepage != ''")
    n_with_twitter = q("SELECT COUNT(*) FROM coin_profiles WHERE twitter_handle IS NOT NULL AND twitter_handle != ''")
    n_with_genesis = q("SELECT COUNT(*) FROM coin_profiles WHERE genesis_date IS NOT NULL AND genesis_date != ''")
    n_with_country = q("SELECT COUNT(*) FROM coin_profiles WHERE country_origin IS NOT NULL AND country_origin != ''")
    n_categories   = q("SELECT COUNT(*) FROM categories")
    n_exchanges    = q("SELECT COUNT(*) FROM exchange_profiles")
    n_history_coins= q("SELECT COUNT(DISTINCT cg_id) FROM coin_history")
    n_history_rows = q("SELECT COUNT(*) FROM coin_history")
    date_min       = (conn.execute("SELECT MIN(date) FROM coin_history").fetchone() or [None])[0]
    date_max       = (conn.execute("SELECT MAX(date) FROM coin_history").fetchone() or [None])[0]
    n_failures     = q("SELECT COUNT(*) FROM failures")
    last_run       = (conn.execute(
        "SELECT started_at, status, profile FROM ingest_log ORDER BY started_at DESC LIMIT 1"
    ).fetchone()) or ("—", "—", "—")

    lines = [
        "# Crypto Research Database — Coverage Report",
        "",
        f"Generated: `{_now()}`",
        "",
        "## Coin Profiles",
        "",
        f"| Field | Count | Fill rate |",
        f"|---|---:|---:|",
        f"| Total coins in universe | {n_coins:,} | — |",
        f"| Metadata enriched (beyond list) | {n_enriched:,} | {n_enriched/max(n_coins,1)*100:.1f}% |",
        f"| Homepage / website | {n_with_web:,} | {n_with_web/max(n_coins,1)*100:.1f}% |",
        f"| Twitter handle | {n_with_twitter:,} | {n_with_twitter/max(n_coins,1)*100:.1f}% |",
        f"| Genesis date | {n_with_genesis:,} | {n_with_genesis/max(n_coins,1)*100:.1f}% |",
        f"| Country of origin | {n_with_country:,} | {n_with_country/max(n_coins,1)*100:.1f}% |",
        "",
        "## Historical Prices",
        "",
        f"| | |",
        f"|---|---|",
        f"| Coins with history | {n_history_coins:,} |",
        f"| Total daily rows | {n_history_rows:,} |",
        f"| Date range | `{date_min}` → `{date_max}` |",
        f"| Panel exported (top-N limit) | {top_n if top_n > 0 else 'all'} |",
        "",
        "## Supporting Tables",
        "",
        f"| Table | Rows |",
        f"|---|---:|",
        f"| categories | {n_categories:,} |",
        f"| exchange_profiles | {n_exchanges:,} |",
        f"| failures (errors logged) | {n_failures:,} |",
        "",
        "## Last Ingest Run",
        "",
        f"| | |",
        f"|---|---|",
        f"| Started | `{last_run[0]}` |",
        f"| Status | `{last_run[1]}` |",
        f"| Profile | `{last_run[2]}` |",
        "",
        "## Notes",
        "",
        "- `web_slug`, `genesis_date`, `country_origin` require CoinGecko Pro API (stage 4).",
        "- `price_panel_wide.csv`: rows = dates, columns = CoinGecko coin IDs.",
        "- All prices in USD.",
    ]

    (out / "coverage_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  coverage_report.md", flush=True)


# ── CLI ────────────────────────────────────────────────────────────────────────

def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Export crypto research SQLite DB to flat CSV files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--db-path", type=Path, default=DEFAULT_DB)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--top-n", type=int, default=0,
                    help="Limit wide price panels to top-N coins by rank (0=all).")
    ap.add_argument("--excel", action="store_true",
                    help="Also write an Excel workbook (requires openpyxl).")
    ap.add_argument("--skip-panels", action="store_true",
                    help="Skip wide price panel exports (fast metadata-only export).")
    return ap


def main() -> int:
    args = _parser().parse_args()
    pd   = _require_pandas()

    if not args.db_path.exists():
        print(f"ERROR: database not found: {args.db_path}", file=sys.stderr)
        print("Run crypto_research_pipeline.py first.", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[export] db={args.db_path}", flush=True)
    print(f"[export] out={args.out_dir}", flush=True)

    conn = sqlite3.connect(str(args.db_path))
    try:
        print("\n[1/5] coin profiles", flush=True)
        export_coin_profiles(conn, args.out_dir, pd)

        print("[2/5] exchange profiles", flush=True)
        export_exchange_profiles(conn, args.out_dir, pd)

        print("[3/5] categories", flush=True)
        export_categories(conn, args.out_dir, pd)

        if not args.skip_panels:
            print("[4/5] price panels", flush=True)
            export_price_panels(conn, args.out_dir, pd, args.top_n)
        else:
            print("[4/5] price panels  [skipped]", flush=True)

        print("[5/5] coverage report", flush=True)
        write_coverage_report(conn, args.out_dir, args.top_n)

        if args.excel:
            print("[+]   excel workbook", flush=True)
            export_excel(args.out_dir, pd)

    finally:
        conn.close()

    print(f"\n✅  Export complete  →  {args.out_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
