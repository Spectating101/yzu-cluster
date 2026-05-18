#!/usr/bin/env python3
"""
Reddit-driven alpha backtest (short-horizon, daily bars).

Inputs:
  - Price panel (tidy): Instrument, Date, Price_Close, Volume (optional)
  - Sentiment panel (daily): Date, Ticker, Mentions, Weight, Sentiment

Strategy (baseline):
  - Each day t, compute a score from sentiment panel at t
  - Trade next day t+1 (avoids lookahead), hold for `--hold-days`
  - Long top-N tickers by score, optionally short bottom-N

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd


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


def load_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Need columns {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    return px


def main() -> int:
    ap = argparse.ArgumentParser(description="Reddit alpha backtest vs SPY.")
    ap.add_argument("--prices", type=Path, required=True)
    ap.add_argument("--sentiment", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/reddit_alpha/run1"))
    ap.add_argument("--benchmark", type=str, default="SPY")

    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--bottom-n", type=int, default=0)
    ap.add_argument("--hold-days", type=int, default=5)
    ap.add_argument("--gross", type=float, default=1.0)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--score-mode", choices=["weight", "weight_x_sent"], default="weight_x_sent")
    ap.add_argument("--min-mentions", type=int, default=1)
    ap.add_argument("--min-weight", type=float, default=0.0)
    ap.add_argument("--eval-last-days", type=int, default=0)
    args = ap.parse_args()

    px = load_prices(args.prices)
    if args.benchmark not in px.columns:
        print(f"Benchmark {args.benchmark} missing from price panel")
        return 2

    if args.sentiment.suffix.lower() in {".parquet", ".pq"}:
        s = pd.read_parquet(args.sentiment)
        if "Date" in s.columns:
            s["Date"] = pd.to_datetime(s["Date"], errors="coerce")
    else:
        s = pd.read_csv(args.sentiment, parse_dates=["Date"])
    # Support both legacy panel schema and the newer daily signals schema.
    legacy_need = {"Date", "Ticker", "Mentions", "Weight", "Sentiment"}
    new_need = {"Date", "Ticker", "mention_posts", "upvote_weighted_mentions", "sentiment_mean"}
    if legacy_need.issubset(s.columns):
        s = s.rename(columns={"Mentions": "Mentions", "Weight": "Weight", "Sentiment": "Sentiment"}).copy()
    elif new_need.issubset(s.columns):
        s = s.rename(
            columns={
                "mention_posts": "Mentions",
                "upvote_weighted_mentions": "Weight",
                "sentiment_mean": "Sentiment",
            }
        ).copy()
    else:
        raise ValueError(f"Sentiment needs either columns {sorted(legacy_need)} or {sorted(new_need)}")
    s["Ticker"] = s["Ticker"].astype(str)
    s["Mentions"] = pd.to_numeric(s["Mentions"], errors="coerce").fillna(0.0)
    s["Weight"] = pd.to_numeric(s["Weight"], errors="coerce").fillna(0.0)
    s["Sentiment"] = pd.to_numeric(s["Sentiment"], errors="coerce").fillna(0.0)
    s = s[(s["Mentions"] >= int(args.min_mentions)) & (s["Weight"] >= float(args.min_weight))].copy()

    # Compute daily score per ticker.
    if args.score_mode == "weight":
        s["Score"] = s["Weight"]
    else:
        s["Score"] = s["Weight"] * s["Sentiment"]
    score = s.pivot_table(index="Date", columns="Ticker", values="Score", aggfunc="sum").sort_index()

    # Align dates.
    idx = px.index.intersection(score.index).sort_values()
    if int(args.eval_last_days) > 0 and len(idx) > int(args.eval_last_days) + 30:
        idx = idx[-int(args.eval_last_days) :]
    px = px.reindex(idx).ffill()
    score = score.reindex(idx).fillna(0.0)

    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    bench = rets[args.benchmark].shift(-1)  # benchmark next-day like strategy
    hold = int(max(1, args.hold_days))
    gross = float(max(0.0, args.gross))
    top_n = int(max(1, args.top_n))
    bot_n = int(max(0, args.bottom_n))
    cost = float(args.cost_bps) / 10000.0

    # Overlapping holds: maintain a queue of active weights for the next `hold` days.
    active = [pd.Series(0.0, index=px.columns, dtype=float) for _ in range(hold)]
    pnl = []
    dates = []
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)

    for dt in idx[:-1]:
        # Form new position to be held over next `hold` days.
        sc = score.loc[dt]
        sc = sc.reindex(px.columns).fillna(0.0)
        # Avoid trading benchmark itself unless it appears in sentiment.
        sc = sc.replace([np.inf, -np.inf], 0.0)
        if sc.abs().sum() > 0:
            longs = sc.sort_values(ascending=False).head(top_n).index.tolist()
            shorts = sc.sort_values(ascending=True).head(bot_n).index.tolist() if bot_n > 0 else []
        else:
            longs, shorts = [], []

        w_new = pd.Series(0.0, index=px.columns, dtype=float)
        if longs:
            w_new.loc[longs] = 1.0 / len(longs)
        if shorts:
            w_new.loc[shorts] = -1.0 / len(shorts)
        if w_new.abs().sum() > 0:
            w_new = w_new * (gross / float(w_new.abs().sum()))

        # Update queue.
        active.pop(0)
        active.append(w_new)
        w = sum(active) / float(hold)  # average exposure across overlap

        turn = float((w - w_prev).abs().sum())
        tc = cost * turn
        r_next = rets.shift(-1).loc[dt]
        r = float((w * r_next).sum()) - float(tc)

        pnl.append(r)
        dates.append(dt)
        w_prev = w

    strat = pd.Series(pnl, index=pd.DatetimeIndex(dates), name="pnl").fillna(0.0)
    bench = bench.reindex(strat.index).fillna(0.0)
    eq = (1.0 + strat).cumprod()
    beq = (1.0 + bench).cumprod()
    excess_final = float(eq.iloc[-1] / beq.iloc[-1] - 1.0) if len(eq) else 0.0

    out = {
        "strategy": asdict(_perf(strat)),
        "benchmark": asdict(_perf(bench)),
        "active": {"excess_final": excess_final, "active_sharpe": asdict(_perf(strat - bench))["sharpe"]},
        "params": {
            "top_n": args.top_n,
            "bottom_n": args.bottom_n,
            "hold_days": args.hold_days,
            "gross": args.gross,
            "cost_bps": args.cost_bps,
            "score_mode": args.score_mode,
            "min_mentions": args.min_mentions,
            "min_weight": args.min_weight,
            "eval_last_days": args.eval_last_days,
        },
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(out, indent=2) + "\n")
    (args.out_dir / "equity.csv").write_text(eq.to_csv())
    (args.out_dir / "benchmark_equity.csv").write_text(beq.to_csv())
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
