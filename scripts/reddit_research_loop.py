#!/usr/bin/env python3
"""
Reddit signals research loop: randomized window evaluation + small parameter sweep.

Purpose:
  - Turn the daily Reddit signals panel into a lagged, cost-aware trading simulation.
  - Sample many random contiguous windows to estimate robustness vs a benchmark (default SPY).

Inputs:
  - Prices (tidy CSV): Instrument, Date, Price_Close
  - Signals (Parquet/CSV): output of scripts/reddit_daily_signals.py

Key design choices:
  - No lookahead: signal at Date=t trades on next close (t+1 return).
  - Overlapping holds via an exposure queue (same as reddit_alpha_backtest.py).
  - Transaction cost modeled as bps * turnover.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

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


def _load_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Need columns {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    return px


def _load_signals(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in {".parquet", ".pq"}:
        s = pd.read_parquet(path)
        if "Date" in s.columns:
            s["Date"] = pd.to_datetime(s["Date"], errors="coerce")
        return s
    return pd.read_csv(path, parse_dates=["Date"])


def _compute_scores(
    signals: pd.DataFrame,
    *,
    score_mode: str,
    min_posts: int,
    min_authors: int,
    min_upvote_weight: float,
    sentiment_min: float,
    novelty_z_min: float,
    use_novelty_multiplier: bool,
) -> pd.DataFrame:
    s = signals.copy()
    need = {"Date", "Ticker", "mention_posts", "unique_authors", "upvote_weighted_mentions", "sentiment_mean"}
    if not need.issubset(s.columns):
        raise ValueError(f"Signals panel missing required columns: {sorted(need)}")
    s["Date"] = pd.to_datetime(s["Date"], errors="coerce")
    s["Ticker"] = s["Ticker"].astype(str)
    s["mention_posts"] = pd.to_numeric(s["mention_posts"], errors="coerce").fillna(0.0)
    s["unique_authors"] = pd.to_numeric(s["unique_authors"], errors="coerce").fillna(0.0)
    s["upvote_weighted_mentions"] = pd.to_numeric(s["upvote_weighted_mentions"], errors="coerce").fillna(0.0)
    s["sentiment_mean"] = pd.to_numeric(s["sentiment_mean"], errors="coerce").fillna(0.0)
    if "novelty_30d_z" in s.columns:
        s["novelty_30d_z"] = pd.to_numeric(s["novelty_30d_z"], errors="coerce")
    else:
        s["novelty_30d_z"] = np.nan

    s = s[
        (s["mention_posts"] >= float(min_posts))
        & (s["unique_authors"] >= float(min_authors))
        & (s["upvote_weighted_mentions"] >= float(min_upvote_weight))
        & (s["sentiment_mean"] >= float(sentiment_min))
    ].copy()

    if novelty_z_min is not None and not math.isnan(float(novelty_z_min)):
        s = s[pd.to_numeric(s["novelty_30d_z"], errors="coerce") >= float(novelty_z_min)].copy()

    # Core score definitions.
    w = s["upvote_weighted_mentions"].astype(float)
    # Stabilize heavy tails.
    w = np.log1p(np.maximum(0.0, w))
    sent = s["sentiment_mean"].astype(float)

    if score_mode == "weight":
        base = w
    elif score_mode == "sentiment":
        base = sent
    else:
        base = w * sent

    if use_novelty_multiplier:
        z = pd.to_numeric(s["novelty_30d_z"], errors="coerce")
        # Map z into [0, 2] multiplier; missing -> 1.
        mult = (z.clip(lower=0.0, upper=4.0) / 2.0).fillna(1.0)
        base = base * mult

    s["Score"] = pd.to_numeric(base, errors="coerce").fillna(0.0)
    score = s.pivot_table(index="Date", columns="Ticker", values="Score", aggfunc="sum").sort_index()
    return score


def _simulate(
    px: pd.DataFrame,
    score: pd.DataFrame,
    *,
    benchmark: str,
    top_n: int,
    hold_days: int,
    gross: float,
    cost_bps: float,
    momentum_days: int,
    momentum_min: float,
) -> Tuple[pd.Series, pd.Series]:
    if benchmark not in px.columns:
        raise ValueError(f"Benchmark {benchmark} missing from price panel.")
    idx = px.index.intersection(score.index).sort_values()
    px = px.reindex(idx).ffill()
    score = score.reindex(idx).fillna(0.0)

    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    bench = rets[benchmark].shift(-1)  # next-day like strategy

    hold = int(max(1, hold_days))
    gross = float(max(0.0, gross))
    top_n = int(max(1, top_n))
    cost = float(cost_bps) / 10000.0

    mom_days = int(max(0, momentum_days))
    mom_min = float(momentum_min)
    if mom_days > 0:
        mom = px.pct_change(periods=mom_days, fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    else:
        mom = None

    active = [pd.Series(0.0, index=px.columns, dtype=float) for _ in range(hold)]
    pnl: List[float] = []
    dates: List[pd.Timestamp] = []
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)

    for dt in idx[:-1]:
        sc = score.loc[dt].reindex(px.columns).fillna(0.0).replace([np.inf, -np.inf], 0.0)
        if mom is not None:
            ok = (mom.loc[dt] >= mom_min).reindex(px.columns).fillna(False)
            sc = sc.where(ok, 0.0)
        if sc.abs().sum() > 0:
            longs = sc.sort_values(ascending=False).head(top_n).index.tolist()
        else:
            longs = []

        w_new = pd.Series(0.0, index=px.columns, dtype=float)
        if longs:
            w_new.loc[longs] = 1.0 / len(longs)
        if w_new.abs().sum() > 0:
            w_new = w_new * (gross / float(w_new.abs().sum()))

        active.pop(0)
        active.append(w_new)
        w = sum(active) / float(hold)

        turn = float((w - w_prev).abs().sum())
        tc = cost * turn
        r_next = rets.shift(-1).loc[dt]
        r = float((w * r_next).sum()) - float(tc)
        pnl.append(r)
        dates.append(dt)
        w_prev = w

    strat = pd.Series(pnl, index=pd.DatetimeIndex(dates), name="strategy_ret").fillna(0.0)
    bench = bench.reindex(strat.index).fillna(0.0)
    return strat, bench


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


def _evaluate_windows(
    strat: pd.Series,
    bench: pd.Series,
    *,
    n_samples: int,
    min_days: int,
    max_days: int,
    seed: int,
) -> pd.DataFrame:
    df = pd.DataFrame({"strategy_ret": strat, "benchmark_ret": bench}).dropna()
    if df.empty:
        return pd.DataFrame()
    rng = np.random.default_rng(int(seed))
    windows = _pick_windows(len(df), n_samples=int(n_samples), min_len=int(min_days), max_len=int(max_days), rng=rng)
    rows: List[Dict[str, Any]] = []
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
    return pd.DataFrame(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a Reddit signals research loop with random-window evaluation.")
    ap.add_argument("--prices", type=Path, required=True)
    ap.add_argument("--signals", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/reddit_research_loop/run1"))

    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--hold-days", type=int, default=3)
    ap.add_argument("--gross", type=float, default=1.0)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--score-mode", choices=["weight_x_sent", "weight", "sentiment"], default="weight_x_sent")

    ap.add_argument("--min-posts", type=int, default=1)
    ap.add_argument("--min-authors", type=int, default=1)
    ap.add_argument("--min-upvote-weight", type=float, default=0.0)
    ap.add_argument("--sentiment-min", type=float, default=-1e9)
    ap.add_argument("--novelty-z-min", type=float, default=float("nan"))
    ap.add_argument("--use-novelty-multiplier", action="store_true")

    ap.add_argument("--momentum-days", type=int, default=0, help="If >0, require trailing return over this many days >= --momentum-min.")
    ap.add_argument("--momentum-min", type=float, default=0.0, help="Trailing return threshold for momentum filter.")

    ap.add_argument("--n-samples", type=int, default=400)
    ap.add_argument("--min-days", type=int, default=10)
    ap.add_argument("--max-days", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    px = _load_prices(args.prices)
    sig = _load_signals(args.signals)
    score = _compute_scores(
        sig,
        score_mode=str(args.score_mode),
        min_posts=int(args.min_posts),
        min_authors=int(args.min_authors),
        min_upvote_weight=float(args.min_upvote_weight),
        sentiment_min=float(args.sentiment_min),
        novelty_z_min=float(args.novelty_z_min),
        use_novelty_multiplier=bool(args.use_novelty_multiplier),
    )

    strat, bench = _simulate(
        px,
        score,
        benchmark=str(args.benchmark),
        top_n=int(args.top_n),
        hold_days=int(args.hold_days),
        gross=float(args.gross),
        cost_bps=float(args.cost_bps),
        momentum_days=int(args.momentum_days),
        momentum_min=float(args.momentum_min),
    )

    win = _evaluate_windows(
        strat,
        bench,
        n_samples=int(args.n_samples),
        min_days=int(args.min_days),
        max_days=int(args.max_days),
        seed=int(args.seed),
    )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "params.json").write_text(json.dumps(vars(args), indent=2, default=str) + "\n")
    eq = (1.0 + strat).cumprod()
    beq = (1.0 + bench).cumprod()
    eq.to_csv(out_dir / "equity.csv")
    beq.to_csv(out_dir / "benchmark_equity.csv")
    win.to_csv(out_dir / "windows.csv", index=False)

    full_summary = {
        "strategy_full": asdict(_perf(strat)),
        "benchmark_full": asdict(_perf(bench)),
        "active_full": {
            "excess_total_return": float(eq.iloc[-1] / max(1e-12, beq.iloc[-1]) - 1.0) if len(eq) else 0.0,
            "active_sharpe": float(_perf(strat - bench).sharpe),
        },
        "windows": {
            "n": int(len(win)),
            "beat_rate": float((win["active_excess_total_return"] > 0).mean()) if len(win) else 0.0,
            "p10_active_excess": float(win["active_excess_total_return"].quantile(0.10)) if len(win) else 0.0,
            "p50_active_excess": float(win["active_excess_total_return"].quantile(0.50)) if len(win) else 0.0,
            "p90_active_excess": float(win["active_excess_total_return"].quantile(0.90)) if len(win) else 0.0,
        },
        "meta": {"generated_utc": datetime.now(timezone.utc).isoformat()},
    }
    (out_dir / "summary.json").write_text(json.dumps(full_summary, indent=2) + "\n")
    print(json.dumps(full_summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
