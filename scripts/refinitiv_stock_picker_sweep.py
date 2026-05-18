#!/usr/bin/env python3
"""
Random sweep for the Refinitiv cross-sectional stock picker.

Optimizes for monthly (21-bar) excess vs SPY over a chosen evaluation window.
This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd


def _winsorize_arr(x: np.ndarray, p: float = 0.01) -> np.ndarray:
    if x.size == 0:
        return x
    lo = np.nanquantile(x, p)
    hi = np.nanquantile(x, 1 - p)
    return np.clip(x, lo, hi)


def _zscore_arr(x: np.ndarray) -> np.ndarray:
    mu = np.nanmean(x)
    sd = np.nanstd(x)
    if not np.isfinite(sd) or sd == 0:
        return np.zeros_like(x)
    return (x - mu) / sd


def _rolling_excess_final(strat: np.ndarray, bench: np.ndarray, window: int) -> np.ndarray:
    # log relative equity window sums
    a = np.log1p(strat) - np.log1p(bench)
    out = np.full_like(a, np.nan, dtype=float)
    if len(a) < window:
        return out
    c = np.cumsum(np.nan_to_num(a, nan=0.0))
    out[window - 1 :] = np.expm1(c[window - 1 :] - np.concatenate(([0.0], c[:-window])))
    return out


@dataclass(frozen=True)
class Candidate:
    score: float
    hit_rate_0: float
    hit_rate_2: float
    hit_rate_5: float
    median_excess: float
    p10_excess: float
    p90_excess: float
    full_excess_final: float
    full_mdd: float
    params: Dict[str, Any]


def _max_drawdown(eq: np.ndarray) -> float:
    if eq.size == 0:
        return 0.0
    peak = np.maximum.accumulate(eq)
    dd = (eq / peak) - 1.0
    return float(np.nanmin(dd))


def _simulate(
    dates: np.ndarray,
    tickers: list[str],
    px: np.ndarray,
    vol: np.ndarray,
    skew: np.ndarray,
    term: np.ndarray,
    short: np.ndarray,
    bench_ret: np.ndarray,
    *,
    top_n: int,
    bottom_n: int,
    rebalance_every: int,
    gross: float,
    max_weight: float,
    cost_bps: float,
    mom: np.ndarray,
    w_mom: float,
    w_skew: float,
    w_term: float,
    w_short: float,
    min_price: float,
    min_volume: float,
) -> Tuple[np.ndarray, np.ndarray]:
    n_days, n_assets = px.shape
    rets = np.zeros((n_days, n_assets), dtype=float)
    rets[1:] = (px[1:] / px[:-1]) - 1.0
    rets[~np.isfinite(rets)] = 0.0

    w_prev = np.zeros(n_assets, dtype=float)
    pnl = np.zeros(n_days - 1, dtype=float)

    top_n = max(1, int(top_n))
    bottom_n = max(0, int(bottom_n))
    rebalance_every = max(1, int(rebalance_every))
    gross = float(max(0.0, gross))
    max_weight = float(np.clip(max_weight, 0.0, 1.0))
    cost = float(cost_bps) / 10000.0

    for t in range(n_days - 1):
        do_reb = (t % rebalance_every) == 0
        if do_reb:
            eligible = (px[t] >= float(min_price)) & (np.nan_to_num(vol[t], nan=0.0) >= float(min_volume))

            mom_t = mom[t].copy()
            skew_t = skew[t].copy()
            term_t = term[t].copy()
            short_t = short[t].copy()

            # Mask ineligible as nan.
            mom_t[~eligible] = np.nan
            skew_t[~eligible] = np.nan
            term_t[~eligible] = np.nan
            short_t[~eligible] = np.nan

            # Winsorize + zscore cross-sectionally.
            mom_z = _zscore_arr(_winsorize_arr(mom_t))
            skew_z = _zscore_arr(_winsorize_arr(skew_t))
            term_z = _zscore_arr(_winsorize_arr(term_t))
            short_z = _zscore_arr(_winsorize_arr(short_t))

            score = (w_mom * mom_z) + (w_skew * skew_z) + (w_term * term_z) + (w_short * short_z)
            score[~np.isfinite(score)] = np.nan
            idx = np.where(np.isfinite(score))[0]
            if idx.size == 0:
                w = w_prev
            else:
                order = idx[np.argsort(score[idx])]
                longs = order[::-1][:top_n]
                shorts = order[:bottom_n] if bottom_n > 0 else np.array([], dtype=int)

                w = np.zeros(n_assets, dtype=float)
                if longs.size > 0:
                    w[longs] += 1.0 / float(longs.size)
                if shorts.size > 0:
                    w[shorts] -= 1.0 / float(shorts.size)

                s = np.sum(np.abs(w))
                if s > 0:
                    w *= (gross / s)

                if max_weight > 0:
                    w = np.clip(w, -max_weight, max_weight)
                    s2 = np.sum(np.abs(w))
                    if s2 > 0:
                        w *= (gross / s2)
        else:
            w = w_prev

        turn = np.sum(np.abs(w - w_prev))
        tc = cost * turn
        r_next = np.dot(w, rets[t + 1])
        pnl[t] = float(r_next - tc)
        w_prev = w

    eq = np.cumprod(1.0 + pnl)
    return pnl, eq


def main() -> int:
    ap = argparse.ArgumentParser(description="Sweep Refinitiv cross-sectional stock picker.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--benchmark-panel", type=Path, required=True, help="yfinance tidy CSV with SPY.")
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/refinitiv_stock_picker/sweep"))
    ap.add_argument("--eval-months", type=int, default=60)
    ap.add_argument("--max-evals", type=int, default=120)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    df = pd.read_csv(args.panel, parse_dates=["Date"])
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    for c in ["Volume", "Vol30", "Vol360", "Skew25", "ShortInterest"]:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Benchmark SPY returns (yfinance).
    bench = pd.read_csv(args.benchmark_panel, parse_dates=["Date"])
    bench = bench[bench["Instrument"] == "SPY"].dropna(subset=["Date", "Price_Close"]).copy()
    bpx = bench.sort_values("Date").set_index("Date")["Price_Close"].astype(float)
    bret = bpx.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    # Align eval window to factor panel dates intersection.
    dates = pd.DatetimeIndex(sorted(df["Date"].unique()))
    common = dates.intersection(bret.index)
    if common.empty:
        print("No overlap between factor panel and benchmark.")
        return 2
    if int(args.eval_months) > 0:
        n = int(args.eval_months) * 21
        common = common[-max(200, n) :]

    df = df[df["Date"].isin(common)].copy()
    bret = bret.reindex(common).fillna(0.0)

    # Wide matrices (reindex to common).
    px_df = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    tickers = list(px_df.columns)
    idx = px_df.index
    # Reindex benchmark to strategy timeline.
    bret = bret.reindex(idx).fillna(0.0)

    vol_df = (
        df.pivot_table(index="Date", columns="Instrument", values="Volume", aggfunc="last")
        .reindex(idx)
        .reindex(columns=tickers)
        .ffill(limit=5)
    )
    skew_df = (
        df.pivot_table(index="Date", columns="Instrument", values="Skew25", aggfunc="last")
        .reindex(idx)
        .reindex(columns=tickers)
        .ffill(limit=5)
    )
    v30_df = (
        df.pivot_table(index="Date", columns="Instrument", values="Vol30", aggfunc="last")
        .reindex(idx)
        .reindex(columns=tickers)
        .ffill(limit=5)
    )
    v360_df = (
        df.pivot_table(index="Date", columns="Instrument", values="Vol360", aggfunc="last")
        .reindex(idx)
        .reindex(columns=tickers)
        .ffill(limit=5)
    )
    short_df = (
        df.pivot_table(index="Date", columns="Instrument", values="ShortInterest", aggfunc="last")
        .reindex(idx)
        .reindex(columns=tickers)
        .ffill(limit=5)
    )

    px = px_df.to_numpy(dtype=float)
    vol = vol_df.to_numpy(dtype=float)
    skew = skew_df.to_numpy(dtype=float)
    term = (v30_df - v360_df).to_numpy(dtype=float)
    short = short_df.to_numpy(dtype=float)
    bench_ret = bret.to_numpy(dtype=float)

    # Precompute momentum lookbacks we might sample.
    mom_21 = (px / np.roll(px, 21, axis=0) - 1.0)
    mom_63 = (px / np.roll(px, 63, axis=0) - 1.0)
    mom_126 = (px / np.roll(px, 126, axis=0) - 1.0)
    mom_21[:21] = np.nan
    mom_63[:63] = np.nan
    mom_126[:126] = np.nan

    rng = random.Random(int(args.seed))
    cands: List[Candidate] = []

    def sample_params() -> Dict[str, Any]:
        return {
            "top_n": rng.choice([10, 20, 30, 50]),
            "bottom_n": rng.choice([0, 10, 20, 30]),
            "rebalance_every": rng.choice([5, 10, 21]),
            "gross": rng.choice([1.0, 1.5, 2.0]),
            "max_weight": rng.choice([0.05, 0.10, 0.15]),
            "cost_bps": rng.choice([5.0, 10.0, 20.0]),
            "mom_lb": rng.choice([21, 63, 126]),
            "w_mom": rng.uniform(0.0, 1.5),
            "w_skew": rng.uniform(-1.5, 1.5),
            "w_term": rng.uniform(-1.5, 1.5),
            "w_short": rng.uniform(-0.8, 0.8),
            "min_price": rng.choice([2.0, 5.0, 10.0]),
            "min_volume": rng.choice([0.0, 200_000.0, 1_000_000.0]),
        }

    for _ in range(int(args.max_evals)):
        par = sample_params()
        mom = mom_63 if par["mom_lb"] == 63 else (mom_21 if par["mom_lb"] == 21 else mom_126)
        pnl, eq = _simulate(
            idx.to_numpy(),
            tickers,
            px,
            vol,
            skew,
            term,
            short,
            bench_ret,
            top_n=int(par["top_n"]),
            bottom_n=int(par["bottom_n"]),
            rebalance_every=int(par["rebalance_every"]),
            gross=float(par["gross"]),
            max_weight=float(par["max_weight"]),
            cost_bps=float(par["cost_bps"]),
            mom=mom,
            w_mom=float(par["w_mom"]),
            w_skew=float(par["w_skew"]),
            w_term=float(par["w_term"]),
            w_short=float(par["w_short"]),
            min_price=float(par["min_price"]),
            min_volume=float(par["min_volume"]),
        )
        if eq.size < 200:
            continue

        bench_eq = np.cumprod(1.0 + bench_ret[1 : 1 + len(pnl)])
        full_excess = float(eq[-1] / bench_eq[-1] - 1.0)
        full_mdd = _max_drawdown(eq)

        ex = _rolling_excess_final(pnl, bench_ret[1 : 1 + len(pnl)], window=21)
        ex = ex[np.isfinite(ex)]
        if ex.size < 100:
            continue
        med = float(np.median(ex))
        p10 = float(np.quantile(ex, 0.10))
        p90 = float(np.quantile(ex, 0.90))
        h0 = float(np.mean(ex >= 0.0))
        h2 = float(np.mean(ex >= 0.02))
        h5 = float(np.mean(ex >= 0.05))

        # Score: prefer positive median + high hit-rate + avoid deep drawdowns.
        score = (2.0 * med) + (1.0 * h2) + (0.5 * h0) + (0.3 * full_excess) - (0.8 * abs(min(0.0, p10))) - (0.2 * abs(full_mdd))
        cands.append(
            Candidate(
                score=score,
                hit_rate_0=h0,
                hit_rate_2=h2,
                hit_rate_5=h5,
                median_excess=med,
                p10_excess=p10,
                p90_excess=p90,
                full_excess_final=full_excess,
                full_mdd=full_mdd,
                params=par,
            )
        )

    cands.sort(key=lambda c: c.score, reverse=True)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = {
        "panel": str(args.panel),
        "benchmark_panel": str(args.benchmark_panel),
        "eval_months": int(args.eval_months),
        "max_evals": int(args.max_evals),
        "seed": int(args.seed),
        "n_scored": int(len(cands)),
        "top": [asdict(c) for c in cands[:25]],
    }
    (args.out_dir / "sweep.json").write_text(json.dumps(out, indent=2) + "\n")
    if cands:
        (args.out_dir / "best_params.json").write_text(json.dumps(cands[0].params, indent=2) + "\n")
        print(json.dumps(asdict(cands[0]), indent=2))
    else:
        print(json.dumps({"n_scored": 0}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
