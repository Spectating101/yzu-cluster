#!/usr/bin/env python3
"""
Backtest an Oracle alpha sleeve applied on top of an existing dynamic-regime run.

Inputs:
  - --run-dir: directory with `weights.csv` and `regime_log.csv` (from spy_beater_dynamic_regime_runner.py)
  - --panel: tidy panel CSV (Instrument,Date,Price_Close) containing the same tickers as weights.csv
  - --oracle-tickers: list of tickers eligible for the alpha sleeve (e.g. ARKK BTC-USD)

Method:
  - Base weights come from weights.csv at Date=t (decision date).
  - Alpha sleeve picks top-k oracle tickers by momentum as-of Date=t, then blends:
      w_final = normalize((1-sleeve)*w_base + sleeve*w_sleeve)
  - Portfolio return is realized on EndDate=t+1 using panel returns.

This is a deterministic research harness; it does not call any APIs.
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
    r = returns.fillna(0.0)
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
    ap = argparse.ArgumentParser(description="Backtest oracle alpha sleeve on top of an existing run.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--oracle-tickers", nargs="+", required=True)
    ap.add_argument("--sleeve", type=float, default=0.2)
    ap.add_argument("--top-k", type=int, default=2)
    ap.add_argument("--mom-short", type=int, default=21)
    ap.add_argument("--mom-long", type=int, default=63)
    ap.add_argument("--min-score", type=float, default=0.0)
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
    # Align to decision dates.
    dates = reg["Date"]
    px = px.loc[px.index.intersection(dates)].ffill()

    # Compute next-day returns by decision date.
    rets_next = px.pct_change(fill_method=None).shift(-1).fillna(0.0)

    oracle = [t.strip().upper().lstrip("$") for t in args.oracle_tickers if t.strip()]
    oracle = [t for t in oracle if t in weights.columns and t in rets_next.columns]

    sleeve = float(np.clip(float(args.sleeve), 0.0, 1.0))
    top_k = int(max(0, int(args.top_k)))

    base_r = []
    alpha_r = []
    end_idx = []
    picks_hist: List[Dict[str, object]] = []

    for i, dt in enumerate(dates):
        if dt not in weights.index or dt not in rets_next.index:
            continue
        w_base = _normalize(weights.loc[dt].reindex(weights.columns).fillna(0.0))
        r_next = rets_next.loc[dt].reindex(weights.columns).fillna(0.0)
        base_ret = float((w_base * r_next).sum())

        # Alpha sleeve weights (equal weight among top-k momentum picks).
        picks: List[str] = []
        sleeve_w = pd.Series(0.0, index=weights.columns, dtype=float)
        if sleeve > 0 and top_k > 0 and oracle:
            scored: List[Tuple[str, float]] = []
            for t in oracle:
                s = _momentum_score(px, t, dt, int(args.mom_short), int(args.mom_long))
                if np.isfinite(s) and s >= float(args.min_score):
                    scored.append((t, float(s)))
            scored.sort(key=lambda kv: kv[1], reverse=True)
            picks = [t for t, _ in scored[:top_k]]
            if picks:
                sleeve_w.loc[picks] = float(1.0 / len(picks))
                sleeve_w = _normalize(sleeve_w)

        w_final = _normalize((1.0 - sleeve) * w_base + sleeve * sleeve_w)
        alpha_ret = float((w_final * r_next).sum())

        base_r.append(base_ret)
        alpha_r.append(alpha_ret)
        end_idx.append(reg.loc[i, "EndDate"])
        picks_hist.append({"Date": str(dt.date()), "EndDate": str(reg.loc[i, 'EndDate'].date()), "picks": picks})

    base_s = pd.Series(base_r, index=pd.to_datetime(end_idx), name="base_ret")
    alpha_s = pd.Series(alpha_r, index=pd.to_datetime(end_idx), name="alpha_ret")

    out_dir = args.out_dir or (run_dir / "oracle_alpha_overlay")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_perf = _perf(base_s)
    alpha_perf = _perf(alpha_s)

    summary = {
        "run_dir": str(run_dir),
        "panel": str(args.panel),
        "oracle_tickers": oracle,
        "settings": {
            "sleeve": sleeve,
            "top_k": top_k,
            "mom_short": int(args.mom_short),
            "mom_long": int(args.mom_long),
            "min_score": float(args.min_score),
        },
        "base": asdict(base_perf),
        "alpha_overlay": asdict(alpha_perf),
        "delta_total_return": float(alpha_perf.total_return - base_perf.total_return),
        "delta_sharpe": float(alpha_perf.sharpe - base_perf.sharpe),
        "delta_mdd": float(alpha_perf.mdd - base_perf.mdd),
    }

    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    pd.DataFrame({"base_ret": base_s, "alpha_ret": alpha_s}).to_csv(out_dir / "returns.csv")
    pd.DataFrame(picks_hist).to_csv(out_dir / "picks.csv", index=False)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

