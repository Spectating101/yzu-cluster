#!/usr/bin/env python3
"""
Random sweep tuned to a monthly objective: beat SPY on 21-bar windows.

Fast path:
  - Run the engine ONCE per parameter set to get daily pnl series.
  - Compute rolling monthly "relative equity" windows via log active returns.

Outputs:
  backtests/outputs/spy_beater/monthly_sweep.json
  backtests/outputs/spy_beater/monthly_sweep_best.json  (top config)
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

import sys

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from spy_beater_leveraged_runner import load_prices, run_engine  # noqa: E402


def _rolling_excess_final(pnl: pd.Series, bench: pd.Series, *, window: int) -> pd.Series:
    pnl = pnl.reindex(bench.index).fillna(0.0)
    bench = bench.fillna(0.0)
    # log relative equity: sum(log(1+r_strat) - log(1+r_bench))
    a = np.log1p(pnl) - np.log1p(bench)
    roll = a.rolling(window, min_periods=window).sum()
    return np.expm1(roll)


@dataclass(frozen=True)
class Result:
    score: float
    hit_rate: float
    median_excess: float
    p10_excess: float
    p90_excess: float
    worst_excess: float
    best_excess: float
    full_excess_final: float
    full_mdd: float
    params: Dict[str, Any]


def _sample_params(rng: random.Random) -> Dict[str, Any]:
    return {
        "benchmark": "SPY",
        "risky": ["UPRO", "TQQQ", "SSO", "QLD"],
        "defensive": ["TLT", "IEF", "GLD", "BIL"],
        "inverse": ["SH", "PSQ"],
        "bear_mode": rng.choice(["defensive", "inverse", "best"]),
        "top_k_risky": rng.choice([1, 2]),
        "top_k_defensive": rng.choice([1, 2]),
        "rebalance_every": rng.choice([1, 2, 5, 10, 21]),
        "cash": "BIL",
        "core_weight": rng.choice([0.0, 0.2, 0.35, 0.5]),
        "core_to_cash_when_bear": rng.choice([False, True]),
        "ann_factor": 252.0,
        "sma_days": rng.choice([100, 150, 200, 250]),
        "mom_days": rng.choice([5, 10, 21, 42, 63]),
        "mom_floor": rng.choice([-1e9, 0.0]),
        "require_asset_trend": rng.choice([False, True]),
        "allocate_residual_to_cash": rng.choice([False, True]),
        "risk_off_vol_lookback": rng.choice([10, 20, 30]),
        "risk_off_vol_max": rng.choice([0.0, 0.22, 0.28]),
        "risk_off_crash_days": rng.choice([3, 5, 10]),
        "risk_off_crash_ret": rng.choice([0.0, -0.05, -0.08]),
        "risk_off_cooldown_days": rng.choice([10, 21, 42]),
        "cppi_floor_frac": rng.choice([0.0, 0.85, 0.90]),
        "cppi_multiplier": rng.choice([0.0, 3.0, 5.0]),
        "crypto_gate": rng.choice([False, True]),
        "crypto_trend_sma_days": rng.choice([150, 200]),
        "crypto_vol_lookback": rng.choice([10, 20]),
        "crypto_vol_max": rng.choice([0.0, 0.90, 1.20]),
        "vol_lookback": rng.choice([10, 20, 30]),
        "target_vol": rng.choice([0.10, 0.12, 0.16, 0.18, 0.22, 0.26]),
        "max_gross": rng.choice([0.35, 0.5, 0.65, 0.8, 1.0, 1.25, 1.5]),
        "dd_stop": rng.choice([0.06, 0.08, 0.10, 0.12, 0.15, 0.18, 0.22]),
        "dd_floor_gross": rng.choice([0.0, 0.1, 0.25, 0.4]),
        "port_dd_stop": rng.choice([0.0, 0.10, 0.15, 0.20]),
        "port_dd_cooldown_days": rng.choice([5, 10, 21, 42]),
        "rebalance_threshold": rng.choice([0.0, 0.02, 0.05, 0.10]),
        "cost_bps": rng.choice([1.0, 2.0, 5.0]),
    }


def _apply_universe_override(par: Dict[str, Any], universe: Dict[str, Any]) -> Dict[str, Any]:
    # Keep parameter sampling but override the asset lists/benchmark from a JSON.
    out = dict(par)
    if "benchmark" in universe:
        out["benchmark"] = str(universe["benchmark"])
    if "risky" in universe:
        out["risky"] = list(universe["risky"])
    if "defensive" in universe:
        out["defensive"] = list(universe["defensive"])
    if "inverse" in universe:
        out["inverse"] = list(universe["inverse"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Monthly (21-bar) sweep for spy-beater engine.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater"))
    ap.add_argument("--universe-json", type=Path, default=None, help="Optional override for benchmark/risky/defensive/inverse lists.")
    ap.add_argument("--window-bars", type=int, default=21)
    ap.add_argument("--min-excess-final", type=float, default=0.10)
    ap.add_argument("--max-dd-full", type=float, default=0.60)
    ap.add_argument("--max-evals", type=int, default=250)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--limit-years", type=int, default=10, help="Use last N years only (speed).")
    ap.add_argument("--holdout-bars", type=int, default=0, help="If >0, score only on the last N bars.")
    args = ap.parse_args()

    prices = load_prices(args.panel).sort_index().ffill()
    if prices.empty:
        print("Empty panel.")
        return 2

    if int(args.limit_years) > 0:
        end = prices.index.max()
        start = end - pd.Timedelta(days=365 * int(args.limit_years))
        prices = prices[prices.index >= start]

    holdout_bars = int(max(0, args.holdout_bars))
    if holdout_bars > 0 and len(prices.index) > holdout_bars + int(args.window_bars):
        score_prices = prices.iloc[-holdout_bars:]
    else:
        score_prices = prices

    rng = random.Random(int(args.seed))
    results: List[Result] = []
    universe_override: Dict[str, Any] = {}
    if args.universe_json is not None and args.universe_json.exists():
        universe_override = json.loads(args.universe_json.read_text())

    for _ in range(int(args.max_evals)):
        par = _sample_params(rng)
        if universe_override:
            par = _apply_universe_override(par, universe_override)
        res = run_engine(
            prices,
            benchmark=str(par["benchmark"]),
            risky=list(par["risky"]),
            defensive=list(par["defensive"]),
            inverse=list(par["inverse"]),
            bear_mode=str(par["bear_mode"]),
            top_k_risky=int(par["top_k_risky"]),
            top_k_defensive=int(par["top_k_defensive"]),
            rebalance_every=int(par["rebalance_every"]),
            cash=str(par["cash"]),
            core_weight=float(par["core_weight"]),
            core_to_cash_when_bear=bool(par["core_to_cash_when_bear"]),
            ann_factor=float(par["ann_factor"]),
            sma_days=int(par["sma_days"]),
            mom_days=int(par["mom_days"]),
            mom_floor=float(par.get("mom_floor", -1e9)),
            require_asset_trend=bool(par.get("require_asset_trend", False)),
            allocate_residual_to_cash=bool(par.get("allocate_residual_to_cash", False)),
            risk_off_vol_lookback=int(par.get("risk_off_vol_lookback", 20)),
            risk_off_vol_max=float(par.get("risk_off_vol_max", 0.0)),
            risk_off_crash_days=int(par.get("risk_off_crash_days", 5)),
            risk_off_crash_ret=float(par.get("risk_off_crash_ret", 0.0)),
            risk_off_cooldown_days=int(par.get("risk_off_cooldown_days", 21)),
            cppi_floor_frac=float(par.get("cppi_floor_frac", 0.0)),
            cppi_multiplier=float(par.get("cppi_multiplier", 0.0)),
            crypto_gate=bool(par.get("crypto_gate", False)),
            crypto_trend_sma_days=int(par.get("crypto_trend_sma_days", 200)),
            crypto_vol_lookback=int(par.get("crypto_vol_lookback", 20)),
            crypto_vol_max=float(par.get("crypto_vol_max", 0.0)),
            vol_lookback=int(par["vol_lookback"]),
            target_vol=float(par["target_vol"]),
            max_gross=float(par["max_gross"]),
            dd_stop=float(par["dd_stop"]),
            dd_floor_gross=float(par["dd_floor_gross"]),
            port_dd_stop=float(par.get("port_dd_stop", 0.0)),
            port_dd_cooldown_days=int(par.get("port_dd_cooldown_days", 21)),
            rebalance_threshold=float(par["rebalance_threshold"]),
            cost_bps=float(par["cost_bps"]),
        )
        if "error" in res:
            continue

        full_mdd = float(res["perf"]["max_drawdown"])
        if full_mdd < -abs(float(args.max_dd_full)):
            continue

        pnl = res["pnl"].reindex(score_prices.index).dropna()
        bench_pnl = res["benchmark_pnl"].reindex(score_prices.index).dropna()
        ex = _rolling_excess_final(pnl, bench_pnl, window=int(args.window_bars)).dropna()
        if ex.empty:
            continue

        thr = float(args.min_excess_final)
        hit_rate = float((ex >= thr).mean())
        med = float(ex.median())
        p10 = float(ex.quantile(0.10))
        p90 = float(ex.quantile(0.90))
        worst = float(ex.min())
        best = float(ex.max())
        full_excess = float(res["active_perf"]["excess_final"])

        # Score: prioritize monthly hit-rate, then median, penalize downside tail.
        score = (3.0 * hit_rate) + (1.0 * med) + (0.5 * full_excess) + (0.2 * p90) - (0.8 * abs(min(0.0, p10)))
        results.append(
            Result(
                score=score,
                hit_rate=hit_rate,
                median_excess=med,
                p10_excess=p10,
                p90_excess=p90,
                worst_excess=worst,
                best_excess=best,
                full_excess_final=full_excess,
                full_mdd=full_mdd,
                params=par,
            )
        )

    results.sort(key=lambda r: r.score, reverse=True)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = {
        "panel": str(args.panel),
        "window_bars": int(args.window_bars),
        "min_excess_final": float(args.min_excess_final),
        "max_dd_full": float(args.max_dd_full),
        "max_evals": int(args.max_evals),
        "seed": int(args.seed),
        "holdout_bars": holdout_bars,
        "n_scored": int(len(results)),
        "top": [r.__dict__ for r in results[:25]],
    }
    (args.out_dir / "monthly_sweep.json").write_text(json.dumps(out, indent=2) + "\n")
    if results:
        (args.out_dir / "monthly_sweep_best.json").write_text(json.dumps(results[0].params, indent=2) + "\n")
        print(json.dumps({"n_scored": len(results), "best": results[0].__dict__}, indent=2))
    else:
        print(json.dumps({"n_scored": 0}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
