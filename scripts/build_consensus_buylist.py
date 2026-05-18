#!/usr/bin/env python3
"""
Consensus Buylist Builder

Best-practice intent:
- Core alpha sleeve: trend/quality persistence.
- Rebound sleeve: short-term dip + flow anomaly timing.
- Final score blends both so we don't overfit to dips alone.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def load_panel(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv)
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Panel must include columns: {sorted(need)}")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"]).sort_values(["Instrument", "Date"])
    return df


def wide(df: pd.DataFrame, col: str) -> pd.DataFrame:
    return (
        df.pivot_table(index="Date", columns="Instrument", values=col, aggfunc="last")
        .sort_index()
        .dropna(axis=0, how="all")
    )


def zscore_cs(s: pd.Series) -> pd.Series:
    x = s.astype(float)
    mu = float(x.mean())
    sd = float(x.std(ddof=1))
    if not np.isfinite(sd) or sd <= 1e-12:
        return 0.0 * x
    return (x - mu) / sd


def build_buylist(
    close: pd.DataFrame,
    volume: pd.DataFrame | None,
    *,
    asof: pd.Timestamp,
    top_n: int,
    min_price: float,
    core_weight: float,
    rebound_weight: float,
) -> pd.DataFrame:
    px = close.sort_index().ffill()
    px = px.loc[:asof]
    asof = pd.Timestamp(px.index.max())

    ret_21 = px.pct_change(21).iloc[-1]
    ret_63 = px.pct_change(63).iloc[-1]
    ret_252 = px.pct_change(252).iloc[-1]
    vol_20 = px.pct_change().rolling(20).std(ddof=1).iloc[-1] * np.sqrt(252.0)
    dd_21 = (px / px.rolling(21, min_periods=10).max() - 1.0).iloc[-1]
    up = (px.iloc[-1] > px.rolling(200, min_periods=120).mean().iloc[-1]).astype(float)
    price = px.iloc[-1]

    dvz = pd.Series(0.0, index=px.columns)
    flow_only = pd.Series(0.0, index=px.columns)
    if volume is not None and not volume.empty:
        vol = volume.reindex(px.index).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        dv = (px * vol).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        ldv = np.log1p(dv.clip(lower=0.0))
        mu = ldv.rolling(60, min_periods=30).mean()
        sd = ldv.rolling(60, min_periods=30).std(ddof=1).replace(0.0, np.nan)
        dvz_daily = (ldv - mu) / sd
        dvz = dvz_daily.iloc[-1].fillna(0.0)

        dret = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)
        dstd = dret.rolling(21, min_periods=15).std(ddof=1).replace(0.0, np.nan)
        zret = (dret / dstd).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        flow = dvz_daily > 2.0
        flow_only = (flow & (zret.abs() < 1.0)).astype(float).rolling(21, min_periods=15).sum().iloc[-1].fillna(0.0)

    # Core alpha score: persistence + quality (lower vol).
    core_score = (
        1.0 * zscore_cs(ret_63.fillna(0.0))
        + 0.5 * zscore_cs(ret_252.fillna(0.0))
        - 0.5 * zscore_cs(vol_20.fillna(vol_20.median()))
    )

    # Rebound timing score: currently down + pullback + flow footprint.
    rebound_score = (
        1.0 * zscore_cs((-ret_21).fillna(0.0))
        + 1.0 * zscore_cs((-dd_21).fillna(0.0))
        + 0.5 * zscore_cs(dvz.fillna(0.0))
        + 0.5 * zscore_cs(flow_only.fillna(0.0))
    )

    final_score = float(core_weight) * core_score + float(rebound_weight) * rebound_score
    out = pd.DataFrame(
        {
            "price": price,
            "ret_21d": ret_21,
            "ret_63d": ret_63,
            "ret_252d": ret_252,
            "dd_21d": dd_21,
            "uptrend_200sma": up,
            "dollar_vol_z": dvz,
            "flow_only_cnt_1m": flow_only,
            "core_score": core_score,
            "rebound_score": rebound_score,
            "score": final_score,
        }
    )
    out = out.replace([np.inf, -np.inf], np.nan).dropna(subset=["price"])
    out = out[out["price"] >= float(min_price)]
    out = out[out["uptrend_200sma"] > 0.5]
    out = out[out["ret_21d"] <= -0.03]
    out = out.sort_values("score", ascending=False).head(int(top_n))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--asof", type=str, default="", help="YYYY-MM-DD (default: latest in panel)")
    ap.add_argument("--top-n", type=int, default=25)
    ap.add_argument("--min-price", type=float, default=5.0)
    ap.add_argument("--core-weight", type=float, default=0.7)
    ap.add_argument("--rebound-weight", type=float, default=0.3)
    args = ap.parse_args()

    panel = load_panel(args.panel)
    close = wide(panel, "Price_Close")
    volume = wide(panel, "Volume") if "Volume" in panel.columns else None
    asof = pd.to_datetime(args.asof) if args.asof else pd.Timestamp(close.index.max())
    asof = pd.Timestamp(close.index[close.index <= asof].max())

    out = build_buylist(
        close,
        volume,
        asof=asof,
        top_n=int(args.top_n),
        min_price=float(args.min_price),
        core_weight=float(args.core_weight),
        rebound_weight=float(args.rebound_weight),
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.out_dir / f"consensus_buylist_{asof.date().isoformat()}.csv"
    md_path = args.out_dir / f"consensus_buylist_{asof.date().isoformat()}.md"
    out.to_csv(csv_path, index=True)
    body = [
        "# Consensus Buylist",
        "",
        f"- asof: `{asof.date().isoformat()}`",
        f"- panel: `{args.panel}`",
        f"- blend: core={float(args.core_weight):.2f}, rebound={float(args.rebound_weight):.2f}",
        "",
    ]
    if out.empty:
        body.append("_No candidates passed the filters._")
    else:
        show_cols = [
            "score",
            "core_score",
            "rebound_score",
            "price",
            "ret_21d",
            "ret_63d",
            "dd_21d",
            "dollar_vol_z",
            "flow_only_cnt_1m",
        ]
        body.append(out[show_cols].round(4).to_markdown())
    md_path.write_text("\n".join(body) + "\n")

    print(f"asof={asof.date().isoformat()} picks={len(out)}")
    print(f"wrote: {csv_path}")
    print(f"wrote: {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

