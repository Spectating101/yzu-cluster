#!/usr/bin/env python3
"""
Rolling evaluation vs benchmark for the leveraged-ETF strategy.

Produces a simple consistency report:
  - How often the strategy beats SPY over rolling 1y windows
  - Worst/best windows, drawdowns, and hit-rate for "beat by >= X%"

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

import sys

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from spy_beater_leveraged_runner import load_prices, run_engine  # noqa: E402


def _iter_windows(index: pd.DatetimeIndex, *, window: int, step: int) -> List[Tuple[pd.Timestamp, pd.Timestamp]]:
    idx = pd.DatetimeIndex(index).sort_values()
    out: List[Tuple[pd.Timestamp, pd.Timestamp]] = []
    if len(idx) < window + 5:
        return out
    for end_loc in range(window - 1, len(idx), step):
        start_loc = end_loc - window + 1
        out.append((idx[start_loc], idx[end_loc]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Rolling 1y evaluation vs SPY.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--config-json", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("backtests/outputs/spy_beater/rolling_eval.json"))
    ap.add_argument("--window-bars", type=int, default=252)
    ap.add_argument("--step-bars", type=int, default=21)
    ap.add_argument("--min-excess-final", type=float, default=0.05, help="Beat threshold per window (e.g. 0.05=+5%).")
    args = ap.parse_args()

    cfg = json.loads(args.config_json.read_text())
    prices = load_prices(args.panel).sort_index().ffill()
    if prices.empty:
        print("Empty panel.")
        return 2

    windows = _iter_windows(prices.index, window=int(args.window_bars), step=int(args.step_bars))
    if not windows:
        print("Not enough history for requested window.")
        return 2

    rows: List[Dict[str, Any]] = []
    for start, end in windows:
        sub = prices[(prices.index >= start) & (prices.index <= end)]
        res = run_engine(
            sub,
            benchmark=str(cfg.get("benchmark", "SPY")),
            risky=list(cfg.get("risky", ["UPRO", "TQQQ"])),
            defensive=list(cfg.get("defensive", ["TLT", "IEF", "GLD"])),
            inverse=list(cfg.get("inverse", ["SH", "PSQ"])),
            bear_mode=str(cfg.get("bear_mode", "defensive")),
            top_k_risky=int(cfg.get("top_k_risky", 1)),
            top_k_defensive=int(cfg.get("top_k_defensive", 1)),
            rebalance_every=int(cfg.get("rebalance_every", 1)),
            cash=str(cfg.get("cash", "BIL")),
            core_weight=float(cfg.get("core_weight", 0.0)),
            core_to_cash_when_bear=bool(cfg.get("core_to_cash_when_bear", False)),
            ann_factor=float(cfg.get("ann_factor", 252.0)),
            sma_days=int(cfg.get("sma_days", 200)),
            mom_days=int(cfg.get("mom_days", 63)),
            mom_floor=float(cfg.get("mom_floor", -1e9)),
            require_asset_trend=bool(cfg.get("require_asset_trend", False)),
            allocate_residual_to_cash=bool(cfg.get("allocate_residual_to_cash", False)),
            risk_off_vol_lookback=int(cfg.get("risk_off_vol_lookback", 20)),
            risk_off_vol_max=float(cfg.get("risk_off_vol_max", 0.0)),
            risk_off_crash_days=int(cfg.get("risk_off_crash_days", 5)),
            risk_off_crash_ret=float(cfg.get("risk_off_crash_ret", 0.0)),
            risk_off_cooldown_days=int(cfg.get("risk_off_cooldown_days", 21)),
            cppi_floor_frac=float(cfg.get("cppi_floor_frac", 0.0)),
            cppi_multiplier=float(cfg.get("cppi_multiplier", 0.0)),
            crypto_gate=bool(cfg.get("crypto_gate", False)),
            crypto_trend_sma_days=int(cfg.get("crypto_trend_sma_days", 200)),
            crypto_vol_lookback=int(cfg.get("crypto_vol_lookback", 20)),
            crypto_vol_max=float(cfg.get("crypto_vol_max", 0.0)),
            vol_lookback=int(cfg.get("vol_lookback", 20)),
            target_vol=float(cfg.get("target_vol", 0.18)),
            max_gross=float(cfg.get("max_gross", 1.0)),
            dd_stop=float(cfg.get("dd_stop", 0.15)),
            dd_floor_gross=float(cfg.get("dd_floor_gross", 0.0)),
            port_dd_stop=float(cfg.get("port_dd_stop", 0.0)),
            port_dd_cooldown_days=int(cfg.get("port_dd_cooldown_days", 21)),
            rebalance_threshold=float(cfg.get("rebalance_threshold", 0.10)),
            cost_bps=float(cfg.get("cost_bps", 2.0)),
        )
        if "error" in res:
            continue
        rows.append(
            {
                "start": str(pd.Timestamp(start).date()),
                "end": str(pd.Timestamp(end).date()),
                "excess_final": float(res["active_perf"]["excess_final"]),
                "excess_cagr": float(res["active_perf"]["excess_cagr"]),
                "strategy_mdd": float(res["perf"]["max_drawdown"]),
                "benchmark_mdd": float(res["benchmark_perf"]["max_drawdown"]),
                "strategy_cagr": float(res["perf"]["cagr"]),
                "benchmark_cagr": float(res["benchmark_perf"]["cagr"]),
                "strategy_sharpe": float(res["perf"]["sharpe"]),
                "benchmark_sharpe": float(res["benchmark_perf"]["sharpe"]),
            }
        )

    if not rows:
        print("No windows evaluated.")
        return 2

    df = pd.DataFrame(rows)
    hit = df["excess_final"] >= float(args.min_excess_final)
    summary = {
        "n_windows": int(len(df)),
        "window_bars": int(args.window_bars),
        "step_bars": int(args.step_bars),
        "min_excess_final": float(args.min_excess_final),
        "hit_rate": float(hit.mean()),
        "median_excess_final": float(df["excess_final"].median()),
        "p10_excess_final": float(df["excess_final"].quantile(0.10)),
        "p90_excess_final": float(df["excess_final"].quantile(0.90)),
        "worst_window": df.sort_values("excess_final").iloc[0].to_dict(),
        "best_window": df.sort_values("excess_final").iloc[-1].to_dict(),
    }

    out = {"summary": summary, "windows": rows, "config": cfg}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2) + "\n")

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
