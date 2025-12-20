#!/usr/bin/env python3
"""
Generate a lightweight analytics pack (factors per ticker) from the Refinitiv panel.

Outputs:
  data_lake/analytics_pack/factors_{ticker}.parquet (and .csv)

Usage:
  python scripts/analytics_pack.py --tickers AAPL.OQ MSFT.O NVDA.O
"""

from pathlib import Path
import sys
import argparse

import pandas as pd

# Ensure local imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_tools.feature_store import (
    DEFAULT_OUT,
    DEFAULT_SOURCE,
    load_panel,
    compute_basic_factors,
)


def load_panel_any(parquet_path: Path, csv_path: Path) -> pd.DataFrame:
    if parquet_path.exists():
        return pd.read_parquet(parquet_path)
    if csv_path.exists():
        return load_panel(csv_path)
    raise FileNotFoundError("No panel found (parquet or CSV). Run refinitiv_feature_store first.")


def main():
    parser = argparse.ArgumentParser(description="Generate factor analytics pack for given tickers.")
    parser.add_argument(
        "--tickers",
        nargs="+",
        default=["AAPL.OQ", "MSFT.O", "NVDA.O"],
        help="Tickers to process (match column substrings)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data_lake/analytics_pack"),
        help="Output directory",
    )
    args = parser.parse_args()

    panel = load_panel_any(
        DEFAULT_OUT / "RESCUED_Full_Market_Data_20251215.parquet",
        DEFAULT_SOURCE / "RESCUED_Full_Market_Data_20251215.csv",
    )

    args.out.mkdir(parents=True, exist_ok=True)

    for ticker in args.tickers:
        cols = [c for c in panel.columns if ticker in c]
        if not cols:
            print(f"⚠️ No columns found for ticker {ticker}, skipping.")
            continue
        sub = panel[cols]
        factors = compute_basic_factors(sub, ticker_hint=ticker)
        if factors.empty:
            print(f"⚠️ No factors computed for {ticker}, skipping.")
            continue
        out_base = args.out / f"factors_{ticker.replace('.', '_')}"
        factors.to_parquet(out_base.with_suffix(".parquet"))
        factors.to_csv(out_base.with_suffix(".csv"))
        print(f"✅ Factors saved for {ticker}: {factors.shape}, -> {out_base}.[parquet|csv]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
