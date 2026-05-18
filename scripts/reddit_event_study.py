#!/usr/bin/env python3
"""
Reddit event study + simple signal backtest (alternative data validation).

Inputs:
  - reddit_daily_signals.parquet from scripts/reddit_daily_signals.py
  - tidy price panel (Instrument, Date, Price_Close) containing those tickers

Outputs:
  - event_study_summary.json
  - event_study_events.csv
  - optional daily long-only portfolio series

This is research tooling, not investment advice.
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
class HorizonStats:
    horizon: int
    n_events: int
    mean_return: float
    median_return: float
    win_rate: float
    t_stat: float


def _t_stat(x: np.ndarray) -> float:
    x = x[np.isfinite(x)]
    if len(x) < 5:
        return 0.0
    mu = float(x.mean())
    sd = float(x.std(ddof=1))
    if sd == 0:
        return 0.0
    return float(mu / (sd / np.sqrt(len(x))))


def _load_prices(panel: Path) -> pd.DataFrame:
    df = pd.read_csv(panel)
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise SystemExit(f"Panel missing columns: {sorted(need)}")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"])
    px = df.pivot(index="Date", columns="Instrument", values="Price_Close").sort_index().ffill()
    return px


def _forward_return(px: pd.Series, dt: pd.Timestamp, horizon: int) -> float:
    if dt not in px.index:
        return float("nan")
    idx = px.index.get_indexer([dt])[0]
    j = idx + int(horizon)
    if idx < 0 or j >= len(px.index):
        return float("nan")
    p0 = float(px.iloc[idx])
    p1 = float(px.iloc[j])
    if not np.isfinite(p0) or p0 == 0 or not np.isfinite(p1):
        return float("nan")
    return float(p1 / p0 - 1.0)


def _event_mask(
    df: pd.DataFrame,
    *,
    novelty_z_min: float,
    min_posts: int,
    sentiment_min: float,
) -> pd.Series:
    m = pd.Series(True, index=df.index)
    if "novelty_30d_z" in df.columns and np.isfinite(novelty_z_min):
        m &= pd.to_numeric(df["novelty_30d_z"], errors="coerce").fillna(-np.inf) >= float(novelty_z_min)
    if "mention_posts" in df.columns:
        m &= pd.to_numeric(df["mention_posts"], errors="coerce").fillna(0).astype(int) >= int(min_posts)
    if "sentiment_mean" in df.columns and np.isfinite(sentiment_min):
        m &= pd.to_numeric(df["sentiment_mean"], errors="coerce").fillna(0.0) >= float(sentiment_min)
    return m


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a Reddit event study against forward returns.")
    ap.add_argument("--signals-parquet", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/reddit_event_study"))
    ap.add_argument("--benchmark", type=str, default="SPY", help="Optional benchmark ticker for context.")
    ap.add_argument("--novelty-z-min", type=float, default=2.0)
    ap.add_argument("--min-posts", type=int, default=2)
    ap.add_argument("--sentiment-min", type=float, default=-1e9)
    ap.add_argument("--horizons", nargs="+", type=int, default=[1, 5, 21])
    ap.add_argument("--topk-daily", type=int, default=5, help="Also simulate daily top-k by novelty_z (0=skip).")
    args = ap.parse_args()

    sig = pd.read_parquet(args.signals_parquet)
    if sig.empty:
        raise SystemExit("Signals parquet is empty.")
    sig["Date"] = pd.to_datetime(sig["Date"], errors="coerce")
    sig["Ticker"] = sig["Ticker"].astype(str).str.upper()
    sig = sig.dropna(subset=["Date", "Ticker"]).copy()

    px = _load_prices(args.panel)
    # Align to available prices.
    sig = sig[sig["Ticker"].isin(px.columns)].copy()
    sig = sig[sig["Date"].isin(px.index)].copy()
    if sig.empty:
        raise SystemExit("No overlap between signals and price panel dates/tickers.")

    m = _event_mask(sig, novelty_z_min=float(args.novelty_z_min), min_posts=int(args.min_posts), sentiment_min=float(args.sentiment_min))
    events = sig.loc[m].copy()

    # Compute forward returns for each horizon.
    horizons = [int(h) for h in args.horizons]
    for h in horizons:
        events[f"fwd_{h}d"] = [
            _forward_return(px[t], dt, h) for dt, t in zip(events["Date"].to_list(), events["Ticker"].to_list())
        ]

    stats: List[HorizonStats] = []
    for h in horizons:
        r = pd.to_numeric(events[f"fwd_{h}d"], errors="coerce").to_numpy(dtype=float)
        r = r[np.isfinite(r)]
        if len(r) == 0:
            stats.append(HorizonStats(horizon=h, n_events=0, mean_return=0.0, median_return=0.0, win_rate=0.0, t_stat=0.0))
            continue
        stats.append(
            HorizonStats(
                horizon=h,
                n_events=int(len(r)),
                mean_return=float(np.mean(r)),
                median_return=float(np.median(r)),
                win_rate=float(np.mean(r > 0)),
                t_stat=float(_t_stat(r)),
            )
        )

    # Optional: daily top-k portfolio based on novelty_30d_z (no lookahead in signal construction).
    port = None
    if int(args.topk_daily) > 0 and "novelty_30d_z" in sig.columns:
        topk = int(args.topk_daily)
        sig2 = sig.copy()
        sig2["novelty_30d_z"] = pd.to_numeric(sig2["novelty_30d_z"], errors="coerce")
        sig2 = sig2.dropna(subset=["novelty_30d_z"])
        rows = []
        for dt, day_df in sig2.groupby("Date"):
            picks = day_df.sort_values("novelty_30d_z", ascending=False).head(topk)["Ticker"].tolist()
            if not picks:
                continue
            # 1-day forward return, equal weight.
            idx = px.index.get_indexer([dt])[0]
            if idx < 0 or idx + 1 >= len(px.index):
                continue
            r_next = (px[picks].pct_change(fill_method=None).shift(-1).iloc[idx]).fillna(0.0)
            rows.append((px.index[idx + 1], float(r_next.mean())))
        if rows:
            port = pd.Series([r for _, r in rows], index=[d for d, _ in rows], name="topk_novelty_ret").sort_index()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    events_out = args.out_dir / "event_study_events.csv"
    events.sort_values(["Date", "Ticker"]).to_csv(events_out, index=False)

    out = {
        "signals_parquet": str(args.signals_parquet),
        "panel": str(args.panel),
        "filters": {"novelty_z_min": float(args.novelty_z_min), "min_posts": int(args.min_posts), "sentiment_min": float(args.sentiment_min)},
        "n_events": int(len(events)),
        "horizons": [asdict(s) for s in stats],
        "topk_daily": int(args.topk_daily),
        "topk_portfolio": None,
    }
    if port is not None and not port.empty:
        perf = {
            "n": int(len(port)),
            "total_return": float((1.0 + port).prod() - 1.0),
            "sharpe": float((port.mean() * 252.0) / (port.std(ddof=0) * np.sqrt(252.0))) if port.std(ddof=0) > 0 else 0.0,
            "mdd": float(((1.0 + port).cumprod() / (1.0 + port).cumprod().cummax() - 1.0).min()),
        }
        out["topk_portfolio"] = perf
        pd.DataFrame({"Date": port.index, "ret": port.values}).to_csv(args.out_dir / "topk_portfolio.csv", index=False)

    (args.out_dir / "event_study_summary.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

