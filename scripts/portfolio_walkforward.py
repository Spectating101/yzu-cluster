#!/usr/bin/env python3
"""
Portfolio-level walk-forward backtest (offline-first).

This converts the per-instrument "let the market choose the strategy"
idea into an actual portfolio:
  - For each instrument, select a strategy in rolling walk-forward fashion.
  - Convert selected strategy -> daily position series (0..1 long-only).
  - Combine instruments using inverse-vol risk weights.
  - Apply simple turnover-based cost model.

Inputs:
  - A tidy panel CSV with columns: Instrument, Date, Price_Close, Volume(optional)
    (e.g. `data_lake/yfinance_panel.csv` from `fetch_yfinance_tidy_panel.py`)

Outputs:
  - portfolio_equity.csv
  - portfolio_returns.csv
  - portfolio_summary.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np
import pandas as pd

import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))


@dataclass(frozen=True)
class Summary:
    start: str
    end: str
    n_days: int
    n_instruments: int
    cagr: float
    sharpe: float
    max_drawdown: float
    annual_vol: float
    final_equity: float
    avg_gross_exposure: float
    avg_turnover: float


def _to_returns(price: pd.Series) -> pd.Series:
    return price.pct_change(fill_method=None).fillna(0.0)


def _max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    dd = equity / equity.cummax() - 1.0
    return float(dd.min())


def strat_trend(
    price: pd.Series,
    fast: int,
    slow: int,
    vol_target: float,
    max_leverage: float,
    allow_short: bool,
) -> pd.Series:
    ret = _to_returns(price)
    fast_ma = price.rolling(fast, min_periods=max(5, fast // 4)).mean()
    slow_ma = price.rolling(slow, min_periods=max(10, slow // 4)).mean()
    if allow_short:
        raw = pd.Series(np.where(fast_ma > slow_ma, 1.0, -1.0), index=price.index)
    else:
        raw = (fast_ma > slow_ma).astype(float)
    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=max_leverage).fillna(0.0)
    if allow_short:
        return (raw * scale).clip(-max_leverage, max_leverage)
    return (raw * scale).clip(0.0, max_leverage)


def strat_breakout(
    price: pd.Series,
    lookback: int,
    vol_target: float,
    max_leverage: float,
    allow_short: bool,
) -> pd.Series:
    ret = _to_returns(price)
    prior_high = price.rolling(lookback, min_periods=max(10, lookback // 3)).max().shift(1)
    if allow_short:
        prior_low = price.rolling(lookback, min_periods=max(10, lookback // 3)).min().shift(1)
        raw = pd.Series(np.where(price > prior_high, 1.0, np.where(price < prior_low, -1.0, 0.0)), index=price.index)
    else:
        raw = (price > prior_high).astype(float)
    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=max_leverage).fillna(0.0)
    if allow_short:
        return (raw * scale).clip(-max_leverage, max_leverage)
    return (raw * scale).clip(0.0, max_leverage)


def strat_meanrev_rsi(
    price: pd.Series,
    lookback: int,
    vol_target: float,
    max_leverage: float,
    allow_short: bool,
) -> pd.Series:
    ret = _to_returns(price)
    delta = price.diff()
    gain = delta.where(delta > 0, 0.0).rolling(lookback).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(lookback).mean()
    rs = (gain / loss).replace([np.inf, -np.inf], np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    if allow_short:
        raw = pd.Series(np.where(rsi < 30.0, 1.0, np.where(rsi > 70.0, -1.0, 0.0)), index=price.index)
    else:
        raw = (rsi < 30.0).astype(float)
    vol = ret.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    scale = (vol_target / vol).clip(lower=0.0, upper=max_leverage).fillna(0.0)
    if allow_short:
        return (raw * scale).clip(-max_leverage, max_leverage)
    return (raw * scale).clip(0.0, max_leverage)


def available_strategies(vol_target: float, max_leverage: float, allow_short: bool) -> Dict[str, callable]:
    out: Dict[str, callable] = {}
    for fast, slow in [(10, 50), (20, 100), (50, 200)]:
        out[f"trend_{fast}_{slow}"] = lambda p, f=fast, s=slow: strat_trend(p, f, s, vol_target, max_leverage, allow_short)
    for lb in [20, 55, 100]:
        out[f"breakout_{lb}"] = lambda p, lb_=lb: strat_breakout(p, lb_, vol_target, max_leverage, allow_short)
    for lb in [7, 14, 21]:
        out[f"meanrev_rsi{lb}"] = lambda p, lb_=lb: strat_meanrev_rsi(p, lb_, vol_target * 0.75, max_leverage, allow_short)
    return out


def available_strategies_preset(preset: str, vol_target: float, max_leverage: float, allow_short: bool) -> Dict[str, callable]:
    preset = (preset or "full").strip().lower()
    if preset == "small":
        return {
            "trend_20_100": lambda p: strat_trend(p, 20, 100, vol_target, max_leverage, allow_short),
            "breakout_55": lambda p: strat_breakout(p, 55, vol_target, max_leverage, allow_short),
            "meanrev_rsi14": lambda p: strat_meanrev_rsi(p, 14, vol_target * 0.75, max_leverage, allow_short),
        }
    return available_strategies(vol_target=vol_target, max_leverage=max_leverage, allow_short=allow_short)


def _score_train(pnl: pd.Series, position: pd.Series, cost_bps: float) -> float:
    pnl = pnl.fillna(0.0)
    vol = float(pnl.std(ddof=0) * np.sqrt(252.0)) if len(pnl) > 2 else 0.0
    sharpe = float((pnl.mean() * 252.0) / vol) if vol > 0 else 0.0
    turnover = float(position.diff().abs().fillna(0.0).mean())
    # Penalize turnover (transaction costs proxy)
    return sharpe - 0.1 * turnover - (turnover * (cost_bps / 1e4))


def walk_forward_positions(
    price: pd.Series,
    train_days: int,
    test_days: int,
    cost_bps: float,
    vol_target: float,
    max_leverage: float,
    strategy_preset: str = "full",
    allow_short: bool = False,
) -> Tuple[pd.Series, Dict[str, int]]:
    strategies = available_strategies_preset(strategy_preset, vol_target=vol_target, max_leverage=max_leverage, allow_short=allow_short)
    price = price.dropna()
    if len(price) < train_days + test_days + 50:
        return pd.Series(dtype=float), {}

    counts: Dict[str, int] = {}
    positions = []

    idx = price.index
    start = 0
    while start + train_days + test_days <= len(idx):
        train_slice = idx[start : start + train_days]
        test_slice = idx[start + train_days : start + train_days + test_days]
        train_price = price.loc[train_slice]
        test_price = price.loc[test_slice]

        best = None
        best_score = -1e9
        for name, fn in strategies.items():
            pos_train = fn(train_price)
            pnl_train = pos_train.shift(1).fillna(0.0) * _to_returns(train_price)
            score = _score_train(pnl_train, pos_train, cost_bps=cost_bps)
            if score > best_score:
                best_score = score
                best = name

        if best is None:
            start += test_days
            continue

        counts[best] = counts.get(best, 0) + 1
        pos_test = strategies[best](test_price)
        positions.append(pos_test)
        start += test_days

    pos_all = pd.concat(positions).sort_index().fillna(0.0) if positions else pd.Series(dtype=float)
    return pos_all, counts


def load_prices(panel_csv: Path, tickers: Iterable[str]) -> Dict[str, pd.Series]:
    panel = pd.read_csv(panel_csv, parse_dates=["Date"])
    if not {"Instrument", "Date", "Price_Close"}.issubset(set(panel.columns)):
        raise ValueError("Panel must include Instrument, Date, Price_Close")

    panel = panel.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    panel["Price_Close"] = pd.to_numeric(panel["Price_Close"], errors="coerce")
    panel = panel.dropna(subset=["Price_Close"])

    out: Dict[str, pd.Series] = {}
    for t in tickers:
        sub = panel[panel["Instrument"].astype(str) == str(t)].copy()
        if sub.empty:
            continue
        sub = sub.sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
        s = pd.Series(sub["Price_Close"].to_numpy(), index=pd.to_datetime(sub["Date"]))
        out[str(t)] = s
    return out


def portfolio_backtest(
    prices: Dict[str, pd.Series],
    train_days: int,
    test_days: int,
    cost_bps: float,
    vol_target: float,
    max_leverage: float,
    max_names: int,
    strategy_preset: str = "full",
    allow_short: bool = False,
) -> Tuple[pd.Series, pd.DataFrame, Dict[str, Dict[str, int]]]:
    # Build per-instrument positions (walk-forward selection)
    positions: Dict[str, pd.Series] = {}
    selections: Dict[str, Dict[str, int]] = {}
    for ticker, series in prices.items():
        pos, counts = walk_forward_positions(
            series,
            train_days=train_days,
            test_days=test_days,
            cost_bps=cost_bps,
            vol_target=vol_target,
            max_leverage=max_leverage,
            strategy_preset=strategy_preset,
            allow_short=allow_short,
        )
        if pos.empty:
            continue
        positions[ticker] = pos
        selections[ticker] = counts

    if not positions:
        return pd.Series(dtype=float), pd.DataFrame(), {}

    # Align position index and returns index
    all_index = sorted(set().union(*[p.index for p in positions.values()]))
    all_index = pd.DatetimeIndex(all_index).sort_values()

    # Build returns matrix
    returns = {}
    for ticker, series in prices.items():
        if ticker not in positions:
            continue
        s = series.reindex(all_index).ffill()
        returns[ticker] = _to_returns(s)
    ret_df = pd.DataFrame(returns).fillna(0.0)

    # Positions matrix (0..max_leverage)
    pos_df = pd.DataFrame({t: positions[t].reindex(all_index).fillna(0.0) for t in positions})

    # Keep top-N most liquid/available names by coverage (proxy for tradability)
    if max_names and pos_df.shape[1] > max_names:
        coverage = pos_df.ne(0.0).sum().sort_values(ascending=False)
        keep = coverage.head(max_names).index.tolist()
        pos_df = pos_df[keep]
        ret_df = ret_df[keep]

    # Risk weights: inverse trailing vol, normalized daily
    trailing_vol = ret_df.rolling(20, min_periods=10).std(ddof=0).replace(0.0, np.nan)
    inv_vol = (1.0 / trailing_vol).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    raw_w = inv_vol.div(inv_vol.sum(axis=1).replace(0.0, np.nan), axis=0).fillna(0.0)

    # Gross exposure = sum(weights * position)
    gross_expo = (raw_w * pos_df.abs()).sum(axis=1).clip(lower=0.0)
    scaled_w = raw_w.copy()
    # Scale weights so gross exposure targets ~1.0 (or max_leverage across portfolio)
    target = 1.0
    scale = (target / gross_expo).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, max_leverage)
    scaled_w = scaled_w.mul(scale, axis=0)

    pnl_gross = (scaled_w * pos_df.shift(1).fillna(0.0) * ret_df).sum(axis=1)

    # Cost: turnover in per-name effective exposure
    effective_expo = (scaled_w * pos_df).fillna(0.0)
    turnover = effective_expo.diff().abs().sum(axis=1).fillna(0.0)
    costs = turnover * (cost_bps / 1e4)
    pnl = pnl_gross - costs

    # Outputs useful for diagnostics
    diag = pd.DataFrame(
        {
            "pnl": pnl,
            "pnl_gross": pnl_gross,
            "costs": costs,
            "gross_exposure": (effective_expo.abs().sum(axis=1)).fillna(0.0),
            "turnover": turnover,
        }
    )
    return pnl, diag, selections


def summarize(pnl: pd.Series, diag: pd.DataFrame) -> Summary:
    pnl = pnl.fillna(0.0)
    equity = (1.0 + pnl).cumprod()
    n = len(pnl)
    if n < 2:
        return Summary("", "", n, 0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)

    vol = float(pnl.std(ddof=0) * np.sqrt(252.0))
    sharpe = float((pnl.mean() * 252.0) / vol) if vol > 0 else 0.0
    cagr = float(equity.iloc[-1] ** (252.0 / n) - 1.0)
    return Summary(
        start=str(equity.index.min().date()),
        end=str(equity.index.max().date()),
        n_days=int(n),
        n_instruments=int(diag.shape[1]) if diag is not None else 0,
        cagr=float(cagr),
        sharpe=float(sharpe),
        max_drawdown=_max_drawdown(equity),
        annual_vol=float(vol),
        final_equity=float(equity.iloc[-1]),
        avg_gross_exposure=float(diag["gross_exposure"].mean()) if "gross_exposure" in diag else 0.0,
        avg_turnover=float(diag["turnover"].mean()) if "turnover" in diag else 0.0,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Portfolio walk-forward backtest.")
    parser.add_argument("--panel", type=Path, required=True, help="Tidy panel CSV (Instrument, Date, Price_Close)")
    parser.add_argument("--tickers", nargs="*", default=[], help="Tickers to include (default: all in panel)")
    parser.add_argument("--train-days", type=int, default=252)
    parser.add_argument("--test-days", type=int, default=63)
    parser.add_argument("--cost-bps", type=float, default=8.0)
    parser.add_argument("--vol-target", type=float, default=0.20)
    parser.add_argument("--max-leverage", type=float, default=1.0)
    parser.add_argument("--max-names", type=int, default=30)
    parser.add_argument("--strategy-preset", choices=["small", "full"], default="full")
    parser.add_argument("--allow-short", action="store_true", help="Allow short signals (trend, breakout, RSI)")
    parser.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/portfolio_walkforward"))
    args = parser.parse_args()

    panel_df = pd.read_csv(args.panel, parse_dates=["Date"])
    universe = sorted(set(panel_df["Instrument"].astype(str))) if not args.tickers else [str(t) for t in args.tickers]

    prices = load_prices(args.panel, universe)
    pnl, diag, selections = portfolio_backtest(
        prices,
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
        print("No portfolio pnl produced (insufficient data).")
        return 1

    equity = (1.0 + pnl.fillna(0.0)).cumprod()
    s = summarize(pnl, diag)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    equity.to_csv(args.out_dir / "portfolio_equity.csv", header=["equity"])
    diag.to_csv(args.out_dir / "portfolio_returns.csv", index=True)
    (args.out_dir / "portfolio_selections.json").write_text(json.dumps(selections, indent=2, default=str))
    (args.out_dir / "portfolio_summary.json").write_text(json.dumps(asdict(s), indent=2))

    print(f"✅ Wrote portfolio outputs to {args.out_dir}")
    print(json.dumps(asdict(s), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
