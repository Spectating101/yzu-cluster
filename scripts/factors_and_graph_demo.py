#!/usr/bin/env python3
"""
Quick demo for Refinitiv feature store utilities:
- Load a panel for a given ticker from the main parquet (or CSV fallback).
- Compute basic factors (skew, term-structure, liquidity).
- Load the supply-chain graph and print simple stats.
"""
from pathlib import Path
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_tools.feature_store import (
    DEFAULT_OUT,
    DEFAULT_SOURCE,
    load_panel,
    compute_basic_factors,
    load_supply_chain_graph,
)


def main():
    # Attempt to use parquet if present, else CSV fallback
    parquet_path = DEFAULT_OUT / "RESCUED_Full_Market_Data_20251215.parquet"
    csv_path = DEFAULT_SOURCE / "RESCUED_Full_Market_Data_20251215.csv"

    if parquet_path.exists():
        df = pd.read_parquet(parquet_path)
    elif csv_path.exists():
        df = load_panel(csv_path)
    else:
        print("No panel found (parquet or CSV). Run refinitiv_feature_store first.")
        return 1

    # Pick a ticker and extract columns
    ticker = "AAPL.OQ"
    ticker_cols = [c for c in df.columns if ticker in c]
    if not ticker_cols:
        print(f"No columns found for ticker {ticker}")
        return 1

    panel = df[ticker_cols]
    factors = compute_basic_factors(panel, ticker_hint=ticker)
    print(f"✅ Loaded panel for {ticker}: {panel.shape[0]} rows, {panel.shape[1]} cols")
    print(f"✅ Factors computed: {list(factors.columns)}")
    print(factors.tail(3))

    # Supply-chain graph
    sc_path = DEFAULT_SOURCE / "DATA_4_SupplyChain_Network.csv"
    try:
        g = load_supply_chain_graph(sc_path)
        print(f"✅ Supply-chain graph: {g.number_of_nodes()} nodes, {g.number_of_edges()} edges")
    except Exception as exc:
        print(f"⚠️ Could not load supply chain graph: {exc}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
