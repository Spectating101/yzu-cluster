#!/usr/bin/env python3
"""
Ensembled walk-forward for the leveraged tactical engine.

Differences vs spy_beater_walkforward.py:
  - Keeps the top-K parameter candidates on the training window.
  - Evaluates each candidate on the test window.
  - Combines them as an equal-weight "model ensemble" by averaging daily pnl.

This is research/backtest harness code, not investment advice.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from spy_beater_leveraged_runner import load_prices, perf, run_engine  # noqa: E402


@dataclass(frozen=True)
class Candidate:
    score: float
    params: Dict[str, Any]
    train_summary: Dict[str, Any]


def _window(prices: pd.DataFrame, end_loc: int, n_rows: int) -> pd.DataFrame:
    end_loc = int(end_loc)
    n_rows = int(n_rows)
    start_loc = max(0, end_loc - n_rows + 1)
    return prices.iloc[start_loc : end_loc + 1]


def _sample_params(rng: random.Random) -> Dict[str, Any]:
    # Kept compact to make walk-forward practical.
    space = {
        "core_weight": [0.0, 0.2, 0.35, 0.5],
        "core_to_cash_when_bear": [False, True],
        "bear_mode": ["defensive", "inverse", "best"],
        "top_k_risky": [1, 2],
        "top_k_defensive": [1, 2],
        "rebalance_every": [1, 2, 5, 10, 21],
        "sma_days": [120, 150, 200, 250],
        "mom_days": [21, 42, 63, 126],
        "mom_floor": [-1e9, 0.0],
        "require_asset_trend": [False, True],
        "allocate_residual_to_cash": [False, True],
        "risk_off_vol_lookback": [10, 20, 30],
        "risk_off_vol_max": [0.0, 0.22, 0.28],
        "risk_off_crash_days": [3, 5, 10],
        "risk_off_crash_ret": [0.0, -0.05, -0.08],
        "risk_off_cooldown_days": [10, 21, 42],
        "cppi_floor_frac": [0.0, 0.85, 0.90],
        "cppi_multiplier": [0.0, 3.0, 5.0],
        "crypto_gate": [False, True],
        "crypto_trend_sma_days": [150, 200],
        "crypto_vol_lookback": [10, 20],
        "crypto_vol_max": [0.0, 0.90, 1.20],
        "vol_lookback": [10, 20, 30],
        "target_vol": [0.12, 0.16, 0.18, 0.22, 0.26],
        "max_gross": [0.5, 0.8, 1.0, 1.25],
        "dd_stop": [0.08, 0.12, 0.15, 0.22],
        "dd_floor_gross": [0.0, 0.1, 0.25, 0.4],
        "port_dd_stop": [0.0, 0.10, 0.15, 0.20],
        "port_dd_cooldown_days": [5, 10, 21, 42],
        "rebalance_threshold": [0.0, 0.05, 0.10],
        "cost_bps": [1.0, 2.0],
    }
    return {k: rng.choice(v) for k, v in space.items()}


def _score_train(res: Dict[str, Any]) -> float:
    a = res["active_perf"]
    p = res["perf"]
    excess = float(a.get("excess_cagr", 0.0))
    sharpe = float(p.get("sharpe", 0.0))
    mdd = abs(float(p.get("max_drawdown", 0.0)))
    return (2.0 * excess) + (0.4 * sharpe) - (0.8 * mdd)


def _run_with_params(
    prices: pd.DataFrame,
    *,
    benchmark: str,
    risky: List[str],
    defensive: List[str],
    inverse: List[str],
    cash: str,
    ann_factor: float,
    par: Dict[str, Any],
) -> Dict[str, Any]:
    return run_engine(
        prices,
        benchmark=str(benchmark),
        risky=list(risky),
        defensive=list(defensive),
        inverse=list(inverse),
        bear_mode=str(par["bear_mode"]),
        top_k_risky=int(par["top_k_risky"]),
        top_k_defensive=int(par["top_k_defensive"]),
        rebalance_every=int(par["rebalance_every"]),
        cash=str(cash),
        core_weight=float(par["core_weight"]),
        core_to_cash_when_bear=bool(par["core_to_cash_when_bear"]),
        ann_factor=float(ann_factor),
        sma_days=int(par["sma_days"]),
        mom_days=int(par["mom_days"]),
        mom_floor=float(par["mom_floor"]),
        require_asset_trend=bool(par["require_asset_trend"]),
        allocate_residual_to_cash=bool(par["allocate_residual_to_cash"]),
        risk_off_vol_lookback=int(par["risk_off_vol_lookback"]),
        risk_off_vol_max=float(par["risk_off_vol_max"]),
        risk_off_crash_days=int(par["risk_off_crash_days"]),
        risk_off_crash_ret=float(par["risk_off_crash_ret"]),
        risk_off_cooldown_days=int(par["risk_off_cooldown_days"]),
        cppi_floor_frac=float(par["cppi_floor_frac"]),
        cppi_multiplier=float(par["cppi_multiplier"]),
        crypto_gate=bool(par["crypto_gate"]),
        crypto_trend_sma_days=int(par["crypto_trend_sma_days"]),
        crypto_vol_lookback=int(par["crypto_vol_lookback"]),
        crypto_vol_max=float(par["crypto_vol_max"]),
        vol_lookback=int(par["vol_lookback"]),
        target_vol=float(par["target_vol"]),
        max_gross=float(par["max_gross"]),
        dd_stop=float(par["dd_stop"]),
        dd_floor_gross=float(par["dd_floor_gross"]),
        port_dd_stop=float(par["port_dd_stop"]),
        port_dd_cooldown_days=int(par["port_dd_cooldown_days"]),
        rebalance_threshold=float(par["rebalance_threshold"]),
        cost_bps=float(par["cost_bps"]),
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Ensembled walk-forward validation for spy-beater leveraged engine.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater/walkforward_ensemble"))
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--risky", nargs="+", default=["UPRO", "TQQQ", "SSO", "QLD"])
    ap.add_argument("--defensive", nargs="+", default=["TLT", "IEF", "GLD", "BIL"])
    ap.add_argument("--inverse", nargs="+", default=["SH", "PSQ"])
    ap.add_argument("--cash", type=str, default="BIL")
    ap.add_argument("--ann-factor", type=float, default=252.0)

    ap.add_argument("--train-days", type=int, default=756)
    ap.add_argument("--test-days", type=int, default=252)
    ap.add_argument("--step-days", type=int, default=252)
    ap.add_argument("--n-folds", type=int, default=6)
    ap.add_argument("--max-evals", type=int, default=120)
    ap.add_argument("--ensemble-k", type=int, default=7)
    ap.add_argument("--seed", type=int, default=0)

    ap.add_argument("--min-test-excess-final", type=float, default=0.0)
    ap.add_argument("--max-test-mdd", type=float, default=0.35)
    args = ap.parse_args()

    prices = load_prices(args.panel).sort_index().ffill()
    if prices.empty:
        print("Empty price panel.")
        return 2

    rng = random.Random(int(args.seed))
    last_loc = len(prices.index) - 2  # match engine's use of px.index[:-1]
    folds: List[Dict[str, Any]] = []

    for k in range(int(args.n_folds)):
        test_end = last_loc - (k * int(args.step_days))
        if test_end <= 0:
            break
        test_df = _window(prices, test_end, int(args.test_days))
        train_end = test_end - len(test_df.index)
        if train_end <= 0:
            break
        train_df = _window(prices, train_end, int(args.train_days))
        if len(train_df.index) < max(60, int(args.train_days) // 2):
            break

        # Tune on training window; keep top K.
        cand_list: List[Candidate] = []
        for _ in range(int(args.max_evals)):
            par = _sample_params(rng)
            res = _run_with_params(
                train_df,
                benchmark=str(args.benchmark),
                risky=list(args.risky),
                defensive=list(args.defensive),
                inverse=list(args.inverse),
                cash=str(args.cash),
                ann_factor=float(args.ann_factor),
                par=par,
            )
            if "error" in res:
                continue
            score = _score_train(res)
            cand_list.append(
                Candidate(
                    score=float(score),
                    params=par,
                    train_summary={"strategy": res["perf"], "benchmark": res["benchmark_perf"], "active": res["active_perf"]},
                )
            )
        if not cand_list:
            continue
        cand_list.sort(key=lambda c: c.score, reverse=True)
        topk = cand_list[: int(max(1, args.ensemble_k))]

        # Evaluate each candidate on test window, then ensemble pnl by averaging.
        pnl_stack = []
        bench = None
        indiv = []
        for c in topk:
            res_te = _run_with_params(
                test_df,
                benchmark=str(args.benchmark),
                risky=list(args.risky),
                defensive=list(args.defensive),
                inverse=list(args.inverse),
                cash=str(args.cash),
                ann_factor=float(args.ann_factor),
                par=c.params,
            )
            pnl_stack.append(res_te["pnl"].rename(f"pnl_{len(pnl_stack)}"))
            bench = res_te["benchmark_pnl"] if bench is None else bench
            indiv.append({"score": c.score, "params": c.params, "test_active": res_te["active_perf"]})

        pnl_df = pd.concat(pnl_stack, axis=1).fillna(0.0)
        pnl_ens = pnl_df.mean(axis=1).rename("pnl")
        bench_pnl = bench.reindex(pnl_ens.index).fillna(0.0) if bench is not None else pnl_ens * 0.0

        eq = (1.0 + pnl_ens).cumprod()
        beq = (1.0 + bench_pnl).cumprod()
        excess_final = float(eq.iloc[-1] / beq.iloc[-1] - 1.0) if len(eq) else 0.0
        strat_perf = perf(pnl_ens, ann_factor=float(args.ann_factor))
        bench_perf = perf(bench_pnl, ann_factor=float(args.ann_factor))

        if excess_final < float(args.min_test_excess_final):
            verdict = "rejected_excess"
        elif float(strat_perf.max_drawdown) < -abs(float(args.max_test_mdd)):
            verdict = "rejected_mdd"
        else:
            verdict = "accepted"

        folds.append(
            {
                "fold": k + 1,
                "train": {"start": str(train_df.index.min().date()), "end": str(train_df.index.max().date()), "topk": [c.params for c in topk]},
                "test": {
                    "start": str(test_df.index.min().date()),
                    "end": str(test_df.index.max().date()),
                    "summary": {
                        "strategy": strat_perf.__dict__,
                        "benchmark": bench_perf.__dict__,
                        "active": {"excess_final": excess_final},
                    },
                    "verdict": verdict,
                    "members": indiv,
                },
            }
        )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = {
        "panel": str(args.panel),
        "benchmark": args.benchmark,
        "risky": args.risky,
        "defensive": args.defensive,
        "inverse": args.inverse,
        "cash": args.cash,
        "settings": {
            "train_days": args.train_days,
            "test_days": args.test_days,
            "step_days": args.step_days,
            "n_folds": args.n_folds,
            "max_evals": args.max_evals,
            "ensemble_k": args.ensemble_k,
            "seed": args.seed,
            "min_test_excess_final": args.min_test_excess_final,
            "max_test_mdd": args.max_test_mdd,
            "ann_factor": args.ann_factor,
        },
        "folds": folds,
    }
    (args.out_dir / "walkforward.json").write_text(json.dumps(out, indent=2) + "\n")
    accepted = [f for f in folds if f["test"]["verdict"] == "accepted"]
    print(json.dumps({"folds": len(folds), "accepted": len(accepted)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

