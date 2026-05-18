#!/usr/bin/env python3
"""
Stitch a walk-forward run into a single equity curve.

Given a walkforward.json produced by sec_event_walkforward.py, this script:
  - Re-runs each fold's picked parameters on its test window
  - Concatenates the per-fold pnl into a single timeseries (chronological)
  - Computes performance vs benchmark and writes csv + summary.json

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from sec_event_alpha_backtest import _perf, load_events, load_prices, run_event_alpha  # noqa: E402


def _date(s: str) -> pd.Timestamp:
    return pd.to_datetime(s, errors="coerce").normalize()


def _slice_window(px: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    a = _date(start)
    b = _date(end)
    if pd.isna(a) or pd.isna(b):
        raise ValueError(f"Bad date(s): start={start} end={end}")
    return px.loc[(px.index >= a) & (px.index <= b)].copy()


def main() -> int:
    ap = argparse.ArgumentParser(description="Stitch a sec_event_walkforward.py run into one curve.")
    ap.add_argument("--walkforward-json", type=Path, required=True)
    ap.add_argument("--prices", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/sec_event_alpha/walkforward_stitched"))
    args = ap.parse_args()

    wf = json.loads(args.walkforward_json.read_text())
    folds = list(wf.get("folds", []))
    if not folds:
        print("No folds in walkforward.json")
        return 2

    px = load_prices(args.prices).sort_index().ffill()
    ev = load_events(args.events)
    benchmark = str(wf.get("benchmark", "SPY"))

    # Sort folds chronologically by test start date.
    folds_sorted = sorted(folds, key=lambda f: _date(f["test"]["start"]))

    pnl_parts: List[pd.Series] = []
    bench_parts: List[pd.Series] = []
    used: List[Dict[str, Any]] = []

    for f in folds_sorted:
        test = f["test"]
        train = f["train"]
        par = dict(train["picked"])
        test_px = _slice_window(px, test["start"], test["end"])
        if test_px.empty:
            continue

        res = run_event_alpha(
            test_px,
            ev,
            benchmark=benchmark,
            top_n=int(par["top_n"]),
            hold_days=int(par["hold_days"]),
            trade_lag=int(par["trade_lag"]),
            gross=float(par["gross"]),
            cost_bps=float(par["cost_bps"]),
            target_vol=float(par.get("target_vol", 0.0)),
            vol_lookback=int(par.get("vol_lookback", 20)),
            max_gross=float(par.get("max_gross", 2.0)),
            mom_days=int(par["mom_days"]),
            mom_weight=float(par["mom_weight"]),
            fallback_mom_weight=float(par.get("fallback_mom_weight", 0.0)),
            form_weights=dict(par["form_weights"]),
            cooldown_days=int(par.get("cooldown_days", 0)),
            filer_penalty_lambda=float(par.get("filer_penalty_lambda", 0.0)),
            filer_penalty_lookback=int(par.get("filer_penalty_lookback", 63)),
            scale_gross_by_event_count=bool(par.get("scale_gross_by_event_count", False)),
            eval_last_days=0,
        )
        if "error" in res:
            continue

        pnl_parts.append(res["pnl"])
        bench_parts.append(res["benchmark_pnl"])
        used.append(
            {
                "fold": int(f.get("fold", 0)),
                "test_start": test["start"],
                "test_end": test["end"],
                "verdict": test.get("verdict", ""),
                "picked": par,
                "active_excess_final": float(res["active"]["excess_final"]),
            }
        )

    if not pnl_parts:
        print("No stitched pnl produced.")
        return 2

    pnl = pd.concat(pnl_parts).sort_index()
    bench = pd.concat(bench_parts).sort_index().reindex(pnl.index).fillna(0.0)

    eq = (1.0 + pnl.fillna(0.0)).cumprod()
    beq = (1.0 + bench.fillna(0.0)).cumprod()
    excess_final = float(eq.iloc[-1] / beq.iloc[-1] - 1.0) if len(eq) else 0.0

    out = {
        "walkforward_json": str(args.walkforward_json),
        "prices": str(args.prices),
        "events": str(args.events),
        "benchmark": benchmark,
        "folds_used": int(len(used)),
        "strategy_perf": asdict(_perf(pnl)),
        "benchmark_perf": asdict(_perf(bench)),
        "active": {"excess_final": excess_final, "active_sharpe": asdict(_perf(pnl - bench))["sharpe"]},
        "fold_details": used,
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "stitched_summary.json").write_text(json.dumps(out, indent=2) + "\n")
    (args.out_dir / "stitched_pnl.csv").write_text(pnl.to_csv())
    (args.out_dir / "stitched_benchmark_pnl.csv").write_text(bench.to_csv())
    (args.out_dir / "stitched_equity.csv").write_text(eq.to_csv())
    (args.out_dir / "stitched_benchmark_equity.csv").write_text(beq.to_csv())

    print(json.dumps({"folds_used": len(used), "excess_final": excess_final}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

