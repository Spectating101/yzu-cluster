#!/usr/bin/env python3
"""
Randomized contiguous-window evaluation for any equity curves (strategy vs benchmark).

Reads:
  - equity.csv (single column with Date index OR two columns [Date,value])
  - benchmark_equity.csv

Writes:
  - windows.csv: per-window metrics
  - summary.json: distribution + beat rate
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

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


def _read_equity(path: Path) -> pd.Series:
    df = pd.read_csv(path)
    if df.shape[1] == 1:
        # Already single column without explicit Date column
        s = pd.read_csv(path, index_col=0).iloc[:, 0]
    else:
        if "Date" in df.columns:
            s = pd.read_csv(path, parse_dates=["Date"]).set_index("Date").iloc[:, 0]
        else:
            s = pd.read_csv(path, index_col=0).iloc[:, 0]
    s.index = pd.to_datetime(s.index)
    return s.astype(float).sort_index()


def _equity_to_returns(eq: pd.Series) -> pd.Series:
    if eq.empty:
        return eq
    r = eq.pct_change(fill_method=None)
    r.iloc[0] = float(eq.iloc[0] - 1.0)
    return r.astype(float)


def _perf(returns: pd.Series, *, ann_factor: float = 252.0) -> Perf:
    r = returns.fillna(0.0).astype(float)
    eq = (1.0 + r).cumprod()
    n = int(len(r))
    vol = float(r.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((r.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / max(1, n)) - 1.0) if n > 1 else 0.0
    mdd = float((eq / eq.cummax() - 1.0).min()) if not eq.empty else 0.0
    total_return = float(eq.iloc[-1] - 1.0) if not eq.empty else 0.0
    return Perf(
        start=str(eq.index.min().date()) if not eq.empty else "",
        end=str(eq.index.max().date()) if not eq.empty else "",
        n=n,
        total_return=total_return,
        cagr=cagr,
        sharpe=sharpe,
        mdd=mdd,
    )


def _pick_windows(n_obs: int, *, n_samples: int, min_len: int, max_len: int, rng: np.random.Generator) -> List[Tuple[int, int]]:
    if n_obs <= 0:
        return []
    min_len = int(max(5, min_len))
    max_len = int(max(min_len, max_len))
    max_len = int(min(max_len, n_obs))
    out: List[Tuple[int, int]] = []
    for _ in range(int(n_samples)):
        L = int(rng.integers(min_len, max_len + 1))
        start = int(rng.integers(0, n_obs - L + 1))
        out.append((start, start + L))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Sample random windows for equity curves.")
    ap.add_argument("--equity", type=Path, required=True)
    ap.add_argument("--benchmark-equity", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--n-samples", type=int, default=1000)
    ap.add_argument("--min-days", type=int, default=21)
    ap.add_argument("--max-days", type=int, default=252)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    eq = _read_equity(args.equity)
    beq = _read_equity(args.benchmark_equity)
    eq, beq = eq.align(beq, join="inner")
    r = _equity_to_returns(eq)
    br = _equity_to_returns(beq)
    df = pd.DataFrame({"strategy_ret": r, "benchmark_ret": br}).dropna()
    if df.empty:
        raise SystemExit("No overlapping rows between equity curves.")

    rng = np.random.default_rng(int(args.seed))
    windows = _pick_windows(len(df), n_samples=int(args.n_samples), min_len=int(args.min_days), max_len=int(args.max_days), rng=rng)
    rows: List[Dict[str, object]] = []
    for start, end in windows:
        d = df.iloc[start:end]
        sp = _perf(d["strategy_ret"])
        bp = _perf(d["benchmark_ret"])
        active_excess = float(((1.0 + d["strategy_ret"]).prod() / max(1e-12, (1.0 + d["benchmark_ret"]).prod())) - 1.0)
        rows.append(
            {
                "start": sp.start,
                "end": sp.end,
                "n": int(sp.n),
                "strategy_total_return": float(sp.total_return),
                "strategy_sharpe": float(sp.sharpe),
                "strategy_mdd": float(sp.mdd),
                "benchmark_total_return": float(bp.total_return),
                "benchmark_sharpe": float(bp.sharpe),
                "benchmark_mdd": float(bp.mdd),
                "active_excess_total_return": float(active_excess),
            }
        )

    out_df = pd.DataFrame(rows)
    summary = {
        "full": {"strategy": asdict(_perf(df["strategy_ret"])), "benchmark": asdict(_perf(df["benchmark_ret"]))},
        "windows": {
            "n": int(len(out_df)),
            "beat_rate": float((out_df["active_excess_total_return"] > 0).mean()) if len(out_df) else 0.0,
            "p10_active_excess": float(out_df["active_excess_total_return"].quantile(0.10)) if len(out_df) else 0.0,
            "p50_active_excess": float(out_df["active_excess_total_return"].quantile(0.50)) if len(out_df) else 0.0,
            "p90_active_excess": float(out_df["active_excess_total_return"].quantile(0.90)) if len(out_df) else 0.0,
        },
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(out_dir / "windows.csv", index=False)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

