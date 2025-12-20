#!/usr/bin/env python3
"""
Lightweight end-to-end backtest using Refinitiv data + Sharpe toolset.

Features:
- Loads Refinitiv panel (CSV or parquet) and computes basic factors.
- Uses a simple strategy: long if skew + term-structure score is positive.
- Sizing via KellyPositionSizer with caps; regime filter placeholder.
- Outputs equity curve and summary metrics.

This is intentionally compact to run quickly; it's not production-grade,
but exercises factors + Kelly + regime components.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

# Allow relative imports when run from repo root
import sys
ROOT = Path(__file__).resolve().parent.parent
for p in [ROOT, ROOT / "trading"]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from data_tools.feature_store import load_panel, load_tidy_panel, compute_basic_factors_tidy
from core.kelly_position_sizing import KellyPositionSizer


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PANEL_PARQUET = BASE_DIR / "data_lake" / "feature_store" / "RESCUED_Full_Market_Data_20251215.parquet"
DEFAULT_PANEL_CSV = BASE_DIR / "From-refinitiv" / "3_Market_Panel_Data (1).csv"
DEFAULT_COVERAGE = BASE_DIR / "From-refinitiv" / "4_Coverage_Snapshot (1).csv"


def load_panel_any(parquet_path: Path, csv_path: Path) -> pd.DataFrame:
    if parquet_path.exists():
        return pd.read_parquet(parquet_path)
    if csv_path.exists():
        return load_tidy_panel(csv_path)
    raise FileNotFoundError("No panel found (parquet or CSV). Run refinitiv_feature_store first.")


def strategy_signal(price: pd.Series, factors: pd.DataFrame) -> pd.Series:
    """
    Momentum + realized volatility filter:
    - Momentum = 20d return > 0
    - Vol filter = realized_vol_20 below its rolling median (60d)
    """
    mom = price.pct_change(20)
    vol = factors.get("realized_vol_20", pd.Series(index=price.index, data=np.nan))
    vol = vol.ffill()
    vol_median = vol.rolling(60, min_periods=10).median()
    signal = (mom > 0) & (vol < vol_median)
    return signal.fillna(False).astype(float)


def kelly_size(win_rate: float, avg_gain: float, avg_loss: float) -> float:
    kelly = KellyPositionSizer(default_kelly_fraction=0.5, max_position_size=0.2)
    # expects win_rate in percentage
    res = kelly.kelly_position_sizing({
        "T": {
            "win_rate": win_rate * 100,
            "avg_gain": avg_gain,
            "avg_loss": avg_loss,
            "sample_size": 60
        }
    })
    return res["T"]


def backtest(panel: pd.DataFrame, tickers: List[str]) -> Dict:
    pnl_frames = []

    for ticker in tickers:
        sub = panel[panel["Instrument"] == ticker].copy()
        if sub.empty:
            continue
        sub = sub.sort_values("Date")
        price = pd.to_numeric(sub["Price_Close"], errors="coerce")
        price.index = sub["Date"]

        factors = compute_basic_factors_tidy(sub)
        sig = strategy_signal(price, factors)

        # rolling stats for Kelly
        ret = price.pct_change().fillna(0)
        win_rate = (ret > 0).rolling(60).mean().fillna(0.5)
        avg_gain = ret.clip(lower=0).rolling(60).mean().fillna(0.01)
        avg_loss = ret.clip(upper=0).abs().rolling(60).mean().fillna(0.01)

        position = []
        for wr, g, l, s in zip(win_rate, avg_gain, avg_loss, sig):
            size = kelly_size(float(wr), float(g), float(l))
            size = min(size, 0.1)  # cap at 10%
            position.append(size * s)  # long-only
        position = pd.Series(position, index=price.index).fillna(0)

        pnl = position.shift(1) * ret  # apply yesterday's position to today's return
        pnl.name = ticker
        pnl_frames.append(pnl)

    if pnl_frames:
        pnl_df = pd.concat(pnl_frames, axis=1).fillna(0)
        total_pnl = pnl_df.mean(axis=1)
        total_equity = (1 + total_pnl).cumprod()
        eq = total_equity.iloc[-1]
        cagr = total_equity.iloc[-1] ** (252 / len(total_equity)) - 1 if len(total_equity) > 0 else 0
        drawdown = total_equity / total_equity.cummax() - 1
        max_dd = drawdown.min()
    else:
        eq = 1.0
        cagr = 0.0
        max_dd = 0.0
        total_equity = pd.Series(dtype=float)

    return {
        "final_equity": float(eq),
        "cagr": float(cagr),
        "max_drawdown": float(max_dd),
        "equity_curve": total_equity,
    }


def main():
    parser = argparse.ArgumentParser(description="Backtest Sharpe-Renaissance signals on Refinitiv panel.")
    parser.add_argument("--tickers", nargs="+", default=["AAPL.OQ", "MSFT.O", "NVDA.O"], help="Tickers to backtest")
    args = parser.parse_args()

    panel = load_panel_any(DEFAULT_PANEL_PARQUET, DEFAULT_PANEL_CSV)
    result = backtest(panel, args.tickers)

    print(f"Final Equity: {result['final_equity']:.3f}")
    print(f"CAGR (approx): {result['cagr']:.3%}")
    print(f"Max Drawdown: {result['max_drawdown']:.2%}")

    # Save equity curve for inspection
    out_dir = Path("backtests/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)
    result["equity_curve"].to_csv(out_dir / "equity_curve.csv")
    print(f"Equity curve saved to {out_dir/'equity_curve.csv'}")


if __name__ == "__main__":
    main()
