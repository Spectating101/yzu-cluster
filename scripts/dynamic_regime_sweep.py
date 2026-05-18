#!/usr/bin/env python3
"""
Repeated robustness simulations for the dynamic regime runner.

This sweeps the *meta* thresholds (crash/vol/probability cutoffs) and evaluates
out-of-sample folds (train -> test) to avoid picking a single lucky backtest.

Research only, not investment advice.
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

from spy_beater_dynamic_regime_runner import _as_weight_vector, _config_defaults, _features, _perf, _train_model  # noqa: E402
from spy_beater_leveraged_runner import load_prices  # noqa: E402


@dataclass(frozen=True)
class TrialResult:
    params: Dict[str, Any]
    folds: int
    accepted: int
    mean_excess_final: float
    median_excess_final: float
    worst_excess_final: float
    best_excess_final: float
    mean_mdd: float


def _run_fold(
    px: pd.DataFrame,
    *,
    benchmark: str,
    cfg_on: Dict[str, Any],
    cfg_off: Dict[str, Any],
    cfg_crash: Dict[str, Any],
    train_days: int,
    refit_every: int,
    label_horizon: int,
    hard_crash_days: int,
    hard_crash_ret: float,
    hard_vol_lookback: int,
    hard_vol_max: float,
    prob_risk_on: float,
    start_loc: int,
    end_loc: int,
) -> Tuple[pd.Series, pd.Series]:
    idx = px.index
    bm = px[benchmark]
    bench_rets = bm.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    feats = _features(bm).fillna(0.0)
    horizon = int(max(1, label_horizon))
    y = ((bm.shift(-horizon) / bm - 1.0) > 0).astype(int)

    pnl = []
    bench_pnl = []
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)
    model = None
    last_fit_i = -10**9

    start_loc = int(max(0, start_loc))
    end_loc = int(min(len(idx) - 2, end_loc))

    for i in range(start_loc, end_loc + 1):
        dt = idx[i]
        if i < train_days:
            cfg = cfg_off
        else:
            if (i - last_fit_i) >= int(refit_every) or model is None:
                tr_start = i - int(train_days)
                tr_end = i - horizon
                x_tr = feats.iloc[tr_start:tr_end].copy()
                y_tr = y.iloc[tr_start:tr_end].copy()
                good = x_tr.notna().all(axis=1) & y_tr.notna()
                x_tr = x_tr.loc[good]
                y_tr = y_tr.loc[good]
                if len(x_tr) >= 200 and y_tr.nunique() > 1:
                    model = _train_model(x_tr, y_tr)
                    last_fit_i = i

            x_dt = feats.iloc[i : i + 1].fillna(0.0)
            p_on = float(model.predict_proba(x_dt.values)[0, 1]) if model is not None else 0.0

            crash_ret = float((bm.iloc[i] / bm.iloc[max(0, i - int(hard_crash_days))]) - 1.0) if i > 0 else 0.0
            vol_hist = bench_rets.iloc[max(0, i - int(hard_vol_lookback) + 1) : i + 1]
            est_vol = float(vol_hist.std(ddof=0) * np.sqrt(252.0)) if len(vol_hist) >= 5 else 0.0
            if crash_ret <= float(hard_crash_ret):
                cfg = cfg_crash
            elif float(hard_vol_max) > 0 and est_vol >= float(hard_vol_max):
                cfg = cfg_off
            elif p_on >= float(prob_risk_on):
                cfg = cfg_on
            else:
                cfg = cfg_off

        w = _as_weight_vector(cfg, px, dt)
        turn = float((w - w_prev).abs().sum())
        cost = float(cfg.get("cost_bps", 0.0)) / 10000.0
        tc = cost * turn
        r_next = px.pct_change(fill_method=None).shift(-1).iloc[i].replace([np.inf, -np.inf], np.nan).fillna(0.0)
        r = float((w * r_next).sum()) - float(tc)
        b = float(bench_rets.shift(-1).iloc[i])
        pnl.append(r)
        bench_pnl.append(b)
        w_prev = w

    pnl_s = pd.Series(pnl, index=idx[start_loc : end_loc + 1], name="pnl").fillna(0.0)
    bench_s = pd.Series(bench_pnl, index=idx[start_loc : end_loc + 1], name="benchmark_pnl").fillna(0.0)
    return pnl_s, bench_s


def main() -> int:
    ap = argparse.ArgumentParser(description="Sweep dynamic regime thresholds with walk-forward folds.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--risk-on-config", type=Path, required=True)
    ap.add_argument("--risk-off-config", type=Path, required=True)
    ap.add_argument("--crash-config", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_sweep.json"))

    ap.add_argument("--train-days", type=int, default=756)
    ap.add_argument("--test-days", type=int, default=252)
    ap.add_argument("--step-days", type=int, default=252)
    ap.add_argument("--n-folds", type=int, default=6)
    ap.add_argument("--refit-every", type=int, default=21)
    ap.add_argument("--label-horizon", type=int, default=21)

    ap.add_argument("--trials", type=int, default=60)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--min-accepted-folds", type=int, default=2)
    args = ap.parse_args()

    px = load_prices(args.panel).sort_index()
    bm = str(args.benchmark)
    if bm not in px.columns:
        print(f"Benchmark {bm} missing from panel.")
        return 2
    px = px.loc[px[bm].dropna().index].ffill()

    cfg_on = _config_defaults(json.loads(args.risk_on_config.read_text()))
    cfg_off = _config_defaults(json.loads(args.risk_off_config.read_text()))
    cfg_crash = _config_defaults(json.loads(args.crash_config.read_text()))

    rng = random.Random(int(args.seed))
    results: List[TrialResult] = []

    last_loc = len(px.index) - 2
    for _ in range(int(args.trials)):
        par = {
            "hard_crash_days": rng.choice([3, 5, 10]),
            "hard_crash_ret": rng.choice([-0.05, -0.07, -0.10]),
            "hard_vol_lookback": rng.choice([10, 20, 30]),
            "hard_vol_max": rng.choice([0.22, 0.24, 0.26, 0.28, 0.30]),
            "prob_risk_on": rng.choice([0.50, 0.55, 0.60, 0.65]),
        }

        fold_ex = []
        fold_mdd = []
        accepted = 0
        for k in range(int(args.n_folds)):
            test_end = last_loc - (k * int(args.step_days))
            test_start = max(0, test_end - int(args.test_days) + 1)
            train_start = max(0, test_start - int(args.train_days))
            if test_end <= 0 or (test_end - train_start) < int(args.train_days) // 2:
                continue
            pnl_s, bench_s = _run_fold(
                px,
                benchmark=bm,
                cfg_on=cfg_on,
                cfg_off=cfg_off,
                cfg_crash=cfg_crash,
                train_days=int(args.train_days),
                refit_every=int(args.refit_every),
                label_horizon=int(args.label_horizon),
                hard_crash_days=int(par["hard_crash_days"]),
                hard_crash_ret=float(par["hard_crash_ret"]),
                hard_vol_lookback=int(par["hard_vol_lookback"]),
                hard_vol_max=float(par["hard_vol_max"]),
                prob_risk_on=float(par["prob_risk_on"]),
                start_loc=train_start,
                end_loc=test_end,
            )
            # Score only the test window.
            pnl_te = pnl_s.iloc[-len(px.index[test_start : test_end + 1]) :]
            bench_te = bench_s.iloc[-len(px.index[test_start : test_end + 1]) :]
            eq = (1.0 + pnl_te).cumprod()
            beq = (1.0 + bench_te).cumprod()
            excess_final = float(eq.iloc[-1] / beq.iloc[-1] - 1.0) if len(eq) else 0.0
            mdd = float((_perf(pnl_te).mdd))
            fold_ex.append(excess_final)
            fold_mdd.append(mdd)
            if excess_final >= 0:
                accepted += 1

        if not fold_ex:
            continue
        fold_ex_a = np.array(fold_ex, dtype=float)
        fold_mdd_a = np.array(fold_mdd, dtype=float)
        if accepted < int(args.min_accepted_folds):
            continue
        results.append(
            TrialResult(
                params=par,
                folds=int(len(fold_ex)),
                accepted=int(accepted),
                mean_excess_final=float(fold_ex_a.mean()),
                median_excess_final=float(np.median(fold_ex_a)),
                worst_excess_final=float(fold_ex_a.min()),
                best_excess_final=float(fold_ex_a.max()),
                mean_mdd=float(fold_mdd_a.mean()),
            )
        )

    # Rank: prioritize median and worst-fold, lightly penalize drawdown.
    results.sort(
        key=lambda r: (r.median_excess_final + 0.5 * r.worst_excess_final - 0.2 * abs(min(0.0, r.mean_mdd))),
        reverse=True,
    )
    payload = {
        "panel": str(args.panel),
        "benchmark": bm,
        "configs": {
            "risk_on": str(args.risk_on_config),
            "risk_off": str(args.risk_off_config),
            "crash": str(args.crash_config),
        },
        "settings": {
            "train_days": args.train_days,
            "test_days": args.test_days,
            "step_days": args.step_days,
            "n_folds": args.n_folds,
            "refit_every": args.refit_every,
            "label_horizon": args.label_horizon,
            "trials": args.trials,
            "seed": args.seed,
            "min_accepted_folds": args.min_accepted_folds,
        },
        "n_kept": int(len(results)),
        "top": [r.__dict__ for r in results[:25]],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n")
    if results:
        print(json.dumps({"n_kept": len(results), "best": results[0].__dict__}, indent=2))
    else:
        print(json.dumps({"n_kept": 0}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

