#!/usr/bin/env python3
"""
Backtest an SEC-filing-event alpha sleeve applied on top of an existing run's weights.

Use-case:
  - Keep the base strategy (e.g. dynamic-regime SPY-beater ETFs) as the core.
  - Add a small sleeve (5–20%) that rotates into stocks with fresh SEC filing events.

No-lookahead:
  - By default, events are applied with a lag (trade on the next decision day after the event).
  - Returns are realized close-to-close t->t+1 using the provided price panel.

Inputs:
  - --run-dir: directory with `weights.csv` and `regime_log.csv`
  - --panel: tidy panel CSV (Instrument,Date,Price_Close) including base tickers + event tickers
  - --events: CSV with Date,Ticker,Form (e.g. data_lake/sec/filing_events_nasdaq100.csv)

Outputs:
  - summary.json, returns.csv, picks.csv
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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


def _normalize(w: pd.Series) -> pd.Series:
    w = w.fillna(0.0).astype(float)
    w = w.clip(lower=0.0)
    s = float(w.sum())
    if s <= 0:
        return w * 0.0
    return w / s


def _load_events(events_csv: Path) -> pd.DataFrame:
    ev = pd.read_csv(events_csv)
    need = {"Date", "Ticker", "Form"}
    if not need.issubset(ev.columns):
        raise SystemExit(f"Events CSV must have columns {sorted(need)}")
    ev["Date"] = pd.to_datetime(ev["Date"], errors="coerce").dt.normalize()
    ev["Ticker"] = ev["Ticker"].astype(str).str.upper()
    ev["Form"] = ev["Form"].astype(str)
    ev = ev.dropna(subset=["Date", "Ticker", "Form"]).copy()
    return ev


def _event_scores_for_date(
    ev_day: pd.DataFrame,
    *,
    form_w: Dict[str, float],
    filer_penalty_lambda: float,
    filer_penalty_lookback: int,
    recent_counts: Optional[Dict[str, int]],
) -> pd.Series:
    if ev_day.empty:
        return pd.Series(dtype=float)
    # Score: sum(form_weight) - lambda * recent_filing_count
    weights = ev_day["Form"].map(lambda x: float(form_w.get(str(x), 0.0))).astype(float)
    s = weights.groupby(ev_day["Ticker"]).sum()
    if filer_penalty_lambda > 0 and recent_counts is not None:
        penal = pd.Series({t: float(recent_counts.get(t, 0)) for t in s.index}, dtype=float)
        s = s - float(filer_penalty_lambda) * penal
    return s.sort_values(ascending=False)


def _trading_shift(dates: pd.DatetimeIndex, dt: pd.Timestamp, lag: int) -> Optional[pd.Timestamp]:
    if lag <= 0:
        return dt
    if dt not in dates:
        return None
    i = int(dates.get_loc(dt))
    j = i - int(lag)
    if j < 0:
        return None
    return pd.Timestamp(dates[j]).normalize()


def main() -> int:
    ap = argparse.ArgumentParser(description="Backtest SEC-event alpha sleeve overlay on top of an existing run.")
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--start-date", type=str, default="")
    ap.add_argument("--end-date", type=str, default="")

    ap.add_argument("--sleeve", type=float, default=0.10)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--hold-days", type=int, default=5, help="Hold sleeve picks for N decision days (overlapping average).")
    ap.add_argument("--event-lag-days", type=int, default=1, help="Use events from dt-lag for decision date dt (>=1 avoids same-day lookahead).")
    ap.add_argument("--cooldown-days", type=int, default=10, help="Do not re-enter same ticker within N decision days.")
    ap.add_argument("--cash-symbol", type=str, default="BIL")
    ap.add_argument(
        "--funding",
        choices=["mix", "cash_first"],
        default="mix",
        help="mix: blend by scaling base to (1-sleeve); cash_first: fund sleeve by reducing cash-symbol weight only.",
    )

    ap.add_argument("--form-weight-8k", type=float, default=1.0)
    ap.add_argument("--form-weight-10q", type=float, default=0.5)
    ap.add_argument("--form-weight-10k", type=float, default=0.25)
    ap.add_argument("--filer-penalty-lambda", type=float, default=0.05)
    ap.add_argument("--filer-penalty-lookback", type=int, default=21)

    ap.add_argument("--mom-days", type=int, default=20, help="If >0, add momentum tilt to event scores.")
    ap.add_argument("--mom-weight", type=float, default=0.3, help="Blend: score = (1-mom_weight)*event + mom_weight*mom_rank")
    ap.add_argument("--min-score", type=float, default=-1e9, help="Filter tickers with final score below this.")

    ap.add_argument("--cost-bps", type=float, default=2.0, help="Turnover cost for overlay portfolio in bps.")
    ap.add_argument("--out-dir", type=Path, default=None)
    args = ap.parse_args()

    run_dir = args.run_dir
    weights = pd.read_csv(run_dir / "weights.csv", index_col=0)
    weights.index = pd.to_datetime(weights.index).normalize()
    weights = weights.astype(float).fillna(0.0)

    reg = pd.read_csv(run_dir / "regime_log.csv")
    reg["Date"] = pd.to_datetime(reg["Date"]).dt.normalize()
    reg["EndDate"] = pd.to_datetime(reg["EndDate"]).dt.normalize() if "EndDate" in reg.columns else reg["Date"]
    if len(reg) != len(weights):
        raise SystemExit("Mismatch: regime_log.csv rows != weights.csv rows")

    px = _load_panel_prices(args.panel)
    required_cols = sorted(set(weights.columns.tolist() + [str(args.benchmark)]))
    missing_cols = [c for c in required_cols if c not in px.columns]
    if missing_cols:
        raise SystemExit(f"Price panel missing required tickers: {missing_cols[:10]}")

    ev = _load_events(args.events)

    # Precompute realized next-day returns for all instruments.
    px = px.sort_index()
    rets_next = px.pct_change(fill_method=None).shift(-1).replace([np.inf, -np.inf], np.nan)
    valid = rets_next[required_cols].notna().all(axis=1)
    valid_dates = set(rets_next.index[valid].to_list())
    rets_next = rets_next.fillna(0.0)

    start_dt = pd.to_datetime(args.start_date).normalize() if str(args.start_date).strip() else None
    end_dt = pd.to_datetime(args.end_date).normalize() if str(args.end_date).strip() else None

    sleeve = float(np.clip(float(args.sleeve), 0.0, 1.0))
    top_k = int(max(0, int(args.top_k)))
    hold = int(max(1, int(args.hold_days)))
    lag = int(max(0, int(args.event_lag_days)))
    cost = float(args.cost_bps) / 10000.0
    cooldown = int(max(0, int(args.cooldown_days)))
    cash_symbol = str(args.cash_symbol).strip().upper()

    form_w = {"8-K": float(args.form_weight_8k), "10-Q": float(args.form_weight_10q), "10-K": float(args.form_weight_10k)}
    filer_lambda = float(max(0.0, float(args.filer_penalty_lambda)))
    filer_lb = int(max(1, int(args.filer_penalty_lookback)))

    # Build recent filing counts per ticker for penalty (rolling by decision dates).
    # We'll compute counts in a dict per day cheaply using a sliding window over event dates.
    ev_by_date: Dict[pd.Timestamp, pd.DataFrame] = {d: g for d, g in ev.groupby("Date")}
    ev_dates_sorted = sorted(ev_by_date.keys())
    # For quick lookup, also keep events by ticker/date count.
    # We'll update rolling counts when decision date advances.
    rolling_counts: Dict[str, int] = {}
    window_queue: List[pd.Timestamp] = []

    dates = pd.DatetimeIndex(sorted(px.index.normalize().unique()))

    # Sleeve holds queue.
    active_sleeves = [pd.Series(0.0, index=px.columns, dtype=float) for _ in range(hold)]
    last_enter_idx: Dict[str, int] = {}

    base_r: List[float] = []
    over_r: List[float] = []
    end_idx: List[pd.Timestamp] = []
    picks_hist: List[Dict[str, Any]] = []
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)

    for i, dt in enumerate(reg["Date"]):
        dt = pd.Timestamp(dt).normalize()
        if start_dt is not None and dt < start_dt:
            continue
        if end_dt is not None and dt > end_dt:
            continue
        if dt not in px.index or dt not in weights.index or dt not in valid_dates:
            continue

        # Maintain rolling event counts window based on event dates up to (dt - lag).
        event_dt = _trading_shift(dates, dt, lag)
        if event_dt is not None:
            # Extend window_queue to include any event dates <= event_dt.
            # We'll push dates as we encounter them in chronological order (by dt loop).
            window_queue.append(event_dt)
            # Drop old beyond lookback (approx by decision days, not calendar).
            while len(window_queue) > filer_lb:
                window_queue.pop(0)
            # Recompute rolling counts in the window (small enough).
            rolling_counts = {}
            for d in window_queue:
                g = ev_by_date.get(pd.Timestamp(d).normalize())
                if g is None or g.empty:
                    continue
                for t, c in g["Ticker"].value_counts().items():
                    rolling_counts[str(t)] = int(rolling_counts.get(str(t), 0) + int(c))

        w_base = _normalize(weights.loc[dt].reindex(px.columns).fillna(0.0))
        r_next = rets_next.loc[dt].reindex(px.columns).fillna(0.0)
        base_ret = float((w_base * r_next).sum())

        picks: List[str] = []
        sleeve_w_new = pd.Series(0.0, index=px.columns, dtype=float)

        if sleeve > 0 and top_k > 0 and event_dt is not None:
            ev_day = ev_by_date.get(pd.Timestamp(event_dt).normalize(), pd.DataFrame())
            if ev_day is not None and not ev_day.empty:
                s = _event_scores_for_date(
                    ev_day,
                    form_w=form_w,
                    filer_penalty_lambda=filer_lambda,
                    filer_penalty_lookback=filer_lb,
                    recent_counts=rolling_counts,
                )
                # Drop tickers not in panel.
                s = s[s.index.isin(px.columns)]

                # Apply cooldown.
                if cooldown > 0 and len(s):
                    filt = []
                    for t in s.index:
                        last_i = last_enter_idx.get(str(t))
                        if last_i is None or (i - int(last_i)) >= cooldown:
                            filt.append(t)
                    s = s.loc[filt] if filt else s.iloc[:0]

                if len(s) and int(args.mom_days) > 0 and float(args.mom_weight) > 0:
                    mom_days = int(args.mom_days)
                    # Momentum as of event_dt (known at decision date dt).
                    if event_dt in px.index:
                        mom = (px.loc[event_dt] / px.shift(mom_days).loc[event_dt] - 1.0).replace([np.inf, -np.inf], np.nan)
                        mom = mom.reindex(s.index).fillna(-np.inf)
                        # Rank mom to [0..1]
                        mr = mom.rank(pct=True)
                        s = (1.0 - float(args.mom_weight)) * s + float(args.mom_weight) * mr

                s = s[s >= float(args.min_score)]
                picks = [str(t) for t in s.head(top_k).index.tolist()]

        if picks:
            for t in picks:
                last_enter_idx[str(t)] = i
            sleeve_w_new.loc[picks] = float(1.0 / len(picks))
            sleeve_w_new = _normalize(sleeve_w_new)

        # Update sleeve queue and compute average sleeve exposure.
        active_sleeves.pop(0)
        active_sleeves.append(sleeve_w_new)
        sleeve_w = sum(active_sleeves) / float(hold)

        if str(args.funding) == "cash_first" and cash_symbol in w_base.index and sleeve_w.sum() > 0:
            avail = float(max(0.0, float(w_base.get(cash_symbol, 0.0))))
            eff = float(min(avail, sleeve))
            w_final = w_base.copy()
            w_final.loc[cash_symbol] = float(w_final.get(cash_symbol, 0.0) - eff)
            for t, v in sleeve_w.items():
                if float(v) != 0.0:
                    w_final.loc[t] = float(w_final.get(t, 0.0) + eff * float(v))
            w_final = _normalize(w_final)
        else:
            w_final = _normalize((1.0 - sleeve) * w_base + sleeve * sleeve_w)
        overlay_ret = float((w_final * r_next).sum())

        tc = cost * float((w_final - w_prev).abs().sum()) if cost > 0 else 0.0
        overlay_ret = float(overlay_ret - tc)
        w_prev = w_final

        base_r.append(base_ret)
        over_r.append(overlay_ret)
        end_idx.append(pd.Timestamp(reg.loc[i, "EndDate"]).normalize())
        picks_hist.append({"Date": str(dt.date()), "event_date": str(event_dt.date()) if event_dt is not None else "", "picks": picks})

    base_s = pd.Series(base_r, index=pd.to_datetime(end_idx), name="base_ret")
    over_s = pd.Series(over_r, index=pd.to_datetime(end_idx), name="overlay_ret")
    if base_s.empty:
        raise SystemExit("No returns computed; check panel coverage and dates.")

    out_dir = args.out_dir or (run_dir / "sec_alpha_overlay")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_perf = _perf(base_s)
    over_perf = _perf(over_s)
    summary = {
        "run_dir": str(run_dir),
        "panel": str(args.panel),
        "events": str(args.events),
        "settings": {
            "sleeve": float(sleeve),
            "top_k": int(top_k),
            "hold_days": int(hold),
            "event_lag_days": int(lag),
            "cooldown_days": int(cooldown),
            "form_weights": form_w,
            "filer_penalty_lambda": float(filer_lambda),
            "filer_penalty_lookback": int(filer_lb),
            "mom_days": int(args.mom_days),
            "mom_weight": float(args.mom_weight),
            "min_score": float(args.min_score),
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
