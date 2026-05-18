#!/usr/bin/env python3
"""
Generate next-period cross-sectional signals from a tidy panel.

This does NOT place trades. It outputs a suggested long/short weight vector
based on momentum ranks and optional inverse-vol weighting.

Example:
  python scripts/generate_cs_signals.py --panel data_lake/yfinance_panel_large.csv \\
    --universe crypto --lookback 20 --top-n 3 --bottom-n 3 --invvol \\
    --out backtests/outputs/signals_crypto.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def load_prices(panel_csv: Path) -> pd.DataFrame:
    panel = pd.read_csv(panel_csv, parse_dates=["Date"])
    panel = panel.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    panel["Instrument"] = panel["Instrument"].astype(str)
    panel["Price_Close"] = pd.to_numeric(panel["Price_Close"], errors="coerce")
    panel = panel.dropna(subset=["Price_Close"])
    prices = panel.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index()
    return prices.ffill()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate cross-sectional signals.")
    parser.add_argument("--panel", type=Path, required=True)
    parser.add_argument("--universe", choices=["all", "equities", "crypto"], default="crypto")
    parser.add_argument("--lookback", type=int, default=20)
    parser.add_argument("--top-n", type=int, default=3)
    parser.add_argument("--bottom-n", type=int, default=3)
    parser.add_argument("--invvol", action="store_true")
    parser.add_argument("--out", type=Path, default=Path("backtests/outputs/signals.json"))
    args = parser.parse_args()

    prices = load_prices(args.panel)
    if args.universe == "crypto":
        cols = [c for c in prices.columns if c.endswith("-USD")]
    elif args.universe == "equities":
        cols = [c for c in prices.columns if not c.endswith("-USD")]
    else:
        cols = list(prices.columns)
    prices = prices[cols]

    latest = prices.dropna(how="all").iloc[-1].name
    mom = prices / prices.shift(args.lookback) - 1.0
    score = mom.loc[latest].dropna()
    if score.empty:
        print("No scores available.")
        return 1

    longs = score.nlargest(args.top_n).index
    shorts = score.nsmallest(args.bottom_n).index

    w = pd.Series(0.0, index=score.index)
    if args.invvol:
        rets = prices.pct_change(fill_method=None)
        vol = rets.rolling(20, min_periods=10).std(ddof=0).loc[latest].reindex(score.index)
        inv = (1.0 / vol.replace(0.0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        wl = inv.reindex(longs)
        ws = inv.reindex(shorts)
        wl = wl / wl.sum() if wl.sum() != 0 else wl
        ws = ws / ws.sum() if ws.sum() != 0 else ws
    else:
        wl = pd.Series(1.0 / max(len(longs), 1), index=longs)
        ws = pd.Series(1.0 / max(len(shorts), 1), index=shorts)

    w.loc[longs] = wl * 0.5
    w.loc[shorts] = -ws * 0.5

    payload = {
        "as_of": str(pd.Timestamp(latest).date()),
        "universe": args.universe,
        "lookback": args.lookback,
        "top_n": args.top_n,
        "bottom_n": args.bottom_n,
        "invvol": bool(args.invvol),
        "weights": {k: float(v) for k, v in w[w != 0].sort_values(ascending=False).to_dict().items()},
        "scores": {k: float(v) for k, v in score.sort_values(ascending=False).head(10).to_dict().items()},
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2))
    print(f"✅ Wrote signals to {args.out}")
    print(json.dumps(payload, indent=2)[:800])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

