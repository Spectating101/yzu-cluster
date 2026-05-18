#!/usr/bin/env python3
"""
Evaluate a sec_event_alpha_backtest output on non-overlapping monthly windows.

Reads:
  - pnl.csv
  - benchmark_pnl.csv

Outputs summary JSON with hit-rates for excess over each 21-bar window.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd


def _load_series(path: Path) -> pd.Series:
    s = pd.read_csv(path, index_col=0, parse_dates=True).iloc[:, 0]
    s.index = pd.DatetimeIndex(s.index)
    s = pd.to_numeric(s, errors="coerce").fillna(0.0)
    return s


def main() -> int:
    ap = argparse.ArgumentParser(description="Monthly evaluation for SEC event alpha outputs.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--window-bars", type=int, default=21)
    ap.add_argument("--thresholds", nargs="*", type=float, default=[0.0, 0.02, 0.05, 0.10])
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    pnl_p = args.run_dir / "pnl.csv"
    ben_p = args.run_dir / "benchmark_pnl.csv"
    if not pnl_p.exists() or not ben_p.exists():
        print("Missing pnl.csv or benchmark_pnl.csv in run dir.")
        return 2

    strat = _load_series(pnl_p)
    bench = _load_series(ben_p).reindex(strat.index).fillna(0.0)
    w = int(max(2, args.window_bars))

    a = np.log1p(strat) - np.log1p(bench)
    # non-overlapping windows
    n = len(a) // w
    if n <= 1:
        print("Not enough samples for monthly windows.")
        return 2
    vals = []
    for i in range(n):
        seg = a.iloc[i * w : (i + 1) * w]
        vals.append(float(np.expm1(seg.sum())))

    ex = pd.Series(vals)
    thr = [float(x) for x in (args.thresholds or [])]
    hit = {str(t): float((ex >= t).mean()) for t in thr}
    out = {
        "run_dir": str(args.run_dir),
        "window_bars": w,
        "n_windows": int(len(ex)),
        "thresholds": thr,
        "hit_rates": hit,
        "median_excess": float(ex.median()),
        "p10_excess": float(ex.quantile(0.10)),
        "p90_excess": float(ex.quantile(0.90)),
        "worst_excess": float(ex.min()),
        "best_excess": float(ex.max()),
    }

    out_path = args.out or (args.run_dir / "monthly_eval.json")
    out_path.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

