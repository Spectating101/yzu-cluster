#!/usr/bin/env python3
"""
Walk-forward tuning/evaluation for SEC filing event alpha.

For each fold:
  - Tune parameters on the training window (random search)
  - Evaluate the best params on the following test window

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

import sys

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from sec_event_alpha_backtest import load_events, load_prices, run_event_alpha  # noqa: E402


@dataclass(frozen=True)
class Candidate:
    score: float
    params: Dict[str, Any]
    train_excess_final: float
    train_mdd: float


def _score_train(res: Dict[str, Any]) -> float:
    # Prefer positive excess and decent Sharpe, penalize drawdown.
    ex = float(res["active"]["excess_final"])
    sh = float(res["strategy_perf"]["sharpe"])
    dd = abs(float(res["strategy_perf"]["mdd"]))
    return (2.0 * ex) + (0.3 * sh) - (0.6 * dd)


def _sample_params(rng: random.Random) -> Dict[str, Any]:
    hold = rng.choice([3, 5, 10])
    return {
        "top_n": rng.choice([10, 15, 20, 25, 30]),
        "hold_days": hold,
        "trade_lag": rng.choice([1, 2]),
        "gross": rng.choice([0.75, 1.0, 1.25]),
        "cost_bps": rng.choice([5.0, 10.0, 15.0]),
        "target_vol": rng.choice([0.0, 0.15, 0.20, 0.25]),
        "vol_lookback": rng.choice([10, 20, 40]),
        "max_gross": rng.choice([1.25, 1.5, 2.0]),
        "mom_days": rng.choice([3, 5, 10, 21]),
        "mom_weight": rng.choice([0.0, 0.5, 1.0, 1.5]),
        "fallback_mom_weight": rng.choice([0.0, 0.25, 0.5, 1.0, 2.0]),
        "cooldown_days": rng.choice([0, 5, 10, 21]),
        "filer_penalty_lambda": rng.choice([0.0, 0.10, 0.25, 0.50, 0.75]),
        "filer_penalty_lookback": rng.choice([21, 63, 126]),
        "scale_gross_by_event_count": rng.choice([False, True]),
        # form weights (we'll try a few simple regimes)
        "form_weights": rng.choice(
            [
                {"8-K": 1.0, "10-Q": 0.0, "10-K": 0.0},
                {"8-K": 1.0, "10-Q": 0.5, "10-K": 0.0},
                {"8-K": 1.0, "10-Q": 0.5, "10-K": 0.25},
                {"8-K": 1.0, "10-Q": 1.0, "10-K": 1.0},
            ]
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Walk-forward for SEC event alpha.")
    ap.add_argument("--prices", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/sec_event_alpha/walkforward"))
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--train-days", type=int, default=756)
    ap.add_argument("--test-days", type=int, default=252)
    ap.add_argument("--step-days", type=int, default=252)
    ap.add_argument("--n-folds", type=int, default=6)
    ap.add_argument("--max-evals", type=int, default=40)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--min-test-excess-final", type=float, default=0.0)
    ap.add_argument("--max-test-mdd", type=float, default=0.35)
    args = ap.parse_args()

    px = load_prices(args.prices).sort_index().ffill()
    ev = load_events(args.events)

    if px.empty:
        print("Empty price panel.")
        return 2

    rng = random.Random(int(args.seed))
    out_folds: List[Dict[str, Any]] = []

    idx = px.index
    last_loc = len(idx) - 2  # match shift(-lag) usage

    for k in range(int(args.n_folds)):
        test_end = last_loc - (k * int(args.step_days))
        if test_end <= 0:
            break
        test_df = px.iloc[max(0, test_end - int(args.test_days) + 1) : test_end + 1]
        train_end = test_end - len(test_df.index)
        if train_end <= 0:
            break
        train_df = px.iloc[max(0, train_end - int(args.train_days) + 1) : train_end + 1]
        if len(train_df.index) < max(200, int(args.train_days) // 2):
            break

        # Tune on training window.
        best: Optional[Candidate] = None
        for _ in range(int(args.max_evals)):
            par = _sample_params(rng)
            res_tr = run_event_alpha(
                train_df,
                ev,
                benchmark=str(args.benchmark),
                top_n=int(par["top_n"]),
                hold_days=int(par["hold_days"]),
                trade_lag=int(par["trade_lag"]),
                gross=float(par["gross"]),
                cost_bps=float(par["cost_bps"]),
                target_vol=float(par["target_vol"]),
                vol_lookback=int(par["vol_lookback"]),
                max_gross=float(par["max_gross"]),
                mom_days=int(par["mom_days"]),
                mom_weight=float(par["mom_weight"]),
                fallback_mom_weight=float(par["fallback_mom_weight"]),
                form_weights=dict(par["form_weights"]),
                cooldown_days=int(par["cooldown_days"]),
                filer_penalty_lambda=float(par["filer_penalty_lambda"]),
                filer_penalty_lookback=int(par["filer_penalty_lookback"]),
                scale_gross_by_event_count=bool(par["scale_gross_by_event_count"]),
                eval_last_days=0,
            )
            if "error" in res_tr:
                continue
            score = _score_train(res_tr)
            cand = Candidate(
                score=score,
                params=par,
                train_excess_final=float(res_tr["active"]["excess_final"]),
                train_mdd=float(res_tr["strategy_perf"]["mdd"]),
            )
            if best is None or cand.score > best.score:
                best = cand

        if best is None:
            continue

        # Evaluate on test window.
        par = best.params
        res_te = run_event_alpha(
            test_df,
            ev,
            benchmark=str(args.benchmark),
            top_n=int(par["top_n"]),
            hold_days=int(par["hold_days"]),
            trade_lag=int(par["trade_lag"]),
            gross=float(par["gross"]),
            cost_bps=float(par["cost_bps"]),
            target_vol=float(par["target_vol"]),
            vol_lookback=int(par["vol_lookback"]),
            max_gross=float(par["max_gross"]),
            mom_days=int(par["mom_days"]),
            mom_weight=float(par["mom_weight"]),
            fallback_mom_weight=float(par["fallback_mom_weight"]),
            form_weights=dict(par["form_weights"]),
            cooldown_days=int(par["cooldown_days"]),
            filer_penalty_lambda=float(par["filer_penalty_lambda"]),
            filer_penalty_lookback=int(par["filer_penalty_lookback"]),
            scale_gross_by_event_count=bool(par["scale_gross_by_event_count"]),
            eval_last_days=0,
        )
        te_ex = float(res_te["active"]["excess_final"])
        te_mdd = float(res_te["strategy_perf"]["mdd"])
        if te_ex < float(args.min_test_excess_final):
            verdict = "rejected_excess"
        elif te_mdd < -abs(float(args.max_test_mdd)):
            verdict = "rejected_mdd"
        else:
            verdict = "accepted"

        out_folds.append(
            {
                "fold": k + 1,
                "train": {
                    "start": str(train_df.index.min().date()),
                    "end": str(train_df.index.max().date()),
                    "picked": par,
                    "score": best.score,
                    "excess_final": best.train_excess_final,
                    "mdd": best.train_mdd,
                },
                "test": {
                    "start": str(test_df.index.min().date()),
                    "end": str(test_df.index.max().date()),
                    "summary": {
                        "strategy": res_te["strategy_perf"],
                        "benchmark": res_te["benchmark_perf"],
                        "active": res_te["active"],
                        "rolling_21d_vs_spy": res_te["rolling_21d_vs_spy"],
                    },
                    "verdict": verdict,
                },
            }
        )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = {
        "benchmark": args.benchmark,
        "prices": str(args.prices),
        "events": str(args.events),
        "settings": {
            "train_days": args.train_days,
            "test_days": args.test_days,
            "step_days": args.step_days,
            "n_folds": args.n_folds,
            "max_evals": args.max_evals,
            "seed": args.seed,
            "min_test_excess_final": args.min_test_excess_final,
            "max_test_mdd": args.max_test_mdd,
        },
        "folds": out_folds,
    }
    (args.out_dir / "walkforward.json").write_text(json.dumps(out, indent=2) + "\n")

    accepted = [f for f in out_folds if f["test"]["verdict"] == "accepted"]
    print(json.dumps({"folds": len(out_folds), "accepted": len(accepted)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
