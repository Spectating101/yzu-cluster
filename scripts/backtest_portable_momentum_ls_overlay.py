#!/usr/bin/env python3
"""
Portable (market-neutral) momentum sleeve overlay on top of an existing base strategy.

Why:
  - Long-only sleeves dilute a strong leveraged-ETF core and often reduce returns.
  - A small market-neutral sleeve can add alpha without reducing the core exposure.

This is RESEARCH ONLY:
  - Allows negative weights (shorts) in the sleeve.
  - Live executor in this repo is long-only; deployment would require a broker that supports shorts,
    or an approximation using inverse ETFs/options.

Method (per decision date t):
  - Base weights w_base come from weights.csv (sum to 1, long-only).
  - Compute cross-sectional momentum score over a universe (exclude base tickers).
  - Build a long/short sleeve w_ls with sum(w_ls)=0 and sum(|w_ls|)=1:
      longs: +1/long_k each
      shorts: -1/short_k each
  - Scale sleeve by sleeve_gross (e.g. 0.20 => 20% gross, 0 net).
  - Overlay weights:
      w_final = w_base + sleeve_gross * w_ls
    (net stays ~1.0, gross increases by sleeve_gross)
  - Realized return uses next-day close-to-close t->t+1.
  - Transaction costs are applied on sleeve turnover only.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

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


def _normalize_long_only(w: pd.Series) -> pd.Series:
    w = w.fillna(0.0).astype(float).clip(lower=0.0)
    s = float(w.sum())
    return (w / s) if s > 0 else (w * 0.0)


def _parse_universe(path: Path) -> Set[str]:
    tickers: Set[str] = set()
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.add(line.split()[0].strip().upper())
    return tickers


def _mom_score(px: pd.DataFrame, dt: pd.Timestamp, *, short: int, long: int) -> pd.Series:
    cur = px.loc[dt]
    s_ret = (cur / px.shift(short).loc[dt] - 1.0).replace([np.inf, -np.inf], np.nan)
    l_ret = (cur / px.shift(long).loc[dt] - 1.0).replace([np.inf, -np.inf], np.nan)
    score = 0.5 * s_ret.fillna(-np.inf) + 0.5 * l_ret.fillna(-np.inf)
    return score.astype(float)


def main() -> int:
    ap = argparse.ArgumentParser(description="Backtest portable long/short momentum sleeve overlay.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--universe", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--start-date", type=str, default="")
    ap.add_argument("--end-date", type=str, default="")

    ap.add_argument("--sleeve-gross", type=float, default=0.20, help="Gross exposure of the L/S sleeve (net is ~0).")
    ap.add_argument("--long-k", type=int, default=10)
    ap.add_argument("--short-k", type=int, default=10)
    ap.add_argument("--mom-short", type=int, default=21)
    ap.add_argument("--mom-long", type=int, default=126)
    ap.add_argument("--min-mom", type=float, default=-1e9)
    ap.add_argument("--max-mom", type=float, default=1e9)
    ap.add_argument("--only-when-regime", type=str, default="", help="If set, only apply sleeve when base regime == this.")
    ap.add_argument("--cost-bps", type=float, default=3.0, help="Turnover cost applied to sleeve weights only.")
    ap.add_argument("--out-dir", type=Path, default=None)
    args = ap.parse_args()

    weights = pd.read_csv(args.run_dir / "weights.csv", index_col=0)
    weights.index = pd.to_datetime(weights.index).normalize()
    weights = weights.astype(float).fillna(0.0)

    reg = pd.read_csv(args.run_dir / "regime_log.csv")
    reg["Date"] = pd.to_datetime(reg["Date"]).dt.normalize()
    reg["EndDate"] = pd.to_datetime(reg["EndDate"]).dt.normalize() if "EndDate" in reg.columns else reg["Date"]
    if len(reg) != len(weights):
        raise SystemExit("Mismatch: regime_log.csv rows != weights.csv rows")

    px = _load_panel_prices(args.panel)
    required_cols = sorted(set(weights.columns.tolist() + [str(args.benchmark)]))
    missing_cols = [c for c in required_cols if c not in px.columns]
    if missing_cols:
        raise SystemExit(f"Price panel missing required tickers: {missing_cols[:10]}")

    universe = _parse_universe(args.universe)
    base_cols = set(weights.columns)
    candidates = sorted([t for t in universe if t in px.columns and t not in base_cols])
    if not candidates:
        raise SystemExit("No universe tickers available in panel (and distinct from base tickers).")

    px = px.sort_index()
    rets_next = px.pct_change(fill_method=None).shift(-1).replace([np.inf, -np.inf], np.nan)
    valid = rets_next[required_cols].notna().all(axis=1)
    valid_dates = set(rets_next.index[valid].to_list())
    rets_next = rets_next.fillna(0.0)

    start_dt = pd.to_datetime(args.start_date).normalize() if str(args.start_date).strip() else None
    end_dt = pd.to_datetime(args.end_date).normalize() if str(args.end_date).strip() else None

    sleeve_gross = float(max(0.0, float(args.sleeve_gross)))
    long_k = int(max(0, int(args.long_k)))
    short_k = int(max(0, int(args.short_k)))
    cost = float(args.cost_bps) / 10000.0
    only_reg = str(args.only_when_regime).strip()

    base_r: List[float] = []
    over_r: List[float] = []
    end_idx: List[pd.Timestamp] = []
    picks_hist: List[Dict[str, Any]] = []

    w_ls_prev = pd.Series(0.0, index=candidates, dtype=float)

    for i, dt in enumerate(reg["Date"]):
        dt = pd.Timestamp(dt).normalize()
        if start_dt is not None and dt < start_dt:
            continue
        if end_dt is not None and dt > end_dt:
            continue
        if dt not in px.index or dt not in weights.index or dt not in valid_dates:
            continue

        w_base = _normalize_long_only(weights.loc[dt].reindex(px.columns).fillna(0.0))
        r_next = rets_next.loc[dt].reindex(px.columns).fillna(0.0)
        base_ret = float((w_base * r_next).sum())

        apply = sleeve_gross > 0 and long_k > 0 and short_k > 0
        if only_reg:
            apply = apply and str(reg.loc[i, "regime"]) == only_reg

        w_ls = pd.Series(0.0, index=candidates, dtype=float)
        longs: List[str] = []
        shorts: List[str] = []
        if apply:
            sc = _mom_score(px[candidates], dt, short=int(args.mom_short), long=int(args.mom_long))
            sc = sc.replace([np.inf, -np.inf], np.nan).fillna(-np.inf)
            sc = sc[(sc >= float(args.min_mom)) & (sc <= float(args.max_mom))]
            if len(sc) >= long_k + short_k:
                ranked = sc.sort_values(ascending=False)
                longs = [str(t) for t in ranked.head(long_k).index.tolist()]
                shorts = [str(t) for t in ranked.tail(short_k).index.tolist()]
                if longs:
                    w_ls.loc[longs] = 1.0 / float(len(longs))
                if shorts:
                    w_ls.loc[shorts] = -1.0 / float(len(shorts))
                # Enforce sum(|w|)=1
                denom = float(w_ls.abs().sum())
                if denom > 0:
                    w_ls = w_ls / denom
                else:
                    w_ls[:] = 0.0

        # Overlay return: base + sleeve component (net 0, gross sleeve_gross)
        sleeve_ret = float((w_ls.reindex(px.columns, fill_value=0.0) * r_next).sum())
        overlay_ret = float(base_ret + sleeve_gross * sleeve_ret)

        # Costs on sleeve turnover only.
        turn = float((w_ls - w_ls_prev).abs().sum())
        overlay_ret = float(overlay_ret - cost * sleeve_gross * turn)
        w_ls_prev = w_ls

        base_r.append(base_ret)
        over_r.append(overlay_ret)
        end_idx.append(pd.Timestamp(reg.loc[i, "EndDate"]).normalize())
        picks_hist.append({"Date": str(dt.date()), "longs": longs, "shorts": shorts})

    base_s = pd.Series(base_r, index=pd.to_datetime(end_idx), name="base_ret")
    over_s = pd.Series(over_r, index=pd.to_datetime(end_idx), name="overlay_ret")
    if base_s.empty:
        raise SystemExit("No returns computed; check panel coverage and dates.")

    out_dir = args.out_dir or (args.run_dir / "portable_momentum_ls_overlay")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_perf = _perf(base_s)
    over_perf = _perf(over_s)
    summary = {
        "run_dir": str(args.run_dir),
        "panel": str(args.panel),
        "universe": str(args.universe),
        "settings": {
            "sleeve_gross": float(sleeve_gross),
            "long_k": int(long_k),
            "short_k": int(short_k),
            "mom_short": int(args.mom_short),
            "mom_long": int(args.mom_long),
            "min_mom": float(args.min_mom),
            "max_mom": float(args.max_mom),
            "only_when_regime": only_reg,
            "cost_bps": float(args.cost_bps),
        },
        "base": asdict(base_perf),
        "overlay": asdict(over_perf),
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

