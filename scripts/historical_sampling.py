#!/usr/bin/env python3
"""
Historical window sampling for robustness.

Given a tidy panel, repeatedly sample random contiguous windows and run the
portfolio walk-forward backtest on each window. This helps answer:
  "Does this only work in one lucky era?"
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd

import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.portfolio_walkforward import (  # noqa: E402
    load_prices,
    portfolio_backtest,
    summarize,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Random window sampling robustness check.")
    parser.add_argument("--panel", type=Path, required=True)
    parser.add_argument("--tickers", nargs="*", default=[])
    parser.add_argument("--samples", type=int, default=50)
    parser.add_argument("--window-days", type=int, default=252 * 5)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--train-days", type=int, default=252)
    parser.add_argument("--test-days", type=int, default=63)
    parser.add_argument("--cost-bps", type=float, default=8.0)
    parser.add_argument("--vol-target", type=float, default=0.20)
    parser.add_argument("--max-leverage", type=float, default=1.0)
    parser.add_argument("--max-names", type=int, default=30)
    parser.add_argument("--strategy-preset", choices=["small", "full"], default="small")
    parser.add_argument("--allow-short", action="store_true")
    parser.add_argument("--out", type=Path, default=Path("backtests/outputs/window_sampling.json"))
    args = parser.parse_args()

    panel = pd.read_csv(args.panel, parse_dates=["Date"])
    if not {"Instrument", "Date", "Price_Close"}.issubset(set(panel.columns)):
        raise ValueError("Panel must include Instrument, Date, Price_Close")

    tickers = [str(t) for t in args.tickers] if args.tickers else sorted(set(panel["Instrument"].astype(str)))

    # Choose a global date range that has enough coverage
    all_dates = pd.to_datetime(panel["Date"], errors="coerce").dropna().sort_values().unique()
    if len(all_dates) < args.window_days + args.train_days + args.test_days:
        print("Not enough dates in panel for requested window sizing.")
        return 1

    rng = np.random.default_rng(args.seed)
    max_start = len(all_dates) - args.window_days
    start_indices = rng.integers(0, max_start, size=args.samples)

    # Precompute full price series once to avoid repeated parsing/IO.
    # (Build in-memory with the same logic as load_prices.)
    panel = panel.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    panel["Date"] = pd.to_datetime(panel["Date"], errors="coerce")
    panel = panel.dropna(subset=["Date"])
    panel["Price_Close"] = pd.to_numeric(panel["Price_Close"], errors="coerce")
    panel = panel.dropna(subset=["Price_Close"])

    prices_full = {}
    for t in tickers:
        sub = panel[panel["Instrument"].astype(str) == str(t)].copy()
        if sub.empty:
            continue
        sub = sub.sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
        prices_full[str(t)] = pd.Series(sub["Price_Close"].to_numpy(), index=sub["Date"])

    results: List[dict] = []
    for i, start_idx in enumerate(start_indices, start=1):
        start_date = pd.Timestamp(all_dates[start_idx])
        end_date = pd.Timestamp(all_dates[start_idx + args.window_days - 1])

        prices_window = {}
        for t, s in prices_full.items():
            sw = s[(s.index >= start_date) & (s.index <= end_date)].copy()
            if not sw.empty:
                prices_window[t] = sw

        pnl, diag, _ = portfolio_backtest(
            prices_window,
            train_days=args.train_days,
            test_days=args.test_days,
            cost_bps=args.cost_bps,
            vol_target=args.vol_target,
            max_leverage=args.max_leverage,
            max_names=args.max_names,
            strategy_preset=args.strategy_preset,
            allow_short=args.allow_short,
        )
        if pnl.empty:
            continue

        s = summarize(pnl, diag)
        row = asdict(s)
        row["window_start"] = str(pd.Timestamp(start_date).date())
        row["window_end"] = str(pd.Timestamp(end_date).date())
        results.append(row)

    if not results:
        print("No samples produced results.")
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    params = {k: (str(v) if isinstance(v, Path) else v) for k, v in vars(args).items()}
    args.out.write_text(json.dumps({"params": params, "samples": results}, indent=2))
    df = pd.DataFrame(results)
    print(f"✅ Wrote sampling results to {args.out}")
    print(df[["window_start", "window_end", "cagr", "sharpe", "max_drawdown"]].head(10).to_string(index=False))
    print("Summary:")
    print(df[["cagr", "sharpe", "max_drawdown"]].describe().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
