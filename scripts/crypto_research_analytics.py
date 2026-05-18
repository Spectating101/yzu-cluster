#!/usr/bin/env python3
"""
Crypto Research Analytics

Computes derived financial metrics for every coin in the research database
and cross-correlates with the existing Sharpe-Renaissance multi-asset panel
(SPY, QQQ, GLD, BIL, BTC-USD, ETH-USD, etc.).

── Per-coin metrics ──────────────────────────────────────────────────────────
  daily_return          Daily log return
  vol_7d / 30d / 90d   Annualised realised volatility (7 / 30 / 90-day window)
  ret_7d / 30d / 90d   Cumulative return over window
  sharpe_90d            Annualised Sharpe ratio (90-day window, rf=0)
  sortino_90d           Annualised Sortino ratio (90-day window)
  max_drawdown          Maximum peak-to-trough drawdown (full history)
  cagr                  Compound annual growth rate (full history)
  ath                   All-time high price
  ath_drawdown          Current drawdown from ATH
  mcap_dominance        Coin market cap as % of total crypto market cap (daily)

── Category analytics ────────────────────────────────────────────────────────
  Total market cap and volume per CoinGecko category
  Average 30-day return and 30-day volatility per category
  Top 5 coins per category by market cap

── Cross-asset correlation ───────────────────────────────────────────────────
  Pairwise return correlations among top-N coins (by market cap)
  Plus correlation with SPY, QQQ, GLD, TLT, GLD from the existing
  multi-asset panel (data_lake/daily_alpha_panel.csv) if available

── Outputs ───────────────────────────────────────────────────────────────────
  Writes `coin_analytics` table back to research_db.sqlite3
  Exports to <out-dir>/:
    coin_analytics.csv         — Per-coin metric snapshot (latest values)
    category_analytics.csv     — Category-level aggregation
    correlation_matrix.csv     — Pairwise correlations (top-N coins + macro)
    analytics_report.md        — Narrative summary of findings

── Usage ─────────────────────────────────────────────────────────────────────
  python3 scripts/crypto_research_analytics.py

  # Custom paths / options:
  python3 scripts/crypto_research_analytics.py \\
      --db-path  data_lake/crypto_pipeline/research_db.sqlite3 \\
      --out-dir  data_lake/crypto_pipeline/exports \\
      --top-n    200 \\
      --corr-n   50
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_HERE    = Path(__file__).resolve()
_REPO    = _HERE.parents[1]
DEFAULT_DB    = _REPO / "data_lake" / "crypto_pipeline" / "research_db.sqlite3"
DEFAULT_OUT   = _REPO / "data_lake" / "crypto_pipeline" / "exports"
MACRO_PANEL   = _REPO / "data_lake" / "daily_alpha_panel.csv"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_pandas():
    try:
        import pandas as pd
        import numpy as np
        return pd, np
    except ImportError:
        print("ERROR: pandas and numpy are required.  pip install pandas numpy", file=sys.stderr)
        sys.exit(1)


# ── Schema ────────────────────────────────────────────────────────────────────

_ANALYTICS_SCHEMA = """
CREATE TABLE IF NOT EXISTS coin_analytics (
    cg_id           TEXT    PRIMARY KEY,
    computed_at     TEXT    NOT NULL,
    history_days    INTEGER,
    first_date      TEXT,
    last_date       TEXT,
    last_price_usd  REAL,
    ath_price_usd   REAL,
    ath_date        TEXT,
    ath_drawdown    REAL,
    cagr            REAL,
    max_drawdown    REAL,
    vol_7d          REAL,
    vol_30d         REAL,
    vol_90d         REAL,
    ret_7d          REAL,
    ret_30d         REAL,
    ret_90d         REAL,
    sharpe_90d      REAL,
    sortino_90d     REAL,
    avg_daily_vol_usd   REAL,
    avg_mcap_usd        REAL
);
"""


# ── Core metric functions ─────────────────────────────────────────────────────

def _annualized_vol(returns, window: int, np) -> float | None:
    if len(returns) < window:
        return None
    r = returns.iloc[-window:]
    std = r.std()
    if std == 0 or np.isnan(std):
        return None
    return float(std * np.sqrt(252))


def _cumulative_return(prices, window: int) -> float | None:
    if len(prices) < window + 1:
        return None
    p0 = prices.iloc[-(window + 1)]
    p1 = prices.iloc[-1]
    if p0 <= 0:
        return None
    return float(p1 / p0 - 1)


def _sharpe(returns, window: int, np) -> float | None:
    if len(returns) < window:
        return None
    r = returns.iloc[-window:]
    mean_r = r.mean()
    std_r  = r.std()
    if std_r == 0 or np.isnan(std_r):
        return None
    return float(mean_r / std_r * np.sqrt(252))


def _sortino(returns, window: int, np) -> float | None:
    if len(returns) < window:
        return None
    r = returns.iloc[-window:]
    mean_r   = r.mean()
    downside = r[r < 0].std()
    if downside == 0 or np.isnan(downside):
        return None
    return float(mean_r / downside * np.sqrt(252))


def _max_drawdown(prices, np) -> float | None:
    if len(prices) < 2:
        return None
    roll_max = prices.cummax()
    dd = (prices / roll_max) - 1
    mdd = dd.min()
    return float(mdd) if not np.isnan(mdd) else None


def _cagr(prices, np) -> float | None:
    if len(prices) < 2:
        return None
    p0, p1 = prices.iloc[0], prices.iloc[-1]
    if p0 <= 0 or p1 <= 0:
        return None
    years = len(prices) / 252
    if years <= 0:
        return None
    return float((p1 / p0) ** (1 / years) - 1)


# ── Per-coin analytics ────────────────────────────────────────────────────────

def compute_coin_analytics(conn: sqlite3.Connection, pd, np, top_n: int) -> Any:
    """
    Compute per-coin metrics and write to coin_analytics table.
    Returns a DataFrame of the results.
    """
    print("[analytics] loading price history …", flush=True)

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
        f"""SELECT h.cg_id, h.date, h.price_usd, h.market_cap_usd, h.volume_usd
            FROM coin_history h
            WHERE h.price_usd IS NOT NULL AND h.price_usd > 0
            {rank_filter}
            ORDER BY h.cg_id, h.date""",
        conn,
    )

    if df.empty:
        print("  [warn] no history data — run pipeline first", flush=True)
        return pd.DataFrame()

    df["date"] = pd.to_datetime(df["date"])
    print(f"  {df['cg_id'].nunique()} coins  {len(df):,} rows  "
          f"{df['date'].min().date()} → {df['date'].max().date()}", flush=True)

    # Compute total market cap per day (for dominance %)
    total_mcap = df.groupby("date")["market_cap_usd"].sum().rename("total_mcap_usd")

    records = []
    for cg_id, grp in df.groupby("cg_id"):
        grp = grp.sort_values("date").set_index("date")
        prices  = grp["price_usd"]
        returns = prices.pct_change().dropna()

        ath_idx  = prices.idxmax() if len(prices) > 0 else None
        ath_px   = float(prices.max()) if len(prices) > 0 else None
        last_px  = float(prices.iloc[-1])
        ath_dd   = (last_px / ath_px - 1) if ath_px and ath_px > 0 else None

        records.append({
            "cg_id":            cg_id,
            "computed_at":      _now(),
            "history_days":     len(prices),
            "first_date":       str(prices.index[0].date()),
            "last_date":        str(prices.index[-1].date()),
            "last_price_usd":   last_px,
            "ath_price_usd":    ath_px,
            "ath_date":         str(ath_idx.date()) if ath_idx is not None else None,
            "ath_drawdown":     ath_dd,
            "cagr":             _cagr(prices, np),
            "max_drawdown":     _max_drawdown(prices, np),
            "vol_7d":           _annualized_vol(returns, 7,  np),
            "vol_30d":          _annualized_vol(returns, 30, np),
            "vol_90d":          _annualized_vol(returns, 90, np),
            "ret_7d":           _cumulative_return(prices, 7),
            "ret_30d":          _cumulative_return(prices, 30),
            "ret_90d":          _cumulative_return(prices, 90),
            "sharpe_90d":       _sharpe(returns, 90, np),
            "sortino_90d":      _sortino(returns, 90, np),
            "avg_daily_vol_usd":float(grp["volume_usd"].mean()) if "volume_usd" in grp else None,
            "avg_mcap_usd":     float(grp["market_cap_usd"].mean()) if "market_cap_usd" in grp else None,
        })

    result = pd.DataFrame(records)

    # Write to DB
    conn.executescript(_ANALYTICS_SCHEMA)
    conn.commit()
    for row in records:
        conn.execute(
            """INSERT INTO coin_analytics(
                   cg_id, computed_at, history_days, first_date, last_date,
                   last_price_usd, ath_price_usd, ath_date, ath_drawdown,
                   cagr, max_drawdown, vol_7d, vol_30d, vol_90d,
                   ret_7d, ret_30d, ret_90d, sharpe_90d, sortino_90d,
                   avg_daily_vol_usd, avg_mcap_usd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(cg_id) DO UPDATE SET
                   computed_at=excluded.computed_at,
                   history_days=excluded.history_days,
                   first_date=excluded.first_date,
                   last_date=excluded.last_date,
                   last_price_usd=excluded.last_price_usd,
                   ath_price_usd=excluded.ath_price_usd,
                   ath_date=excluded.ath_date,
                   ath_drawdown=excluded.ath_drawdown,
                   cagr=excluded.cagr,
                   max_drawdown=excluded.max_drawdown,
                   vol_7d=excluded.vol_7d,
                   vol_30d=excluded.vol_30d,
                   vol_90d=excluded.vol_90d,
                   ret_7d=excluded.ret_7d,
                   ret_30d=excluded.ret_30d,
                   ret_90d=excluded.ret_90d,
                   sharpe_90d=excluded.sharpe_90d,
                   sortino_90d=excluded.sortino_90d,
                   avg_daily_vol_usd=excluded.avg_daily_vol_usd,
                   avg_mcap_usd=excluded.avg_mcap_usd""",
            (row["cg_id"], row["computed_at"], row["history_days"],
             row["first_date"], row["last_date"], row["last_price_usd"],
             row["ath_price_usd"], row["ath_date"], row["ath_drawdown"],
             row["cagr"], row["max_drawdown"],
             row["vol_7d"], row["vol_30d"], row["vol_90d"],
             row["ret_7d"], row["ret_30d"], row["ret_90d"],
             row["sharpe_90d"], row["sortino_90d"],
             row["avg_daily_vol_usd"], row["avg_mcap_usd"]),
        )
    conn.commit()
    print(f"  coin_analytics rows written: {len(result)}", flush=True)
    return result


# ── Category analytics ────────────────────────────────────────────────────────

def compute_category_analytics(conn: sqlite3.Connection, pd, np) -> Any:
    """
    Roll up per-coin metrics to CoinGecko category level.
    Returns a DataFrame with one row per category.
    """
    print("[analytics] computing category analytics …", flush=True)

    df = pd.read_sql_query(
        """SELECT p.cg_id, p.name, p.categories_json, p.coingecko_rank,
                  a.cagr, a.vol_30d, a.ret_30d, a.sharpe_90d,
                  a.max_drawdown, a.avg_mcap_usd, a.last_price_usd
           FROM coin_profiles p
           LEFT JOIN coin_analytics a ON a.cg_id = p.cg_id
           WHERE p.categories_json IS NOT NULL AND p.categories_json != '[]'""",
        conn,
    )

    if df.empty:
        print("  [warn] no category data available", flush=True)
        return pd.DataFrame()

    # Explode categories_json (stored as JSON array string)
    rows = []
    for _, row in df.iterrows():
        try:
            cats = json.loads(row["categories_json"])
        except Exception:
            cats = []
        for cat in cats:
            if cat:
                rows.append({**row.to_dict(), "category": str(cat)})

    if not rows:
        return pd.DataFrame()

    exploded = pd.DataFrame(rows)

    agg = exploded.groupby("category").agg(
        coin_count    =("cg_id",       "count"),
        total_mcap_usd=("avg_mcap_usd", "sum"),
        avg_cagr      =("cagr",         "mean"),
        avg_vol_30d   =("vol_30d",       "mean"),
        avg_ret_30d   =("ret_30d",       "mean"),
        avg_sharpe    =("sharpe_90d",    "mean"),
        avg_drawdown  =("max_drawdown",  "mean"),
        top_coins     =("name", lambda x: ", ".join(x.dropna().head(5).tolist())),
    ).reset_index()

    agg = agg.sort_values("total_mcap_usd", ascending=False)
    print(f"  categories with data: {len(agg)}", flush=True)
    return agg


# ── Cross-asset correlation ───────────────────────────────────────────────────

def compute_correlation_matrix(
    conn: sqlite3.Connection, pd, np, corr_n: int
) -> Any:
    """
    Compute pairwise daily-return correlations for the top-N crypto coins,
    and append macro assets from the existing multi-asset panel if available.
    """
    print("[analytics] computing correlation matrix …", flush=True)

    # Select top-N coins by rank with sufficient history;
    # if ranks are not yet populated, fall back to coins with the most history rows.
    top_coins = pd.read_sql_query(
        f"""SELECT h.cg_id, h.date, h.price_usd
            FROM coin_history h
            INNER JOIN coin_profiles p ON p.cg_id = h.cg_id
            WHERE h.price_usd IS NOT NULL AND h.price_usd > 0
              AND h.cg_id IN (
                  SELECT cg_id FROM coin_profiles
                  WHERE coingecko_rank IS NOT NULL
                  ORDER BY coingecko_rank LIMIT {int(corr_n)}
              )
            ORDER BY p.coingecko_rank, h.date""",
        conn,
    )
    if top_coins.empty:
        # Fallback: ranks not yet available — use coins with most rows
        top_coins = pd.read_sql_query(
            f"""SELECT h.cg_id, h.date, h.price_usd
                FROM coin_history h
                WHERE h.price_usd IS NOT NULL AND h.price_usd > 0
                  AND h.cg_id IN (
                      SELECT cg_id FROM coin_history
                      WHERE price_usd IS NOT NULL
                      GROUP BY cg_id ORDER BY COUNT(*) DESC LIMIT {int(corr_n)}
                  )
                ORDER BY h.cg_id, h.date""",
            conn,
        )

    if top_coins.empty:
        print("  [warn] no history for correlation", flush=True)
        return pd.DataFrame()

    top_coins["date"] = pd.to_datetime(top_coins["date"])
    price_wide = top_coins.pivot_table(
        index="date", columns="cg_id", values="price_usd", aggfunc="last"
    )

    # Append macro panel if available
    if MACRO_PANEL.exists():
        try:
            macro = pd.read_csv(MACRO_PANEL, parse_dates=["Date"])
            macro_wide = macro.pivot_table(
                index="Date", columns="Instrument",
                values="Price_Close", aggfunc="last"
            )
            macro_wide.index.name = "date"
            # Only keep instruments not already in crypto universe
            new_cols = [c for c in macro_wide.columns if c not in price_wide.columns]
            price_wide = price_wide.join(macro_wide[new_cols], how="left")
            print(f"  appended macro instruments: {new_cols}", flush=True)
        except Exception as e:
            print(f"  [warn] macro panel load failed: {e}", flush=True)

    returns = price_wide.pct_change().dropna(how="all")

    # Require at least 60 days of data per column
    valid_cols = returns.columns[returns.count() >= 60].tolist()
    corr = returns[valid_cols].corr()

    print(f"  correlation matrix: {len(valid_cols)}×{len(valid_cols)}", flush=True)
    return corr


# ── Analytics report ──────────────────────────────────────────────────────────

def write_analytics_report(
    out: Path,
    coin_df: Any,
    cat_df: Any,
    corr_df: Any,
    pd, np,
) -> None:
    """Write a markdown summary of the key analytics findings."""

    lines = [
        "# Crypto Research Analytics Report",
        "",
        f"Generated: `{_now()}`",
        "",
    ]

    # ── Market overview ──
    if not coin_df.empty:
        lines += [
            "## Market Overview",
            "",
            f"- **Coins analysed**: {len(coin_df):,}",
        ]
        with_hist = coin_df.dropna(subset=["cagr"])
        if not with_hist.empty:
            median_cagr = with_hist["cagr"].median()
            median_vol  = with_hist["vol_30d"].median() if "vol_30d" in with_hist else None
            median_dd   = with_hist["max_drawdown"].median() if "max_drawdown" in with_hist else None
            lines += [
                f"- **Median CAGR** (full history): `{median_cagr*100:.1f}%`",
            ]
            if median_vol is not None:
                lines.append(f"- **Median 30-day annualised volatility**: `{median_vol*100:.1f}%`")
            if median_dd is not None:
                lines.append(f"- **Median max drawdown**: `{median_dd*100:.1f}%`")

        # Top performers (30-day return)
        if "ret_30d" in coin_df.columns:
            top5 = coin_df.nlargest(5, "ret_30d")[["cg_id", "ret_30d", "sharpe_90d"]]
            lines += ["", "### Top 5 — 30-day return", "", "| Coin | 30d Return | Sharpe (90d) |", "|---|---:|---:|"]
            for _, row in top5.iterrows():
                ret = f"{row['ret_30d']*100:.1f}%" if pd.notna(row['ret_30d']) else "—"
                sh  = f"{row['sharpe_90d']:.2f}" if pd.notna(row['sharpe_90d']) else "—"
                lines.append(f"| `{row['cg_id']}` | {ret} | {sh} |")

        # Highest Sharpe
        if "sharpe_90d" in coin_df.columns:
            top5_sh = coin_df.dropna(subset=["sharpe_90d"]).nlargest(5, "sharpe_90d")[
                ["cg_id", "sharpe_90d", "vol_30d"]
            ]
            lines += ["", "### Top 5 — Sharpe ratio (90-day)", "", "| Coin | Sharpe | Vol 30d |", "|---|---:|---:|"]
            for _, row in top5_sh.iterrows():
                vol = f"{row['vol_30d']*100:.1f}%" if pd.notna(row['vol_30d']) else "—"
                lines.append(f"| `{row['cg_id']}` | {row['sharpe_90d']:.2f} | {vol} |")

        lines.append("")

    # ── Category summary ──
    if not cat_df.empty:
        top_cats = cat_df.head(10)
        lines += [
            "## Category Summary (top 10 by market cap)",
            "",
            "| Category | Coins | Avg CAGR | Avg 30d Vol | Avg 30d Ret |",
            "|---|---:|---:|---:|---:|",
        ]
        for _, row in top_cats.iterrows():
            cagr = f"{row['avg_cagr']*100:.0f}%" if pd.notna(row.get("avg_cagr")) else "—"
            vol  = f"{row['avg_vol_30d']*100:.0f}%" if pd.notna(row.get("avg_vol_30d")) else "—"
            ret  = f"{row['avg_ret_30d']*100:.1f}%" if pd.notna(row.get("avg_ret_30d")) else "—"
            lines.append(f"| {row['category']} | {int(row['coin_count'])} | {cagr} | {vol} | {ret} |")
        lines.append("")

    # ── Cross-asset correlation note ──
    if not corr_df.empty:
        # Macro instruments are all-caps alpha-only short tickers (e.g. SPY, GLD) from the equity panel
        macro_assets = [c for c in corr_df.columns if c.isalpha() and c == c.upper() and len(c) <= 6]
        if macro_assets:
            lines += [
                "## Cross-Asset Correlations",
                "",
                "Correlation of daily returns between top crypto coins and macro instruments.",
                f"Macro instruments included: {', '.join(f'`{a}`' for a in macro_assets)}",
                "",
                "See `correlation_matrix.csv` for the full matrix.",
                "",
            ]

    lines += [
        "## Files Generated",
        "",
        "| File | Contents |",
        "|---|---|",
        "| `coin_analytics.csv` | Per-coin metrics: CAGR, Sharpe, Sortino, vol, drawdown, ATH |",
        "| `category_analytics.csv` | Category-level aggregation |",
        "| `correlation_matrix.csv` | Pairwise return correlations (crypto + macro) |",
        "| `coin_profiles.csv` | Full coin metadata (run export script) |",
        "| `price_panel_wide.csv` | Date × coin price panel (run export script) |",
    ]

    (out / "analytics_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  analytics_report.md", flush=True)


# ── CLI ────────────────────────────────────────────────────────────────────────

def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Compute crypto research analytics (returns, vol, Sharpe, correlation).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--db-path",  type=Path, default=DEFAULT_DB)
    ap.add_argument("--out-dir",  type=Path, default=DEFAULT_OUT)
    ap.add_argument("--top-n",    type=int, default=0,
                    help="Limit per-coin analytics to top-N by rank (0=all).")
    ap.add_argument("--corr-n",   type=int, default=100,
                    help="Number of top coins to include in correlation matrix.")
    ap.add_argument("--skip-corr", action="store_true",
                    help="Skip correlation matrix (slow for large universes).")
    return ap


def main() -> int:
    args   = _parser().parse_args()
    pd, np = _require_pandas()

    if not args.db_path.exists():
        print(f"ERROR: database not found: {args.db_path}", file=sys.stderr)
        print("Run crypto_research_pipeline.py first.", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[analytics] db={args.db_path}", flush=True)
    print(f"[analytics] out={args.out_dir}", flush=True)

    conn = sqlite3.connect(str(args.db_path))
    try:
        # ── Per-coin metrics ──
        print("\n[1/4] per-coin metrics", flush=True)
        coin_df = compute_coin_analytics(conn, pd, np, args.top_n)
        if not coin_df.empty:
            coin_df.to_csv(args.out_dir / "coin_analytics.csv", index=False)

        # ── Category analytics ──
        print("\n[2/4] category analytics", flush=True)
        cat_df = compute_category_analytics(conn, pd, np)
        if not cat_df.empty:
            cat_df.to_csv(args.out_dir / "category_analytics.csv", index=False)

        # ── Cross-asset correlation ──
        corr_df = pd.DataFrame()
        if not args.skip_corr:
            print("\n[3/4] cross-asset correlation", flush=True)
            corr_df = compute_correlation_matrix(conn, pd, np, args.corr_n)
            if not corr_df.empty:
                corr_df.to_csv(args.out_dir / "correlation_matrix.csv")
        else:
            print("\n[3/4] correlation  [skipped]", flush=True)

        # ── Report ──
        print("\n[4/4] analytics report", flush=True)
        write_analytics_report(args.out_dir, coin_df, cat_df, corr_df, pd, np)

    finally:
        conn.close()

    print(f"\n✅  Analytics complete  →  {args.out_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
