#!/usr/bin/env python3
"""
Cross-sectional stock picker (Refinitiv-derived factors) with monthly rebalance.

Goal:
  Construct a signal using Refinitiv fields (skew, vol term structure,
  short interest) + momentum and evaluate vs SPY on 1-month windows.

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd


def load_factor_panel(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Need columns {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    # Normalize missing optional fields.
    for c in ["Volume", "Vol30", "Vol360", "Skew25", "ShortInterest"]:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def _zscore_cs(x: pd.Series) -> pd.Series:
    x = x.astype(float)
    mu = x.mean(skipna=True)
    sd = x.std(skipna=True, ddof=0)
    if not np.isfinite(sd) or sd == 0:
        return x * 0.0
    return (x - mu) / sd


def _winsorize(x: pd.Series, p: float = 0.01) -> pd.Series:
    lo = x.quantile(p)
    hi = x.quantile(1 - p)
    return x.clip(lower=lo, upper=hi)


@dataclass(frozen=True)
class Perf:
    start: str
    end: str
    n: int
    cagr: float
    sharpe: float
    mdd: float
    final_equity: float


def _perf(returns: pd.Series, *, ann_factor: float = 252.0) -> Perf:
    r = returns.fillna(0.0)
    eq = (1.0 + r).cumprod()
    n = len(r)
    vol = float(r.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((r.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / n) - 1.0) if n > 1 else 0.0
    dd = (eq / eq.cummax() - 1.0).min() if not eq.empty else 0.0
    return Perf(
        start=str(eq.index.min().date()) if not eq.empty else "",
        end=str(eq.index.max().date()) if not eq.empty else "",
        n=int(n),
        cagr=cagr,
        sharpe=sharpe,
        mdd=float(dd),
        final_equity=float(eq.iloc[-1]) if not eq.empty else 1.0,
    )


def run_stock_picker(
    df: pd.DataFrame,
    *,
    top_n: int,
    bottom_n: int,
    rebalance_every: int,
    max_weight: float,
    gross: float,
    cost_bps: float,
    lookback_mom: int,
    w_mom: float,
    w_skew: float,
    w_term: float,
    w_short: float,
    min_price: float,
    min_volume: float,
) -> Dict[str, Any]:
    top_n = int(max(1, top_n))
    bottom_n = int(max(0, bottom_n))
    rebalance_every = int(max(1, rebalance_every))
    gross = float(max(0.0, gross))
    max_weight = float(np.clip(max_weight, 0.0, 1.0))

    df = df.sort_values(["Date", "Instrument"]).copy()
    dates = pd.DatetimeIndex(sorted(df["Date"].unique()))

    # Wide pivots for price/volume.
    px = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    base_idx = px.index
    vol = (
        df.pivot_table(index="Date", columns="Instrument", values="Volume", aggfunc="last")
        .sort_index()
        .reindex(base_idx)
        .ffill(limit=5)
    )
    skew = (
        df.pivot_table(index="Date", columns="Instrument", values="Skew25", aggfunc="last")
        .sort_index()
        .reindex(base_idx)
        .ffill(limit=5)
    )
    v30 = (
        df.pivot_table(index="Date", columns="Instrument", values="Vol30", aggfunc="last")
        .sort_index()
        .reindex(base_idx)
        .ffill(limit=5)
    )
    v360 = (
        df.pivot_table(index="Date", columns="Instrument", values="Vol360", aggfunc="last")
        .sort_index()
        .reindex(base_idx)
        .ffill(limit=5)
    )
    short = (
        df.pivot_table(index="Date", columns="Instrument", values="ShortInterest", aggfunc="last")
        .sort_index()
        .reindex(base_idx)
        .ffill(limit=5)
    )

    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)

    # Precompute momentum.
    mom = (px / px.shift(lookback_mom) - 1.0).replace([np.inf, -np.inf], np.nan)
    term = (v30 - v360).replace([np.inf, -np.inf], np.nan)

    w_prev = pd.Series(0.0, index=px.columns, dtype=float)
    pnl = []
    out_dates = []

    for i, dt in enumerate(px.index[:-1]):
        if (i % rebalance_every) == 0:
            # Universe filter.
            p = px.loc[dt]
            v = vol.loc[dt] if dt in vol.index else pd.Series(index=p.index, dtype=float)
            eligible = (p >= float(min_price)) & (v.fillna(0.0) >= float(min_volume))

            # Cross-sectional signals.
            sig = pd.DataFrame(
                {
                    "mom": mom.loc[dt],
                    "skew": skew.loc[dt],
                    "term": term.loc[dt],
                    "short": short.loc[dt],
                }
            )
            sig = sig.where(eligible)
            # Winsorize each column cross-sectionally, then z-score.
            for c in sig.columns:
                sig[c] = _winsorize(sig[c])
                sig[c] = _zscore_cs(sig[c])

            score = (
                float(w_mom) * sig["mom"].fillna(0.0)
                + float(w_skew) * sig["skew"].fillna(0.0)
                + float(w_term) * sig["term"].fillna(0.0)
                + float(w_short) * sig["short"].fillna(0.0)
            )

            # Select longs and optional shorts.
            score = score.replace([np.inf, -np.inf], np.nan).dropna()
            if score.empty:
                w = w_prev
            else:
                longs = score.sort_values(ascending=False).head(top_n).index.tolist()
                shorts = score.sort_values(ascending=True).head(bottom_n).index.tolist() if bottom_n > 0 else []

                w = pd.Series(0.0, index=px.columns, dtype=float)
                if longs:
                    w.loc[longs] = 1.0 / len(longs)
                if shorts:
                    w.loc[shorts] = -1.0 / len(shorts)

                # Scale to gross.
                if w.abs().sum() > 0:
                    w = w * (gross / float(w.abs().sum()))
                # Cap weights and renormalize gross.
                if max_weight > 0:
                    w = w.clip(lower=-max_weight, upper=max_weight)
                    if w.abs().sum() > 0:
                        w = w * (gross / float(w.abs().sum()))

        else:
            w = w_prev

        turn = float((w - w_prev).abs().sum())
        tc = float((cost_bps / 10000.0) * turn) if cost_bps > 0 else 0.0

        r_next = rets.shift(-1).loc[dt].fillna(0.0)
        r = float((w * r_next).sum()) - tc
        pnl.append(r)
        out_dates.append(dt)
        w_prev = w

    pnl_s = pd.Series(pnl, index=pd.DatetimeIndex(out_dates), name="pnl").fillna(0.0)
    eq = (1.0 + pnl_s).cumprod()

    return {"pnl": pnl_s, "equity": eq, "perf": asdict(_perf(pnl_s))}


def rolling_excess_hit_rates(
    strat_pnl: pd.Series,
    bench_pnl: pd.Series,
    *,
    window: int = 21,
    thresholds: List[float] = [0.0, 0.02, 0.05, 0.10],
) -> Dict[str, Any]:
    strat_pnl = strat_pnl.reindex(bench_pnl.index).fillna(0.0)
    bench_pnl = bench_pnl.fillna(0.0)
    a = np.log1p(strat_pnl) - np.log1p(bench_pnl)
    ex = np.expm1(a.rolling(window, min_periods=window).sum()).dropna()
    if ex.empty:
        return {"window": window, "n": 0, "thresholds": thresholds, "hit_rates": {}}
    hit = {str(t): float((ex >= float(t)).mean()) for t in thresholds}
    return {
        "window": window,
        "n": int(len(ex)),
        "thresholds": thresholds,
        "hit_rates": hit,
        "median_excess": float(ex.median()),
        "p10_excess": float(ex.quantile(0.10)),
        "p90_excess": float(ex.quantile(0.90)),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Refinitiv cross-sectional stock picker (monthly).")
    ap.add_argument("--panel", type=Path, required=True, help="Tidy factor panel CSV.")
    ap.add_argument("--benchmark-panel", type=Path, required=True, help="Tidy yfinance panel CSV containing SPY.")
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/refinitiv_stock_picker"))

    ap.add_argument("--top-n", type=int, default=30)
    ap.add_argument("--bottom-n", type=int, default=30)
    ap.add_argument("--rebalance-every", type=int, default=21)
    ap.add_argument("--gross", type=float, default=1.0)
    ap.add_argument("--max-weight", type=float, default=0.10)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--lookback-mom", type=int, default=63)

    ap.add_argument("--w-mom", type=float, default=1.0)
    ap.add_argument("--w-skew", type=float, default=-0.5, help="Negative means prefer lower skew (less fear).")
    ap.add_argument("--w-term", type=float, default=-0.5, help="Negative means prefer less inverted term structure.")
    ap.add_argument("--w-short", type=float, default=-0.2, help="Negative means avoid crowded shorts.")

    ap.add_argument("--min-price", type=float, default=5.0)
    ap.add_argument("--min-volume", type=float, default=1_000_000.0)

    ap.add_argument("--eval-months", type=int, default=24, help="Evaluate last N months (~21 bars per month).")
    args = ap.parse_args()

    df = load_factor_panel(args.panel)

    # Benchmark: use SPY from yfinance tidy panel (close-only).
    bench = pd.read_csv(args.benchmark_panel, parse_dates=["Date"])
    bench = bench[bench["Instrument"] == "SPY"].dropna(subset=["Date", "Price_Close"]).copy()
    bpx = bench.sort_values("Date").set_index("Date")["Price_Close"].astype(float)
    bret = bpx.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    # Align evaluation window to last N months within intersection.
    px_dates = pd.DatetimeIndex(sorted(df["Date"].unique()))
    common = px_dates.intersection(bret.index)
    if common.empty:
        print("No overlapping dates between factor panel and benchmark.")
        return 2
    if int(args.eval_months) > 0:
        n = int(args.eval_months) * 21
        common = common[-max(60, n) :]
    df = df[df["Date"].isin(common)].copy()
    bret = bret.reindex(common).fillna(0.0)

    res = run_stock_picker(
        df,
        top_n=int(args.top_n),
        bottom_n=int(args.bottom_n),
        rebalance_every=int(args.rebalance_every),
        max_weight=float(args.max_weight),
        gross=float(args.gross),
        cost_bps=float(args.cost_bps),
        lookback_mom=int(args.lookback_mom),
        w_mom=float(args.w_mom),
        w_skew=float(args.w_skew),
        w_term=float(args.w_term),
        w_short=float(args.w_short),
        min_price=float(args.min_price),
        min_volume=float(args.min_volume),
    )

    strat = res["pnl"]
    active = strat.reindex(bret.index).fillna(0.0) - bret
    active_eq = (1.0 + active).cumprod()
    excess_final = float(res["equity"].iloc[-1] / (1.0 + bret).cumprod().iloc[-1] - 1.0)
    monthly = rolling_excess_hit_rates(strat, bret, window=21, thresholds=[0.0, 0.02, 0.05, 0.10])

    out = {
        "strategy": res["perf"],
        "benchmark": asdict(_perf(bret)),
        "active": {
            "excess_final": excess_final,
            "active_sharpe": asdict(_perf(active))["sharpe"],
            "active_final_equity": float(active_eq.iloc[-1]),
        },
        "monthly_vs_spy": monthly,
        "params": {
            "top_n": args.top_n,
            "bottom_n": args.bottom_n,
            "rebalance_every": args.rebalance_every,
            "gross": args.gross,
            "max_weight": args.max_weight,
            "cost_bps": args.cost_bps,
            "lookback_mom": args.lookback_mom,
            "w_mom": args.w_mom,
            "w_skew": args.w_skew,
            "w_term": args.w_term,
            "w_short": args.w_short,
            "min_price": args.min_price,
            "min_volume": args.min_volume,
            "eval_months": args.eval_months,
        },
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(out, indent=2) + "\n")
    (args.out_dir / "equity.csv").write_text(res["equity"].to_csv())
    (args.out_dir / "benchmark_equity.csv").write_text(((1.0 + bret).cumprod()).to_csv())
    (args.out_dir / "pnl.csv").write_text(strat.to_csv())
    (args.out_dir / "benchmark_pnl.csv").write_text(bret.to_csv())

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
