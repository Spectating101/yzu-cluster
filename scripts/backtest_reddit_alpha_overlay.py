#!/usr/bin/env python3
"""
Backtest a Reddit-driven alpha sleeve applied on top of an existing run's weights.

Inputs:
  - --run-dir: directory with `weights.csv` and `regime_log.csv`
  - --panel: tidy panel CSV (Instrument,Date,Price_Close) containing base tickers and (optionally) any Reddit picks
  - --reddit-signals: `reddit_daily_signals.parquet` (Date,Ticker,novelty_30d_z,mention_posts,...)

Method (per decision date t):
  - Base weights come from weights.csv at Date=t (assumed long-only).
  - Reddit sleeve selects candidates from the Reddit panel at Date=t using gating thresholds.
  - Optional momentum confirmation using the price panel as-of t.
  - Final weights:
      w_final = normalize((1-sleeve)*w_base + sleeve*w_sleeve)
  - Realized return is close-to-close from t -> t+1 (aligned to regime_log EndDate when present).

This is research tooling (no promises); it is deterministic and does not call any APIs.
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
    final_equity: float


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
        n=int(n),
        total_return=float(total_return),
        cagr=float(cagr),
        sharpe=float(sharpe),
        mdd=float(mdd),
        final_equity=float(eq.iloc[-1]) if not eq.empty else 1.0,
    )


def _load_panel_prices(panel: Path) -> pd.DataFrame:
    df = pd.read_csv(panel)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise SystemExit("Panel must have columns: Instrument, Date, Price_Close")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Date", "Price_Close", "Instrument"])
    px = df.pivot(index="Date", columns="Instrument", values="Price_Close").sort_index()
    return px.ffill()


def _momentum_score(px: pd.DataFrame, t: str, dt: pd.Timestamp, mom_short: int, mom_long: int) -> float:
    if t not in px.columns or dt not in px.index:
        return float("-inf")
    s = px[t]
    cur = float(s.loc[dt])
    prev_s = s.shift(mom_short).loc[dt] if mom_short > 0 else np.nan
    prev_l = s.shift(mom_long).loc[dt] if mom_long > 0 else np.nan
    r_s = float(cur / prev_s - 1.0) if np.isfinite(prev_s) and prev_s != 0 else float("nan")
    r_l = float(cur / prev_l - 1.0) if np.isfinite(prev_l) and prev_l != 0 else float("nan")
    if not np.isfinite(r_s) and not np.isfinite(r_l):
        return float("-inf")
    if not np.isfinite(r_s):
        return float(r_l)
    if not np.isfinite(r_l):
        return float(r_s)
    return float(0.5 * r_s + 0.5 * r_l)


def _normalize(w: pd.Series) -> pd.Series:
    w = w.fillna(0.0).astype(float)
    w = w.clip(lower=0.0)
    s = float(w.sum())
    if s <= 0:
        return w * 0.0
    return w / s


def main() -> int:
    ap = argparse.ArgumentParser(description="Backtest Reddit alpha sleeve overlay on top of an existing run.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--reddit-signals", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--start-date", type=str, default="", help="Optional decision date filter YYYY-MM-DD (inclusive).")
    ap.add_argument("--end-date", type=str, default="", help="Optional decision date filter YYYY-MM-DD (inclusive).")

    ap.add_argument("--sleeve", type=float, default=0.15)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument(
        "--pick-mode",
        choices=["novelty_z", "upvote_weight", "upvote_weight_x_sent", "novelty_z_x_sent", "novelty_z_x_weight_x_sent"],
        default="novelty_z",
    )
    ap.add_argument("--min-posts", type=int, default=2)
    ap.add_argument("--min-authors", type=int, default=1)
    ap.add_argument("--sentiment-min", type=float, default=-1e9)
    ap.add_argument("--novelty-z-min", type=float, default=2.0)
    ap.add_argument("--min-upvote-weight", type=float, default=0.0)
    ap.add_argument("--allow-missing-novelty", action="store_true", help="If novelty is NaN, allow candidate (otherwise filtered out).")

    ap.add_argument("--mom-short", type=int, default=0, help="If >0, require momentum score >= --min-mom-score.")
    ap.add_argument("--mom-long", type=int, default=0)
    ap.add_argument("--min-mom-score", type=float, default=0.0)

    ap.add_argument("--cost-bps", type=float, default=0.0, help="Turnover cost in bps applied to overlay strategy only.")
    ap.add_argument("--out-dir", type=Path, default=None)
    args = ap.parse_args()

    run_dir = args.run_dir
    weights = pd.read_csv(run_dir / "weights.csv", index_col=0)
    weights.index = pd.to_datetime(weights.index)
    weights = weights.astype(float).fillna(0.0)

    reg = pd.read_csv(run_dir / "regime_log.csv")
    reg["Date"] = pd.to_datetime(reg["Date"])
    reg["EndDate"] = pd.to_datetime(reg["EndDate"]) if "EndDate" in reg.columns else pd.to_datetime(reg["Date"])
    if len(reg) != len(weights):
        raise SystemExit("Mismatch: regime_log.csv rows != weights.csv rows")

    px = _load_panel_prices(args.panel)
    required_cols = sorted(set(weights.columns.tolist() + [str(args.benchmark)]))
    missing_cols = [c for c in required_cols if c not in px.columns]
    if missing_cols:
        raise SystemExit(f"Price panel missing required tickers: {missing_cols[:10]}")

    rs = pd.read_parquet(args.reddit_signals) if args.reddit_signals.suffix.lower() in {".parquet", ".pq"} else pd.read_csv(args.reddit_signals)
    rs["Date"] = pd.to_datetime(rs["Date"], errors="coerce")
    rs["Ticker"] = rs["Ticker"].astype(str).str.upper()
    for col in ["mention_posts", "unique_authors", "upvote_weighted_mentions", "sentiment_mean", "novelty_30d_z"]:
        if col in rs.columns:
            rs[col] = pd.to_numeric(rs[col], errors="coerce")

    # Align to decision dates present in both weights and price panel.
    # Ensure px is indexed by normalized dates (it already is daily), then compute next-day returns.
    px = px.sort_index()
    rets_next = px.pct_change(fill_method=None).shift(-1).replace([np.inf, -np.inf], np.nan)
    # Only evaluate on days where all base tickers + benchmark have valid t->t+1 returns.
    valid = rets_next[required_cols].notna().all(axis=1)
    valid_dates = set(rets_next.index[valid].to_list())
    if not valid_dates:
        raise SystemExit("No valid dates with complete base+benchmark returns in the price panel.")
    rets_next = rets_next.fillna(0.0)

    sleeve = float(np.clip(float(args.sleeve), 0.0, 1.0))
    top_k = int(max(0, int(args.top_k)))
    cost = float(args.cost_bps) / 10000.0

    base_r: List[float] = []
    over_r: List[float] = []
    end_idx: List[pd.Timestamp] = []
    picks_hist: List[Dict[str, object]] = []

    w_prev = pd.Series(0.0, index=px.columns, dtype=float)

    start_dt = pd.to_datetime(args.start_date).normalize() if str(args.start_date).strip() else None
    end_dt = pd.to_datetime(args.end_date).normalize() if str(args.end_date).strip() else None

    for i, dt_raw in enumerate(reg["Date"]):
        dt = pd.Timestamp(dt_raw).normalize()
        if start_dt is not None and dt < start_dt:
            continue
        if end_dt is not None and dt > end_dt:
            continue
        if dt not in px.index or dt not in weights.index or dt not in valid_dates:
            continue
        end_dt = pd.Timestamp(reg.loc[i, "EndDate"]).normalize()
        if end_dt not in px.index:
            continue

        w_base = _normalize(weights.loc[dt].reindex(px.columns).fillna(0.0))
        r_next = rets_next.loc[dt].reindex(px.columns).fillna(0.0)
        base_ret = float((w_base * r_next).sum())

        picks: List[str] = []
        sleeve_w = pd.Series(0.0, index=px.columns, dtype=float)
        if sleeve > 0 and top_k > 0:
            day = rs[rs["Date"] == dt].copy()
            if not day.empty:
                day = day.set_index("Ticker")
                cands = day.copy()
                if "mention_posts" in cands.columns:
                    cands = cands[cands["mention_posts"] >= float(args.min_posts)]
                if "unique_authors" in cands.columns:
                    cands = cands[cands["unique_authors"] >= float(args.min_authors)]
                if "upvote_weighted_mentions" in cands.columns:
                    cands = cands[cands["upvote_weighted_mentions"] >= float(args.min_upvote_weight)]
                if "sentiment_mean" in cands.columns:
                    cands = cands[cands["sentiment_mean"] >= float(args.sentiment_min)]
                if "novelty_30d_z" in cands.columns and not args.allow_missing_novelty:
                    cands = cands[pd.to_numeric(cands["novelty_30d_z"], errors="coerce") >= float(args.novelty_z_min)]
                elif "novelty_30d_z" in cands.columns and args.allow_missing_novelty:
                    z = pd.to_numeric(cands["novelty_30d_z"], errors="coerce")
                    cands = cands[(z.isna()) | (z >= float(args.novelty_z_min))]

                # Drop tickers not present in price panel.
                cands = cands[cands.index.isin(px.columns)]

                if not cands.empty:
                    if args.pick_mode == "upvote_weight":
                        s = pd.to_numeric(cands.get("upvote_weighted_mentions"), errors="coerce").fillna(0.0)
                    elif args.pick_mode == "upvote_weight_x_sent":
                        w = pd.to_numeric(cands.get("upvote_weighted_mentions"), errors="coerce").fillna(0.0)
                        sent = pd.to_numeric(cands.get("sentiment_mean"), errors="coerce").fillna(0.0)
                        s = np.log1p(np.maximum(0.0, w)) * sent
                    elif args.pick_mode == "novelty_z_x_sent":
                        z = pd.to_numeric(cands.get("novelty_30d_z"), errors="coerce").fillna(0.0)
                        sent = pd.to_numeric(cands.get("sentiment_mean"), errors="coerce").fillna(0.0)
                        s = z.clip(lower=0.0, upper=10.0) * sent
                    elif args.pick_mode == "novelty_z_x_weight_x_sent":
                        z = pd.to_numeric(cands.get("novelty_30d_z"), errors="coerce").fillna(0.0).clip(lower=0.0, upper=10.0)
                        w = pd.to_numeric(cands.get("upvote_weighted_mentions"), errors="coerce").fillna(0.0)
                        sent = pd.to_numeric(cands.get("sentiment_mean"), errors="coerce").fillna(0.0)
                        s = z * np.log1p(np.maximum(0.0, w)) * sent
                    else:
                        s = pd.to_numeric(cands.get("novelty_30d_z"), errors="coerce").fillna(-np.inf)

                    scored = s.sort_values(ascending=False)
                    picks = [str(t) for t in scored.head(top_k).index.tolist()]

        if picks and int(args.mom_short) > 0:
            filtered: List[str] = []
            for t in picks:
                m = _momentum_score(px, t, dt, int(args.mom_short), int(args.mom_long))
                if np.isfinite(m) and float(m) >= float(args.min_mom_score):
                    filtered.append(t)
            picks = filtered

        if picks:
            sleeve_w.loc[picks] = float(1.0 / len(picks))
            sleeve_w = _normalize(sleeve_w)

        w_final = _normalize((1.0 - sleeve) * w_base + sleeve * sleeve_w)
        overlay_ret = float((w_final * r_next).sum())

        # Optional overlay-specific transaction cost.
        tc = cost * float((w_final - w_prev).abs().sum()) if cost > 0 else 0.0
        overlay_ret = float(overlay_ret - tc)
        w_prev = w_final

        base_r.append(base_ret)
        over_r.append(overlay_ret)
        end_idx.append(end_dt)
        picks_hist.append({"Date": str(dt.date()), "EndDate": str(end_dt.date()), "picks": picks})

    base_s = pd.Series(base_r, index=pd.to_datetime(end_idx), name="base_ret")
    over_s = pd.Series(over_r, index=pd.to_datetime(end_idx), name="overlay_ret")

    if base_s.empty or over_s.empty:
        raise SystemExit("No returns computed. Check date alignment and panel coverage.")

    out_dir = args.out_dir or (run_dir / "reddit_alpha_overlay")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_perf = _perf(base_s)
    over_perf = _perf(over_s)
    bench_ret = rets_next[args.benchmark].reindex(pd.to_datetime(reg["Date"]).dt.normalize()).dropna()
    bench_ret = bench_ret.loc[bench_ret.index.isin(pd.to_datetime(end_idx))].fillna(0.0)
    bench_perf = _perf(bench_ret) if not bench_ret.empty else _perf(pd.Series([], dtype=float))

    summary = {
        "run_dir": str(run_dir),
        "panel": str(args.panel),
        "reddit_signals": str(args.reddit_signals),
        "settings": {
            "sleeve": float(sleeve),
            "top_k": int(top_k),
            "pick_mode": str(args.pick_mode),
            "min_posts": int(args.min_posts),
            "min_authors": int(args.min_authors),
            "sentiment_min": float(args.sentiment_min),
            "novelty_z_min": float(args.novelty_z_min),
            "min_upvote_weight": float(args.min_upvote_weight),
            "allow_missing_novelty": bool(args.allow_missing_novelty),
            "mom_short": int(args.mom_short),
            "mom_long": int(args.mom_long),
            "min_mom_score": float(args.min_mom_score),
            "cost_bps": float(args.cost_bps),
        },
        "base": asdict(base_perf),
        "overlay": asdict(over_perf),
        "benchmark": asdict(bench_perf),
        "delta_total_return": float(over_perf.total_return - base_perf.total_return),
        "delta_sharpe": float(over_perf.sharpe - base_perf.sharpe),
        "delta_mdd": float(over_perf.mdd - base_perf.mdd),
    }

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    pd.DataFrame({"base_ret": base_s, "overlay_ret": over_s}).to_csv(out_dir / "returns.csv")
    pd.DataFrame(picks_hist).to_csv(out_dir / "picks.csv", index=False)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
