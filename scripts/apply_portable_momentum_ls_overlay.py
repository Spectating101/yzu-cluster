#!/usr/bin/env python3
"""
Apply a portable (market-neutral) long/short momentum sleeve on top of an existing `signal.json`.

This is designed to be used in paper mode and research runs:
  - outputs a new signal with negative weights (shorts)
  - keeps the base signal intact and adds a net ~0 sleeve
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple

import numpy as np
import pandas as pd


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _load_panel_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise SystemExit(f"Panel must have columns: {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    return px


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


def _as_of_to_dt(as_of: str) -> pd.Timestamp:
    s = str(as_of).strip()
    if not s:
        raise SystemExit("signal.json missing as_of")
    try:
        return pd.to_datetime(s).normalize()
    except Exception:
        # last-chance: accept YYYY-MM-DD only
        return pd.to_datetime(s[:10]).normalize()


def _closest_leq_date(px_index: pd.Index, dt: pd.Timestamp) -> pd.Timestamp:
    idx = pd.to_datetime(px_index).sort_values()
    if dt in idx:
        return pd.Timestamp(dt).normalize()
    leq = idx[idx <= dt]
    if len(leq) == 0:
        raise SystemExit(f"No panel date <= as_of={dt.date()}")
    return pd.Timestamp(leq.max()).normalize()


def _mom_score(px: pd.DataFrame, dt: pd.Timestamp, *, short: int, long: int) -> pd.Series:
    cur = px.loc[dt]
    s_ret = (cur / px.shift(short).loc[dt] - 1.0).replace([np.inf, -np.inf], np.nan)
    l_ret = (cur / px.shift(long).loc[dt] - 1.0).replace([np.inf, -np.inf], np.nan)
    score = 0.5 * s_ret.fillna(-np.inf) + 0.5 * l_ret.fillna(-np.inf)
    return score.astype(float)


@dataclass(frozen=True)
class SleevePicks:
    dt_used: str
    longs: List[str]
    shorts: List[str]


def _build_ls_sleeve(
    *,
    px: pd.DataFrame,
    dt: pd.Timestamp,
    candidates: List[str],
    long_k: int,
    short_k: int,
    mom_short: int,
    mom_long: int,
    min_mom: float,
    max_mom: float,
) -> Tuple[pd.Series, SleevePicks]:
    w_ls = pd.Series(0.0, index=candidates, dtype=float)
    longs: List[str] = []
    shorts: List[str] = []

    if long_k <= 0 or short_k <= 0:
        return w_ls, SleevePicks(dt_used=str(dt.date()), longs=longs, shorts=shorts)

    sc = _mom_score(px[candidates], dt, short=int(mom_short), long=int(mom_long))
    sc = sc.replace([np.inf, -np.inf], np.nan).fillna(-np.inf)
    sc = sc[(sc >= float(min_mom)) & (sc <= float(max_mom))]
    if len(sc) < long_k + short_k:
        return w_ls, SleevePicks(dt_used=str(dt.date()), longs=longs, shorts=shorts)

    ranked = sc.sort_values(ascending=False)
    longs = [str(t) for t in ranked.head(long_k).index.tolist()]
    shorts = [str(t) for t in ranked.tail(short_k).index.tolist()]
    if longs:
        w_ls.loc[longs] = 1.0 / float(len(longs))
    if shorts:
        w_ls.loc[shorts] = -1.0 / float(len(shorts))
    denom = float(w_ls.abs().sum())
    if denom > 0:
        w_ls = w_ls / denom
    else:
        w_ls[:] = 0.0
    return w_ls, SleevePicks(dt_used=str(dt.date()), longs=longs, shorts=shorts)


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply portable momentum long/short sleeve to a base signal.json.")
    ap.add_argument("--signal-json", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--universe", type=Path, required=True)
    ap.add_argument("--out-signal", type=Path, required=True)

    ap.add_argument("--sleeve-gross", type=float, default=0.20)
    ap.add_argument("--long-k", type=int, default=10)
    ap.add_argument("--short-k", type=int, default=10)
    ap.add_argument("--mom-short", type=int, default=21)
    ap.add_argument("--mom-long", type=int, default=126)
    ap.add_argument("--min-mom", type=float, default=-1e9)
    ap.add_argument("--max-mom", type=float, default=1e9)
    ap.add_argument("--only-when-regime", type=str, default="")
    args = ap.parse_args()

    base = _read_json(args.signal_json)
    base_weights = {str(k).upper(): float(v) for k, v in (base.get("weights") or {}).items()}
    as_of = str(base.get("as_of") or "")
    regime = str(base.get("regime") or "")

    sleeve_gross = float(max(0.0, float(args.sleeve_gross)))
    only_reg = str(args.only_when_regime).strip()
    if only_reg and regime != only_reg:
        out = dict(base)
        out["portable_overlay"] = {
            "enabled": True,
            "applied": False,
            "reason": f"only_when_regime={only_reg} but regime={regime}",
        }
        _write_json(args.out_signal, out)
        return 0

    px = _load_panel_prices(args.panel)
    if px.empty:
        raise SystemExit("Empty price panel")

    universe = _parse_universe(args.universe)
    base_cols = set(base_weights.keys())
    candidates = sorted([t for t in universe if t in px.columns and t not in base_cols])
    if not candidates:
        raise SystemExit("No universe tickers available in panel (and distinct from base tickers).")

    dt = _as_of_to_dt(as_of)
    dt_used = _closest_leq_date(px.index, dt)

    w_ls, picks = _build_ls_sleeve(
        px=px,
        dt=dt_used,
        candidates=candidates,
        long_k=int(args.long_k),
        short_k=int(args.short_k),
        mom_short=int(args.mom_short),
        mom_long=int(args.mom_long),
        min_mom=float(args.min_mom),
        max_mom=float(args.max_mom),
    )

    w_ls_scaled = (w_ls * sleeve_gross).to_dict()
    final: Dict[str, float] = dict(base_weights)
    for sym, w in w_ls_scaled.items():
        if abs(float(w)) < 1e-12:
            continue
        final[sym] = float(final.get(sym, 0.0) + float(w))

    out = dict(base)
    out["weights"] = final
    out["portable_overlay"] = {
        "enabled": True,
        "applied": bool(sleeve_gross > 0 and picks.longs and picks.shorts),
        "sleeve_gross": sleeve_gross,
        "long_k": int(args.long_k),
        "short_k": int(args.short_k),
        "mom_short": int(args.mom_short),
        "mom_long": int(args.mom_long),
        "dt_used": picks.dt_used,
        "longs": picks.longs,
        "shorts": picks.shorts,
        "universe": str(args.universe),
        "n_candidates": int(len(candidates)),
    }
    _write_json(args.out_signal, out)
    print(json.dumps({"out_signal": str(args.out_signal), "applied": out["portable_overlay"]["applied"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

