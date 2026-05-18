#!/usr/bin/env python3
"""
Screen for "rebound candidates":
- Recently down (short-horizon drawdown / negative return)
- But still "quality" in price terms (above long MA / positive medium momentum)
- With forced-flow / liquidity shock footprints (dollar-volume z spikes) that often accompany index rebalances.

This does NOT predict the future; it produces a *watchlist* to paper-test or further research.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


def _load_panel(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv)
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Panel must include columns: {sorted(need)}")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df = df.sort_values(["Instrument", "Date"])
    return df


def _daily_wide(panel: pd.DataFrame, value_col: str) -> pd.DataFrame:
    wide = (
        panel.pivot_table(index="Date", columns="Instrument", values=value_col, aggfunc="last")
        .sort_index()
        .dropna(axis=0, how="all")
    )
    return wide


def _zscore(x: pd.Series) -> pd.Series:
    mu = x.rolling(60, min_periods=30).mean()
    sd = x.rolling(60, min_periods=30).std(ddof=1).replace(0.0, np.nan)
    return (x - mu) / sd


def _event_flow_proxies(close_daily: pd.DataFrame, volume_daily: Optional[pd.DataFrame], lookback_days: int = 21) -> pd.DataFrame:
    """
    Daily-to-latest-date proxies:
    - dollar_vol_z: dollar-volume z-score
    - zret: standardized daily return
    - shock_cnt_z4_1m: count(|zret|>4) in trailing month
    - flow_only_cnt_1m: count(dollar_vol_z>2 and |zret|<1) in trailing month
    """
    if close_daily.empty:
        return pd.DataFrame()

    window = int(max(5, lookback_days))
    minp = int(max(3, math.floor(0.7 * window)))
    close_ff = close_daily.sort_index().ffill()
    dret = close_ff.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)
    dstd = dret.rolling(window=max(10, window), min_periods=max(5, minp)).std(ddof=1)
    eps = 1e-12
    zret = (dret / (dstd + eps)).replace([np.inf, -np.inf], np.nan).clip(-20.0, 20.0)

    out = pd.DataFrame(index=close_ff.columns)
    out.index.name = "Instrument"

    if volume_daily is None or volume_daily.empty:
        out["dollar_vol_z"] = np.nan
        out["shock_cnt_z4_1m"] = (zret.abs() > 4.0).astype(float).rolling(window=window, min_periods=minp).sum().iloc[-1]
        out["flow_only_cnt_1m"] = np.nan
        return out

    vol = volume_daily.reindex(close_daily.index).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    dv = (close_ff.reindex(vol.index).ffill() * vol).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    ldv = np.log1p(dv.clip(lower=0.0))
    dvz = ldv.apply(_zscore)

    flow = dvz > 2.0
    flow_only = flow & (zret.abs() < 1.0)

    out["dollar_vol_z"] = dvz.iloc[-1]
    out["shock_cnt_z4_1m"] = (zret.abs() > 4.0).astype(float).rolling(window=window, min_periods=minp).sum().iloc[-1]
    out["flow_only_cnt_1m"] = flow_only.astype(float).rolling(window=window, min_periods=minp).sum().iloc[-1]
    return out


def _screen_rebound_candidates(
    close_daily: pd.DataFrame,
    volume_daily: Optional[pd.DataFrame],
    *,
    asof: pd.Timestamp,
    min_price: float,
    require_uptrend: bool,
    mode: str,
) -> pd.DataFrame:
    close = close_daily.sort_index().ffill()
    close = close.loc[:asof]
    if close.empty:
        return pd.DataFrame()

    px = close.iloc[-1].copy()
    if not isinstance(px, pd.Series):
        return pd.DataFrame()

    # Returns / drawdowns.
    r5 = close.pct_change(5).iloc[-1]
    r21 = close.pct_change(21).iloc[-1]
    r63 = close.pct_change(63).iloc[-1]
    dd21 = (close / close.rolling(21, min_periods=10).max() - 1.0).iloc[-1]

    # Trend filter (daily 200SMA).
    sma200 = close.rolling(200, min_periods=120).mean().iloc[-1]
    uptrend = px > sma200

    # Flow / shock proxies (forensics for forced flow).
    flow = _event_flow_proxies(close, volume_daily.loc[:asof] if volume_daily is not None else None, lookback_days=21)

    df = pd.DataFrame(
        {
            "price": px,
            "ret_5d": r5,
            "ret_21d": r21,
            "ret_63d": r63,
            "dd_21d": dd21,
            "uptrend_200sma": uptrend.astype(float),
        }
    )
    df = df.join(flow, how="left")

    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=["price"])
    df = df[df["price"] >= float(min_price)]
    if require_uptrend:
        df = df[df["uptrend_200sma"] > 0.5]

    mode = str(mode).lower().strip()
    if mode == "forced_flow_dip":
        # A more MSCI-like footprint: unusual dollar-volume + dip but not a crash.
        if "dollar_vol_z" in df.columns:
            df = df[df["dollar_vol_z"] >= 1.0]
        if "flow_only_cnt_1m" in df.columns:
            df = df[df["flow_only_cnt_1m"] >= 1.0]
    elif mode == "capitulation":
        # One or more extreme shock days in the last month.
        if "shock_cnt_z4_1m" in df.columns:
            df = df[df["shock_cnt_z4_1m"] >= 1.0]

    # Core: down recently, but not broken (63d >= -10% by default via score), with flow-only spikes preferred.
    # The score is a watchlist heuristic, not a forecast.
    df["score"] = (
        1.5 * df.get("flow_only_cnt_1m", 0.0).fillna(0.0)
        + 0.75 * df.get("dollar_vol_z", 0.0).fillna(0.0)
        + 2.0 * (-df["dd_21d"].clip(lower=-0.50, upper=0.0))
        + 1.0 * (-df["ret_21d"].clip(lower=-0.50, upper=0.0))
        + 0.5 * (df["ret_63d"].fillna(0.0).clip(lower=-0.50, upper=0.50))
        - 0.75 * df.get("shock_cnt_z4_1m", 0.0).fillna(0.0)
    )

    # Require "actually down recently".
    df = df[df["ret_21d"] <= -0.05]
    df = df.sort_values(["score"], ascending=False)
    return df


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", type=Path, default=Path("Sharpe-Renaissance/data_lake/yfinance_nasdaq100_10y.csv"))
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/rebound_candidates"))
    ap.add_argument("--asof", type=str, default="", help="YYYY-MM-DD. Default uses max date in panel.")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--min-price", type=float, default=5.0)
    ap.add_argument("--require-uptrend", action="store_true", help="Require price > 200SMA.")
    ap.add_argument(
        "--mode",
        choices=["dip_in_uptrend", "forced_flow_dip", "capitulation"],
        default="dip_in_uptrend",
        help="Which type of rebound setup to screen for.",
    )
    args = ap.parse_args()

    panel = _load_panel(args.panel)
    close_d = _daily_wide(panel, "Price_Close")
    vol_d = _daily_wide(panel, "Volume") if "Volume" in panel.columns else None

    asof = pd.to_datetime(args.asof) if args.asof else pd.to_datetime(close_d.index.max())
    asof = pd.Timestamp(asof).normalize()
    # Ensure we use an available date (market calendars differ). Choose last index <= asof.
    idx = close_d.index[close_d.index <= asof]
    if len(idx) == 0:
        raise SystemExit(f"No panel dates <= {asof.date()}")
    asof = pd.Timestamp(idx.max())

    screen = _screen_rebound_candidates(
        close_d,
        vol_d,
        asof=asof,
        min_price=float(args.min_price),
        require_uptrend=bool(args.require_uptrend),
        mode=str(args.mode),
    )
    out = screen.head(int(args.top)).copy()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.out_dir / f"rebound_watchlist_{asof.date().isoformat()}.csv"
    md_path = args.out_dir / f"rebound_watchlist_{asof.date().isoformat()}.md"
    out.to_csv(csv_path, index=True)

    cols = [
        "score",
        "price",
        "ret_5d",
        "ret_21d",
        "ret_63d",
        "dd_21d",
        "dollar_vol_z",
        "flow_only_cnt_1m",
        "shock_cnt_z4_1m",
        "uptrend_200sma",
    ]
    cols = [c for c in cols if c in out.columns]
    md = ["# Rebound Watchlist (Heuristic)", "", f"- asof: `{asof.date().isoformat()}`", f"- panel: `{args.panel}`", ""]
    if out.empty:
        md.append("_No candidates passed the screen._")
    else:
        md.append(out[cols].round(4).to_markdown())
    md_path.write_text("\n".join(md) + "\n")

    print(f"asof={asof.date().isoformat()} candidates={len(screen)} top={len(out)}")
    print(f"wrote: {csv_path}")
    print(f"wrote: {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
