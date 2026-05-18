#!/usr/bin/env python3
from __future__ import annotations

"""
Export a deterministic monthly "signal.json" from the alpha walkforward runner.

This is meant for:
  - passive monthly rebalances
  - paper/live tracking (does NOT place trades)

Notes:
  - Uses only information available up to the most recent month-end in the panel.
  - Requires a precomputed feature cache (parquet/csv) to keep runtime predictable.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
if str(SR_ROOT) not in sys.path:
    sys.path.insert(0, str(SR_ROOT))

from scripts.alpha_insights_walkforward_runner import (  # noqa: E402
    daily_close_wide,
    load_panel,
    monthly_close_and_returns,
    walkforward_backtest,
)


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def _as_float_map(series: pd.Series) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for k, v in series.items():
        try:
            fv = float(v)
        except Exception:
            continue
        if not np.isfinite(fv) or fv == 0.0:
            continue
        out[str(k)] = fv
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Export alpha monthly weights to signal.json (no execution).")
    ap.add_argument("--panel", type=Path, required=True, help="Tidy panel csv (Instrument,Date,Price_Close,Volume?).")
    ap.add_argument("--feature-cache", type=Path, required=True, help="Feature cache parquet/csv.")
    ap.add_argument("--out", type=Path, default=SR_ROOT / "backtests" / "outputs" / "signals" / "alpha_signal.json")

    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--cash-ticker", type=str, default="BIL")
    ap.add_argument("--train-months", type=int, default=48)
    ap.add_argument("--top-n", type=int, default=4)
    ap.add_argument("--max-weight", type=float, default=0.50)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--lam-grid", nargs="*", type=float, default=[0.1, 1.0, 10.0])
    ap.add_argument("--min-assets", type=int, default=4)

    ap.add_argument("--target-vol", type=float, default=0.20)
    ap.add_argument("--vol-lookback", type=int, default=12)
    ap.add_argument("--max-gross", type=float, default=1.25)
    ap.add_argument("--allow-leverage", action="store_true")

    ap.add_argument("--regime-filter", action="store_true")
    ap.add_argument("--regime-window", type=int, default=12)
    ap.add_argument("--regime-off-gross", type=float, default=0.0)

    ap.add_argument("--base", choices=["cash", "benchmark", "trend"], default="trend")
    ap.add_argument("--alpha-mode", choices=["fixed", "ic_tstat"], default="ic_tstat")
    ap.add_argument("--ic-months", type=int, default=12)
    ap.add_argument("--alpha-tstat-scale", type=float, default=1.5)

    ap.add_argument("--corr-filter", action="store_true")
    ap.add_argument("--corr-threshold", type=float, default=0.8)
    ap.add_argument("--corr-lookback", type=int, default=6)
    ap.add_argument("--risk-budget", action="store_true")
    ap.add_argument("--max-turnover", type=float, default=0.75)
    ap.add_argument("--pf-dd-threshold", type=float, default=0.2)
    ap.add_argument("--pf-dd-floor-gross", type=float, default=0.85)

    args = ap.parse_args()

    panel = load_panel(args.panel)
    close_d = daily_close_wide(panel)
    if args.cash_ticker and args.cash_ticker not in close_d.columns:
        close_d[str(args.cash_ticker)] = 1.0
    _, ret_m = monthly_close_and_returns(close_d)

    if args.feature_cache.suffix.lower() == ".parquet":
        feats = pd.read_parquet(args.feature_cache)
    else:
        feats = pd.read_csv(args.feature_cache, parse_dates=["date"])
    feats["date"] = pd.to_datetime(feats["date"], errors="coerce")

    res = walkforward_backtest(
        feats,
        ret_m=ret_m,
        benchmark=str(args.benchmark),
        train_months=int(args.train_months),
        top_n=int(args.top_n),
        max_weight=float(args.max_weight),
        cash_ticker=str(args.cash_ticker) if args.cash_ticker else None,
        cost_bps=float(args.cost_bps),
        lam_grid=[float(x) for x in args.lam_grid],
        min_assets=int(args.min_assets),
        target_vol=float(args.target_vol),
        vol_lookback=int(args.vol_lookback),
        max_gross=float(args.max_gross),
        allow_leverage=bool(args.allow_leverage),
        regime_filter=bool(args.regime_filter),
        regime_window=int(args.regime_window),
        regime_off_gross=float(args.regime_off_gross),
        base=str(args.base),
        alpha_mode=str(args.alpha_mode),
        ic_months=int(args.ic_months),
        alpha_tstat_scale=float(args.alpha_tstat_scale),
        auto_params=False,
        policy_window=12,
        corr_filter=bool(args.corr_filter),
        corr_threshold=float(args.corr_threshold),
        corr_lookback=int(args.corr_lookback),
        risk_budget=bool(args.risk_budget),
        max_turnover=float(args.max_turnover),
        pf_dd_threshold=float(args.pf_dd_threshold),
        pf_dd_floor_gross=float(args.pf_dd_floor_gross),
        glidepath=False,
        build_max_dd=0.25,
        coast_max_dd=0.15,
        coast_multiple=2.0,
        cppi_mult=3.0,
    )

    pos = res.get("positions")
    if not isinstance(pos, pd.DataFrame) or pos.empty:
        print("No positions produced.")
        return 2

    as_of = pd.Timestamp(pos.index[-1])
    w = pos.iloc[-1].fillna(0.0)

    payload = {
        "strategy": "alpha_eventproxy_cfg12",
        "as_of_month": str(as_of.date()),
        "weights": _as_float_map(w),
        "weight_summary": {"sum": float(w.sum()), "max": float(w.max()) if len(w) else 0.0},
        "inputs": {
            "panel": str(args.panel),
            "feature_cache": str(args.feature_cache),
            "benchmark": str(args.benchmark),
            "cash_ticker": str(args.cash_ticker),
        },
        "params": {
            "train_months": int(args.train_months),
            "top_n": int(args.top_n),
            "max_weight": float(args.max_weight),
            "cost_bps": float(args.cost_bps),
            "lam_grid": [float(x) for x in args.lam_grid],
            "min_assets": int(args.min_assets),
            "target_vol": float(args.target_vol),
            "vol_lookback": int(args.vol_lookback),
            "max_gross": float(args.max_gross),
            "allow_leverage": bool(args.allow_leverage),
            "regime_filter": bool(args.regime_filter),
            "regime_window": int(args.regime_window),
            "regime_off_gross": float(args.regime_off_gross),
            "base": str(args.base),
            "alpha_mode": str(args.alpha_mode),
            "ic_months": int(args.ic_months),
            "alpha_tstat_scale": float(args.alpha_tstat_scale),
            "corr_filter": bool(args.corr_filter),
            "corr_threshold": float(args.corr_threshold),
            "corr_lookback": int(args.corr_lookback),
            "risk_budget": bool(args.risk_budget),
            "max_turnover": float(args.max_turnover),
            "pf_dd_threshold": float(args.pf_dd_threshold),
            "pf_dd_floor_gross": float(args.pf_dd_floor_gross),
        },
        "notes": [
            "Monthly weights exported for passive rebalance; not execution code.",
            "As-of month is the last month-end available in the input panel.",
        ],
    }
    _write_json(Path(args.out), payload)
    print(f"Wrote signal: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

