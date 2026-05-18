#!/usr/bin/env python3
"""
Walk-forward benchmark runner (offline-first).

Goal: pick a strategy per instrument based on out-of-sample performance,
without forcing a single strategy across markets.

This intentionally stays simple: it uses only OHLCV-like daily bars derived
from the local Refinitiv patch panel (or tidy panel if present).
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Tuple

import numpy as np
import pandas as pd

import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from data_tools.feature_store import load_market_panel_any  # noqa: E402


@dataclass(frozen=True)
class Metrics:
    cagr: float
    sharpe: float
    max_drawdown: float
    turnover: float
    final_equity: float


def _to_returns(price: pd.Series) -> pd.Series:
    return price.pct_change(fill_method=None).fillna(0.0)


def _max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    dd = equity / equity.cummax() - 1.0
    return float(dd.min())


def _metrics_from_pnl(pnl: pd.Series, positions: pd.Series, cost_bps: float) -> Metrics:
    pnl = pnl.fillna(0.0)
    equity = (1.0 + pnl).cumprod()
    if equity.empty:
        return Metrics(0.0, 0.0, 0.0, 0.0, 1.0)

    # Turnover = avg abs change in position
    pos = positions.fillna(0.0)
    turnover = float(pos.diff().abs().fillna(0.0).mean())

    # Apply simple cost model: bps per unit turnover
    cost = turnover * (cost_bps / 1e4)
    pnl_after = pnl - cost
    equity_after = (1.0 + pnl_after).cumprod()

    n = len(pnl_after)
    cagr = float(equity_after.iloc[-1] ** (252.0 / max(n, 1)) - 1.0) if n > 1 else 0.0
    vol = float(pnl_after.std(ddof=0) * np.sqrt(252.0)) if n > 2 else 0.0
    sharpe = float((pnl_after.mean() * 252.0) / vol) if vol > 0 else 0.0
    return Metrics(
        cagr=cagr,
        sharpe=sharpe,
        max_drawdown=_max_drawdown(equity_after),
        turnover=turnover,
        final_equity=float(equity_after.iloc[-1]),
    )


def strat_trend(
    price: pd.Series,
    fast: int = 20,
    slow: int = 100,
    vol_target: float = 0.20,
    max_leverage: float = 1.0,
) -> Tuple[pd.Series, pd.Series]:
    """
    Trend-following with volatility targeting.
    position in [0, 1] (long-only); vol target scales exposure.
    """
    ret = _to_returns(price)
    fast_ma = price.rolling(fast, min_periods=max(5, fast // 4)).mean()
    slow_ma = price.rolling(slow, min_periods=max(10, slow // 4)).mean()
    raw = (fast_ma > slow_ma).astype(float)

    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=1.5).fillna(0.0)
    pos = (raw * scale).clip(0.0, max_leverage)

    pnl = pos.shift(1).fillna(0.0) * ret
    return pnl, pos


def strat_mean_reversion(
    price: pd.Series,
    lookback: int = 14,
    vol_target: float = 0.15,
    max_leverage: float = 1.0,
) -> Tuple[pd.Series, pd.Series]:
    """
    Simple RSI-style mean reversion: long when oversold; flat otherwise.
    """
    ret = _to_returns(price)
    delta = price.diff()
    gain = delta.where(delta > 0, 0.0).rolling(lookback).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(lookback).mean()
    rs = (gain / loss).replace([np.inf, -np.inf], np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))

    raw = (rsi < 30.0).astype(float)
    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=1.5).fillna(0.0)
    pos = (raw * scale).clip(0.0, max_leverage)
    pnl = pos.shift(1).fillna(0.0) * ret
    return pnl, pos


def strat_breakout(
    price: pd.Series,
    lookback: int = 55,
    vol_target: float = 0.20,
    max_leverage: float = 1.0,
) -> Tuple[pd.Series, pd.Series]:
    """
    Donchian breakout long-only: long when close breaks above prior high.
    """
    ret = _to_returns(price)
    prior_high = price.rolling(lookback, min_periods=max(10, lookback // 3)).max().shift(1)
    raw = (price > prior_high).astype(float)
    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=1.5).fillna(0.0)
    pos = (raw * scale).clip(0.0, max_leverage)
    pnl = pos.shift(1).fillna(0.0) * ret
    return pnl, pos


StrategyFn = Callable[[pd.Series], Tuple[pd.Series, pd.Series]]


def walk_forward_select(
    price: pd.Series,
    strategies: Dict[str, StrategyFn],
    train_days: int = 252,
    test_days: int = 63,
    cost_bps: float = 5.0,
    min_history: int = 50,
) -> Tuple[str, str, Metrics, Dict[str, int], pd.Series]:
    """
    Rolling walk-forward:
      - choose strategy on train window by sharpe - 0.1*turnover
      - score on subsequent test window
    """
    price = price.dropna()
    if len(price) < train_days + test_days + min_history:
        return "insufficient_data", "insufficient_data", Metrics(0.0, 0.0, 0.0, 0.0, 1.0), {}, pd.Series(dtype=float)

    test_pnls = []
    test_positions = []
    chosen_counts: Dict[str, int] = {}

    idx = price.index
    start = 0
    while start + train_days + test_days <= len(idx):
        train_slice = idx[start : start + train_days]
        test_slice = idx[start + train_days : start + train_days + test_days]

        train_price = price.loc[train_slice]
        test_price = price.loc[test_slice]

        scores = []
        for name, fn in strategies.items():
            train_pnl, train_pos = fn(train_price)
            m = _metrics_from_pnl(train_pnl, train_pos, cost_bps=cost_bps)
            score = m.sharpe - 0.1 * m.turnover
            scores.append((score, name))

        scores.sort(reverse=True)
        chosen = scores[0][1] if scores else "none"
        chosen_counts[chosen] = chosen_counts.get(chosen, 0) + 1

        test_pnl, test_pos = strategies[chosen](test_price)
        test_pnls.append(test_pnl)
        test_positions.append(test_pos)

        start += test_days

    pnl_all = pd.concat(test_pnls).sort_index() if test_pnls else pd.Series(dtype=float)
    pos_all = pd.concat(test_positions).sort_index() if test_positions else pd.Series(dtype=float)
    final_metrics = _metrics_from_pnl(pnl_all, pos_all, cost_bps=cost_bps)

    best_strategy = max(chosen_counts.items(), key=lambda kv: kv[1])[0] if chosen_counts else "none"
    return "walk_forward", best_strategy, final_metrics, chosen_counts, pnl_all


def load_prices(panel: pd.DataFrame, tickers: Iterable[str]) -> Dict[str, pd.Series]:
    if not {"Instrument", "Date", "Price_Close"}.issubset(set(panel.columns)):
        raise ValueError("Expected tidy panel with Instrument, Date, Price_Close.")

    panel = panel.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    panel["Date"] = pd.to_datetime(panel["Date"], errors="coerce")
    panel = panel.dropna(subset=["Date"])
    panel["Price_Close"] = pd.to_numeric(panel["Price_Close"], errors="coerce")
    panel = panel.dropna(subset=["Price_Close"])

    out: Dict[str, pd.Series] = {}
    for ticker in tickers:
        sub = panel[panel["Instrument"].astype(str) == str(ticker)].copy()
        if sub.empty:
            continue
        sub = sub.sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
        s = pd.Series(sub["Price_Close"].to_numpy(), index=sub["Date"])
        out[str(ticker)] = s
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Walk-forward benchmark strategies (offline).")
    parser.add_argument("--panel", type=Path, default=None, help="Optional tidy panel CSV to use")
    parser.add_argument("--tickers", nargs="*", default=[], help="Tickers/instruments to evaluate (default: auto-detect)")
    parser.add_argument("--train-days", type=int, default=252)
    parser.add_argument("--test-days", type=int, default=63)
    parser.add_argument("--cost-bps", type=float, default=5.0, help="Transaction cost in bps per unit turnover")
    parser.add_argument("--min-days", type=int, default=500, help="Minimum history length to include")
    parser.add_argument("--save-equity", action="store_true", help="Write per-ticker equity curve CSVs")
    parser.add_argument("--out", type=Path, default=Path("backtests/outputs/benchmark_results.csv"))
    args = parser.parse_args()

    if args.panel is not None:
        panel = pd.read_csv(args.panel, parse_dates=["Date"])
    else:
        panel = load_market_panel_any(BASE_DIR / "From-refinitiv")
    all_tickers = sorted(set(panel["Instrument"].astype(str))) if "Instrument" in panel.columns else []
    tickers = args.tickers or all_tickers

    prices = load_prices(panel, tickers)
    if not prices:
        print("No tickers found with usable prices.")
        return 1

    strategies: Dict[str, StrategyFn] = {}
    for fast, slow in [(10, 50), (20, 100), (50, 200)]:
        strategies[f"trend_{fast}_{slow}"] = lambda p, f=fast, s=slow: strat_trend(p, fast=f, slow=s, vol_target=0.20)
    for lookback in [20, 55, 100]:
        strategies[f"breakout_{lookback}"] = lambda p, lb=lookback: strat_breakout(p, lookback=lb, vol_target=0.20)
    for lb in [7, 14, 21]:
        strategies[f"meanrev_rsi{lb}"] = lambda p, lb_=lb: strat_mean_reversion(p, lookback=lb_, vol_target=0.15)

    rows = []
    for ticker, series in prices.items():
        if series.dropna().shape[0] < args.min_days:
            continue

        method, best_strategy, metrics, chosen_counts, pnl_oos = walk_forward_select(
            series,
            strategies=strategies,
            train_days=args.train_days,
            test_days=args.test_days,
            cost_bps=args.cost_bps,
        )

        if args.save_equity and not pnl_oos.empty:
            equity = (1.0 + pnl_oos.fillna(0.0)).cumprod()
            safe = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in ticker)
            out_path = args.out.parent / f"equity_{safe}.csv"
            equity.to_csv(out_path, header=["equity"])

        rows.append(
            {
                "ticker": ticker,
                "method": method,
                "best_strategy": best_strategy,
                "cagr": metrics.cagr,
                "sharpe": metrics.sharpe,
                "max_drawdown": metrics.max_drawdown,
                "turnover": metrics.turnover,
                "final_equity": metrics.final_equity,
                "n_days": int(series.dropna().shape[0]),
                "selections": dict(sorted(chosen_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
            }
        )

    out = pd.DataFrame(rows).sort_values(["sharpe", "cagr"], ascending=False)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False)
    print(f"✅ Wrote benchmark results to {args.out}")
    print(out.head(10).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
