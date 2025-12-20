#!/usr/bin/env python3
"""
Cross-sectional long/short backtest on tidy Refinitiv panel.

Strategy:
- Universe: user-specified tickers with sufficient coverage.
- Compute 60-day momentum and 20-day realized vol.
- Each day, long top N momentum, short bottom N momentum.
- Weights inverse to vol, normalized to be approximately market-neutral.

Outputs: equity curve CSV in backtests/outputs/equity_curve_ls.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
PANEL_CSV = BASE_DIR / "From-refinitiv" / "3_Market_Panel_Data (1).csv"
OUTPUT_PATH = BASE_DIR / "backtests" / "outputs" / "equity_curve_ls.csv"


def load_tidy_panel(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["Date"])


def backtest_ls(panel: pd.DataFrame, tickers, lookback_mom: int = 60, lookback_vol: int = 20, top_n: int = 2) -> dict:
    sub = panel[panel["Instrument"].isin(tickers)].copy()
    if sub.empty:
        raise ValueError("No data for selected tickers.")

    # Remove duplicate rows per date/instrument if any
    sub = sub.drop_duplicates(subset=["Date", "Instrument"], keep="last")

    # pivot prices
    prices = sub.pivot(index="Date", columns="Instrument", values="Price_Close").sort_index()
    rets = prices.pct_change()

    # momentum and vol
    mom = prices / prices.shift(lookback_mom) - 1
    vol = rets.rolling(lookback_vol).std() * np.sqrt(252)

    common_index = prices.index
    pnl = []
    for dt in common_index:
        if dt not in mom.index:
            continue
        mrow = mom.loc[dt]
        vrow = vol.loc[dt]
        priceret = rets.shift(-1).loc[dt]  # apply weights to next-day return

        if priceret.isna().all():
            pnl.append((dt, 0.0))
            continue

        mrow = mrow.dropna()
        vrow = vrow.reindex(mrow.index)
        priceret = priceret.reindex(mrow.index)

        if len(mrow) < top_n * 2:
            pnl.append((dt, 0.0))
            continue

        longs = mrow.nlargest(top_n).index
        shorts = mrow.nsmallest(top_n).index

        wl = (1 / vrow.reindex(longs)).replace([np.inf, -np.inf], np.nan)
        ws = (1 / vrow.reindex(shorts)).replace([np.inf, -np.inf], np.nan)
        wl = wl / wl.sum() if wl.sum() != 0 else wl
        ws = ws / ws.sum() if ws.sum() != 0 else ws

        # target gross 1.0: 0.5 long, 0.5 short
        wl = wl * 0.5
        ws = ws * -0.5

        weights = pd.concat([wl, ws])
        weights = weights.reindex(priceret.index).fillna(0)

        day_pnl = float((weights * priceret).sum())
        pnl.append((dt, day_pnl))

    pnl_series = pd.Series({d: v for d, v in pnl}).sort_index().fillna(0)
    equity = (1 + pnl_series).cumprod()
    cagr = equity.iloc[-1] ** (252 / len(equity)) - 1 if len(equity) > 0 else 0
    drawdown = equity / equity.cummax() - 1
    max_dd = drawdown.min() if not drawdown.empty else 0.0

    return {
        "equity": equity,
        "pnl": pnl_series,
        "cagr": float(cagr),
        "max_dd": float(max_dd),
        "final_equity": float(equity.iloc[-1]) if not equity.empty else 1.0,
    }


def main():
    parser = argparse.ArgumentParser(description="Cross-sectional LS backtest on Refinitiv tidy panel.")
    parser.add_argument("--tickers", nargs="+", default=["AAPL.O", "MSFT.O", "NVDA.O", "TSLA.O"], help="Tickers to include")
    parser.add_argument("--lookback-mom", type=int, default=60)
    parser.add_argument("--lookback-vol", type=int, default=20)
    parser.add_argument("--top-n", type=int, default=2)
    args = parser.parse_args()

    panel = load_tidy_panel(PANEL_CSV)
    result = backtest_ls(panel, args.tickers, args.lookback_mom, args.lookback_vol, args.top_n)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result["equity"].to_csv(OUTPUT_PATH)

    print(f"Final Equity: {result['final_equity']:.3f}")
    print(f"CAGR (approx): {result['cagr']:.3%}")
    print(f"Max Drawdown: {result['max_dd']:.2%}")
    print(f"Equity curve saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
