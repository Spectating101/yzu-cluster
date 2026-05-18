#!/usr/bin/env python3
"""
Evaluate a single-year slice from a dynamic-regime run directory.

This uses `regime_log.csv`'s EndDate column (preferred) to avoid start/end-date ambiguity:
returns decided on Date=t are realized on EndDate=t+1.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Perf:
    start: str
    end: str
    n: int
    total_return: float
    cagr: float
    sharpe: float
    mdd: float
    final_equity: float


def _perf_from_returns(returns: pd.Series, *, ann_factor: float = 252.0) -> Perf:
    r = returns.fillna(0.0)
    eq = (1.0 + r).cumprod()
    n = int(len(r))
    vol = float(r.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((r.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / max(1, n)) - 1.0) if n > 1 else 0.0
    dd = float((eq / eq.cummax() - 1.0).min()) if not eq.empty else 0.0
    total_return = float(eq.iloc[-1] - 1.0) if not eq.empty else 0.0
    return Perf(
        start=str(eq.index.min().date()) if not eq.empty else "",
        end=str(eq.index.max().date()) if not eq.empty else "",
        n=n,
        total_return=total_return,
        cagr=float(cagr),
        sharpe=float(sharpe),
        mdd=float(dd),
        final_equity=float(eq.iloc[-1]) if not eq.empty else 1.0,
    )


def _read_equity(path: Path) -> pd.Series:
    s = pd.read_csv(path, index_col=0).iloc[:, 0]
    s.index = pd.to_datetime(s.index)
    s.name = path.stem
    return s.astype(float)


def _equity_to_returns(eq: pd.Series) -> pd.Series:
    if eq.empty:
        return eq
    r = eq.pct_change(fill_method=None)
    r.iloc[0] = float(eq.iloc[0] - 1.0)
    return r.astype(float)


def _align_returns_to_end_dates(
    returns_start: pd.Series, regime_log: pd.DataFrame
) -> Tuple[pd.Series, pd.DatetimeIndex]:
    if "EndDate" in regime_log.columns:
        end_dates = pd.to_datetime(regime_log["EndDate"])
    else:
        end_dates = pd.to_datetime(regime_log["Date"])
    if len(end_dates) != len(returns_start):
        raise SystemExit(
            f"Length mismatch: {len(returns_start)} returns vs {len(end_dates)} regime_log rows. "
            "Re-run the dynamic regime runner so artifacts match."
        )
    returns_end = returns_start.copy()
    returns_end.index = end_dates
    return returns_end, end_dates


def _top_holdings(weights: pd.DataFrame, *, min_days: int = 1) -> pd.DataFrame:
    nonzero = weights.ne(0.0)
    days_held = nonzero.sum(axis=0).astype(int)
    avg_weight = weights.mean(axis=0)
    avg_abs_weight = weights.abs().mean(axis=0)
    max_weight = weights.max(axis=0)

    out = pd.DataFrame(
        {
            "days_held": days_held,
            "pct_days": days_held / max(1, len(weights)),
            "avg_weight": avg_weight,
            "avg_abs_weight": avg_abs_weight,
            "max_weight": max_weight,
        }
    )
    out = out[out["days_held"] >= int(min_days)]
    out = out.sort_values(["days_held", "avg_abs_weight"], ascending=False)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate a year slice for a dynamic-regime run directory.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument("--min-holding-days", type=int, default=5)
    ap.add_argument(
        "--launch-date",
        type=str,
        default="",
        help="Optional: exclude returns whose decision Date is before this (YYYY-MM-DD).",
    )
    args = ap.parse_args()

    run_dir = args.run_dir
    eq = _read_equity(run_dir / "equity.csv")
    beq = _read_equity(run_dir / "benchmark_equity.csv")
    regime_log = pd.read_csv(run_dir / "regime_log.csv")
    weights = pd.read_csv(run_dir / "weights.csv", index_col=0)
    weights.index = pd.to_datetime(weights.index)
    weights = weights.astype(float)

    # Returns are labeled by start date in equity.csv; we relabel to EndDate for slicing.
    r_start = _equity_to_returns(eq)
    br_start = _equity_to_returns(beq)
    r_end, end_dates = _align_returns_to_end_dates(r_start, regime_log)
    br_end, _ = _align_returns_to_end_dates(br_start, regime_log)

    year_mask = (end_dates.dt.year == int(args.year)).to_numpy()
    if str(args.launch_date).strip():
        launch_dt = pd.to_datetime(str(args.launch_date)).normalize()
        decision_dates = pd.to_datetime(regime_log["Date"]).dt.normalize()
        year_mask = year_mask & (decision_dates >= launch_dt).to_numpy()
    r_y = r_end.loc[end_dates[year_mask]]
    br_y = br_end.loc[end_dates[year_mask]]

    perf = _perf_from_returns(r_y)
    bperf = _perf_from_returns(br_y)
    active_excess = float((perf.final_equity / max(1e-12, bperf.final_equity)) - 1.0)

    # Holdings during this year's realized returns are the weights decided on the prior Date row.
    if len(weights) != len(regime_log):
        raise SystemExit(
            f"Length mismatch: {len(weights)} weights vs {len(regime_log)} regime_log rows. "
            "Re-run the dynamic regime runner so artifacts match."
        )
    weights_y = weights.loc[pd.to_datetime(regime_log.loc[year_mask, "Date"])]
    top = _top_holdings(weights_y, min_days=int(args.min_holding_days))

    # Regime counts for the year (by realized return dates).
    regimes_y = regime_log.loc[year_mask, "regime"].value_counts(dropna=False).rename("days")
    regimes_y = regimes_y.to_frame().reset_index().rename(columns={"index": "regime"})

    out_dir = args.out_dir or (run_dir / f"year_slices/{int(args.year)}")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    summary: Dict[str, object] = {
        "year": int(args.year),
        "run_dir": str(run_dir),
        "strategy": asdict(perf),
        "benchmark": asdict(bperf),
        "active_excess_total_return": active_excess,
        "n_days": int(perf.n),
        "top_holdings_path": str(out_dir / f"top_holdings_{int(args.year)}.csv"),
        "regime_counts_path": str(out_dir / f"regime_counts_{int(args.year)}.csv"),
    }

    (out_dir / f"summary_{int(args.year)}.json").write_text(json.dumps(summary, indent=2) + "\n")
    top.to_csv(out_dir / f"top_holdings_{int(args.year)}.csv", index_label="ticker")
    regimes_y.to_csv(out_dir / f"regime_counts_{int(args.year)}.csv", index=False)

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
