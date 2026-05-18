#!/usr/bin/env python3
"""
Oracle-driven *alpha sleeve* overlay (experimental).

Idea:
  - Use Intelligence Oracle outputs (INTELLIGENCE_BUNDLE.json) to propose candidate tickers.
  - Use simple price confirmation (momentum) from a tidy daily panel to avoid pure headline chasing.
  - Allocate a small sleeve (e.g. 5–20%) to the best candidates; keep the rest of the base signal.

This does NOT guarantee alpha; it's a systematic way to test whether Oracle-derived candidates
add value vs the base strategy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _load_panel_prices(panel: Path) -> pd.DataFrame:
    df = pd.read_csv(panel)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise SystemExit("Panel must have columns: Instrument, Date, Price_Close")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Date", "Price_Close", "Instrument"])
    px = df.pivot(index="Date", columns="Instrument", values="Price_Close").sort_index()
    return px.ffill()


def _momentum_score(px: pd.DataFrame, t: str, as_of: pd.Timestamp, mom_short: int, mom_long: int) -> float:
    s = px.get(t)
    if s is None or s.empty or as_of not in s.index:
        return float("-inf")
    cur = float(s.loc[as_of])
    prev_s = s.shift(mom_short).loc[as_of] if mom_short > 0 else np.nan
    prev_l = s.shift(mom_long).loc[as_of] if mom_long > 0 else np.nan
    r_s = float(cur / prev_s - 1.0) if np.isfinite(prev_s) and prev_s != 0 else float("nan")
    r_l = float(cur / prev_l - 1.0) if np.isfinite(prev_l) and prev_l != 0 else float("nan")
    if not np.isfinite(r_s) and not np.isfinite(r_l):
        return float("-inf")
    if not np.isfinite(r_s):
        return float(r_l)
    if not np.isfinite(r_l):
        return float(r_s)
    return float(0.5 * r_s + 0.5 * r_l)


def _normalize_weights(w: Dict[str, float]) -> Dict[str, float]:
    clean = {k: float(v) for k, v in w.items() if float(v) > 0}
    s = float(sum(clean.values()))
    if s <= 0:
        return {}
    return {k: float(v) / s for k, v in clean.items()}


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply an Oracle-driven alpha sleeve on top of a base signal.")
    ap.add_argument("--base-signal", type=Path, required=True, help="Base signal.json from the trading engine.")
    ap.add_argument("--bundle", type=Path, default=Path("INTELLIGENCE_BUNDLE.json"))
    ap.add_argument("--market-context", type=Path, default=Path("MARKET_CONTEXT.json"))
    ap.add_argument("--panel", type=Path, required=True, help="Tidy daily panel CSV used for momentum confirmation.")
    ap.add_argument(
        "--reddit-signals-parquet",
        type=Path,
        default=None,
        help="Optional: reddit_daily_signals.parquet to gate candidates by novelty/sentiment on the as_of date.",
    )
    ap.add_argument("--reddit-novelty-z-min", type=float, default=2.0)
    ap.add_argument("--reddit-min-posts", type=int, default=2)
    ap.add_argument("--reddit-sentiment-min", type=float, default=-1e9)
    ap.add_argument("--asset-class", choices=["stocks", "crypto", "both"], default="both")
    ap.add_argument("--sleeve", type=float, default=0.15, help="Fraction of portfolio allocated to the alpha sleeve.")
    ap.add_argument("--sleeve-max-risk-score", type=float, default=0.7, help="Disable sleeve if risk_score >= this.")
    ap.add_argument("--top-k", type=int, default=2)
    ap.add_argument("--mom-short", type=int, default=21)
    ap.add_argument("--mom-long", type=int, default=63)
    ap.add_argument("--min-score", type=float, default=0.0, help="Only include candidates with momentum score >= this.")
    ap.add_argument("--out", type=Path, default=Path("signal_with_oracle_alpha.json"))
    args = ap.parse_args()

    base = _read_json(args.base_signal)
    base_w = base.get("weights") or {}
    if not isinstance(base_w, dict):
        raise SystemExit("base-signal weights must be a dict")
    base_w = {str(k): float(v) for k, v in base_w.items()}

    bundle = _read_json(args.bundle)
    ctx = _read_json(args.market_context) if args.market_context.exists() else {}
    risk_score = float(ctx.get("risk_score", 0.0))

    sleeve = float(np.clip(float(args.sleeve), 0.0, 1.0))
    if risk_score >= float(args.sleeve_max_risk_score):
        sleeve = 0.0

    ex = bundle.get("extracted") or {}
    by_cls = ex.get("tickers_by_asset_class") or {}
    candidates: List[str] = []
    if args.asset_class in {"stocks", "both"}:
        candidates += list(by_cls.get("stock") or [])
    if args.asset_class in {"crypto", "both"}:
        candidates += list(by_cls.get("crypto") or [])
    candidates = sorted({str(t).strip().upper().lstrip("$") for t in candidates if str(t).strip()})

    px = _load_panel_prices(args.panel)
    as_of = px.index.max()
    available = {t for t in candidates if t in px.columns}

    # Optional Reddit gating (only works for stock tickers that appear in the Reddit panel).
    if args.reddit_signals_parquet is not None:
        rs = pd.read_parquet(Path(args.reddit_signals_parquet))
        rs["Date"] = pd.to_datetime(rs["Date"], errors="coerce")
        rs["Ticker"] = rs["Ticker"].astype(str).str.upper()
        day = rs[rs["Date"] == pd.Timestamp(as_of.date())].copy()
        if not day.empty:
            day = day.set_index("Ticker")
            gated = set()
            for t in list(available):
                if t not in day.index:
                    continue
                novelty = float(day.loc[t].get("novelty_30d_z", np.nan))
                posts = int(day.loc[t].get("mention_posts", 0))
                sent = float(day.loc[t].get("sentiment_mean", 0.0))
                if np.isfinite(novelty) and novelty >= float(args.reddit_novelty_z_min) and posts >= int(args.reddit_min_posts) and sent >= float(args.reddit_sentiment_min):
                    gated.add(t)
            available = gated if gated else available

    scored: List[Tuple[str, float]] = []
    for t in sorted(available):
        s = _momentum_score(px, t, as_of, int(args.mom_short), int(args.mom_long))
        if np.isfinite(s) and float(s) >= float(args.min_score):
            scored.append((t, float(s)))
    scored.sort(key=lambda kv: kv[1], reverse=True)

    picks = [t for t, _ in scored[: int(max(0, args.top_k))]] if sleeve > 0 else []
    sleeve_w = {t: float(1.0 / len(picks)) for t in picks} if picks else {}

    # Merge: shrink base to (1-sleeve), allocate sleeve to picks.
    merged = {k: float(v) * (1.0 - sleeve) for k, v in base_w.items()}
    for t, w in sleeve_w.items():
        merged[t] = merged.get(t, 0.0) + float(w) * sleeve
    merged = _normalize_weights(merged)

    out = {
        "as_of": base.get("as_of", ""),
        "regime": base.get("regime", ""),
        "weights": merged,
        "oracle_alpha": {
            "bundle": str(args.bundle),
            "market_context": str(args.market_context),
            "risk_score": risk_score,
            "asset_class": str(args.asset_class),
            "sleeve_requested": float(args.sleeve),
            "sleeve_applied": float(sleeve),
            "as_of_price_date": str(as_of.date()) if hasattr(as_of, "date") else str(as_of),
            "mom_short": int(args.mom_short),
            "mom_long": int(args.mom_long),
            "min_score": float(args.min_score),
            "top_k": int(args.top_k),
            "candidates": candidates,
            "scored_top": [{"ticker": t, "score": s} for t, s in scored[:10]],
            "picks": picks,
        },
    }
    _write_json(args.out, out)
    print(f"✅ Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
