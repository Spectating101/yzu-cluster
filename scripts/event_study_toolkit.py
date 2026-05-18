#!/usr/bin/env python3
"""
Generic event study toolkit (offline).

Inputs:
  - tidy panel CSV: Instrument, Date, Price_Close
  - events CSV with columns:
      - instrument (or ticker)
      - event_date (YYYY-MM-DD)
      - event_id (optional)

Method:
  - Market model: r_i,t = alpha_i + beta_i * r_m,t + eps
  - Abnormal returns (AR) in event window
  - Cumulative abnormal returns (CAR) per event

Outputs:
  - `event_ar.csv`: per-event per-day AR in event window
  - `event_car.csv`: per-event CAR summary
  - `report.md`
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


def _load_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise ValueError("Panel must have columns: Instrument, Date, Price_Close")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = df.pivot(index="Date", columns="Instrument", values="Price_Close").sort_index().ffill()
    return px


def _load_events(events_csv: Path) -> pd.DataFrame:
    ev = pd.read_csv(events_csv)
    cols = {c.lower(): c for c in ev.columns}
    inst_col = cols.get("instrument") or cols.get("ticker")
    date_col = cols.get("event_date") or cols.get("date")
    if not inst_col or not date_col:
        raise ValueError("Events CSV must have columns: instrument (or ticker) and event_date (or date)")
    ev = ev.rename(columns={inst_col: "instrument", date_col: "event_date"})
    ev["event_date"] = pd.to_datetime(ev["event_date"], errors="coerce")
    ev = ev.dropna(subset=["instrument", "event_date"])
    if "event_id" not in ev.columns:
        ev["event_id"] = np.arange(len(ev), dtype=int)
    return ev[["event_id", "instrument", "event_date"]].sort_values(["instrument", "event_date"]).reset_index(drop=True)


def _ols_alpha_beta(y: np.ndarray, x: np.ndarray) -> Tuple[float, float]:
    # y ~ a + b*x
    X = np.column_stack([np.ones(len(x), dtype=float), x.astype(float)])
    beta = np.linalg.pinv(X) @ y.astype(float)
    return float(beta[0]), float(beta[1])


def run_event_study(
    *,
    prices: pd.DataFrame,
    events: pd.DataFrame,
    market_ticker: str,
    estimation_window: Tuple[int, int],
    event_window: Tuple[int, int],
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    if market_ticker not in prices.columns:
        raise ValueError(f"market_ticker {market_ticker} not in panel")
    rets = prices.pct_change().replace([np.inf, -np.inf], np.nan).dropna(how="all")
    mkt = rets[market_ticker].dropna()

    ar_rows: List[Dict] = []
    car_rows: List[Dict] = []
    skipped = 0

    for row in events.itertuples(index=False):
        event_id = str(row.event_id)
        inst = str(row.instrument)
        dt = pd.Timestamp(row.event_date)
        if inst not in rets.columns:
            skipped += 1
            continue

        # Find nearest trading date on/after event_date.
        if dt not in rets.index:
            idx = rets.index.searchsorted(dt)
            if idx >= len(rets.index):
                skipped += 1
                continue
            dt = rets.index[idx]

        # Build estimation and event windows in trading-day index space.
        t0 = rets.index.get_loc(dt)
        est_start = t0 + int(estimation_window[0])
        est_end = t0 + int(estimation_window[1])
        ev_start = t0 + int(event_window[0])
        ev_end = t0 + int(event_window[1])

        if est_start < 0 or est_end <= est_start or ev_start < 0 or ev_end <= ev_start:
            skipped += 1
            continue
        if ev_end >= len(rets.index) or est_end >= len(rets.index):
            skipped += 1
            continue

        est_idx = rets.index[est_start : est_end + 1]
        ev_idx = rets.index[ev_start : ev_end + 1]

        y_est = rets.loc[est_idx, inst].astype(float)
        x_est = rets.loc[est_idx, market_ticker].astype(float)
        # Align and drop nans.
        est_df = pd.concat([y_est.rename("y"), x_est.rename("x")], axis=1).dropna()
        if len(est_df) < 30:
            skipped += 1
            continue
        a, b = _ols_alpha_beta(est_df["y"].to_numpy(), est_df["x"].to_numpy())

        y_ev = rets.loc[ev_idx, inst].astype(float)
        x_ev = rets.loc[ev_idx, market_ticker].astype(float)
        ev_df = pd.concat([y_ev.rename("y"), x_ev.rename("x")], axis=1).dropna()
        if ev_df.empty:
            skipped += 1
            continue

        exp = a + b * ev_df["x"]
        ar = ev_df["y"] - exp
        car = float(ar.sum())

        car_rows.append(
            {
                "event_id": event_id,
                "instrument": inst,
                "event_date": dt.date().isoformat(),
                "alpha": float(a),
                "beta": float(b),
                "car": float(car),
                "n_event_days": int(len(ar)),
                "n_est_days": int(len(est_df)),
            }
        )
        for d, v in ar.items():
            ar_rows.append(
                {
                    "event_id": event_id,
                    "instrument": inst,
                    "event_date": dt.date().isoformat(),
                    "date": pd.Timestamp(d).date().isoformat(),
                    "ar": float(v),
                }
            )

    ar_df = pd.DataFrame(ar_rows)
    car_df = pd.DataFrame(car_rows).sort_values(["event_date", "instrument"]).reset_index(drop=True)
    summary = {
        "events_total": int(len(events)),
        "events_used": int(len(car_df)),
        "events_skipped": int(skipped),
        "car_mean": float(car_df["car"].mean()) if not car_df.empty else 0.0,
        "car_median": float(car_df["car"].median()) if not car_df.empty else 0.0,
    }
    return ar_df, car_df, summary


def main() -> int:
    p = argparse.ArgumentParser(description="Generic event study toolkit.")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--events", type=Path, required=True)
    p.add_argument("--market-ticker", type=str, default="SPY")
    p.add_argument("--estimation-window", type=int, nargs=2, default=[-250, -30], help="Trading day offsets [start, end]")
    p.add_argument("--event-window", type=int, nargs=2, default=[-5, 5], help="Trading day offsets [start, end]")
    p.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/event_study"))
    args = p.parse_args()

    px = _load_prices(args.panel)
    ev = _load_events(args.events)
    ar_df, car_df, summary = run_event_study(
        prices=px,
        events=ev,
        market_ticker=str(args.market_ticker),
        estimation_window=(int(args.estimation_window[0]), int(args.estimation_window[1])),
        event_window=(int(args.event_window[0]), int(args.event_window[1])),
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    ar_df.to_csv(args.out_dir / "event_ar.csv", index=False)
    car_df.to_csv(args.out_dir / "event_car.csv", index=False)
    (args.out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    lines = []
    lines.append("# Event Study Report\n\n")
    lines.append(f"- Panel: `{args.panel}`\n")
    lines.append(f"- Events: `{args.events}`\n")
    lines.append(f"- Market: `{args.market_ticker}`\n")
    lines.append(f"- Estimation window: {args.estimation_window}\n")
    lines.append(f"- Event window: {args.event_window}\n\n")
    lines.append("## Summary\n\n```json\n")
    lines.append(json.dumps(summary, indent=2))
    lines.append("\n```\n\n")
    if not car_df.empty:
        lines.append("## CAR (top 10 by absolute value)\n\n")
        top = car_df.reindex(car_df["car"].abs().sort_values(ascending=False).head(10).index)
        lines.append(top.to_markdown(index=False))
        lines.append("\n")
    (args.out_dir / "report.md").write_text("".join(lines))

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
