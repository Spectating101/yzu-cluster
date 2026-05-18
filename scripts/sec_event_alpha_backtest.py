#!/usr/bin/env python3
"""
Event-study alpha backtest using SEC filing events + a simple drift filter.

Signal:
  For each day t, tickers with an eligible filing on t get a base score.
  Optionally tilt score by pre-event momentum to avoid blind buying.
  Trade next day (t+1), hold for N days (overlapping holds).

This is research tooling, not investment advice.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd


ET = ZoneInfo("America/New_York")


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


def rolling_relative_stats(
    strat_pnl: pd.Series,
    bench_pnl: pd.Series,
    *,
    window: int = 21,
    thresholds: list[float] = [0.0, 0.02, 0.05, 0.10],
) -> Dict[str, Any]:
    strat_pnl = strat_pnl.reindex(bench_pnl.index).fillna(0.0)
    bench_pnl = bench_pnl.fillna(0.0)
    a = np.log1p(strat_pnl) - np.log1p(bench_pnl)
    ex = np.expm1(a.rolling(window, min_periods=window).sum()).dropna()
    if ex.empty:
        return {"window": window, "n": 0, "thresholds": thresholds, "hit_rates": {}}
    hit = {str(t): float((ex >= float(t)).mean()) for t in thresholds}
    return {
        "window": window,
        "n": int(len(ex)),
        "thresholds": thresholds,
        "hit_rates": hit,
        "median_excess": float(ex.median()),
        "p10_excess": float(ex.quantile(0.10)),
        "p90_excess": float(ex.quantile(0.90)),
        "worst_excess": float(ex.min()),
        "best_excess": float(ex.max()),
    }


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


def load_events(events_csv: Path) -> pd.DataFrame:
    ev = pd.read_csv(events_csv, parse_dates=["Date"])
    need = {"Date", "Ticker", "Form"}
    if not need.issubset(ev.columns):
        raise ValueError(f"Events need columns {sorted(need)}")
    ev["Ticker"] = ev["Ticker"].astype(str).str.upper()
    ev["Form"] = ev["Form"].astype(str).str.upper()
    ev["Date"] = pd.to_datetime(ev["Date"], errors="coerce")
    ev = ev.dropna(subset=["Date", "Ticker", "Form"])
    ev["Date"] = ev["Date"].dt.normalize()
    if "AcceptanceDateTime" in ev.columns:
        ev["AcceptanceDateTime"] = pd.to_datetime(ev["AcceptanceDateTime"], errors="coerce", utc=True)
    else:
        ev["AcceptanceDateTime"] = pd.NaT
    return ev


def _next_trading_date(idx: pd.DatetimeIndex, dt: pd.Timestamp, *, include_same: bool) -> pd.Timestamp | pd.NaT:
    dt = pd.Timestamp(dt).normalize()
    pos = int(idx.searchsorted(dt, side="left"))
    if include_same:
        if pos < len(idx):
            return pd.Timestamp(idx[pos]).normalize()
        return pd.NaT
    if pos < len(idx) and pd.Timestamp(idx[pos]).normalize() == dt:
        pos += 1
    if pos < len(idx):
        return pd.Timestamp(idx[pos]).normalize()
    return pd.NaT


def _classify_filing_session(ts: pd.Timestamp | None) -> str:
    if ts is None or pd.isna(ts):
        return "unknown"
    ts_et = ts.tz_convert(ET) if ts.tzinfo is not None else ts.tz_localize("UTC").tz_convert(ET)
    hhmm = ts_et.hour * 60 + ts_et.minute
    if hhmm < (9 * 60 + 30):
        return "premarket"
    if hhmm >= (16 * 60):
        return "after_close"
    return "regular_hours"


def _available_trading_date(
    *,
    filing_date: pd.Timestamp,
    acceptance_dt: pd.Timestamp | None,
    trading_index: pd.DatetimeIndex,
    event_timing_mode: str,
) -> pd.Timestamp | pd.NaT:
    filing_date = pd.Timestamp(filing_date).normalize()
    if event_timing_mode == "legacy_date":
        return _next_trading_date(trading_index, filing_date, include_same=True)

    if acceptance_dt is None or pd.isna(acceptance_dt):
        # Conservative fallback: unknown intraday timing means wait until the next session.
        return _next_trading_date(trading_index, filing_date, include_same=False)

    ts_et = acceptance_dt.tz_convert(ET) if acceptance_dt.tzinfo is not None else acceptance_dt.tz_localize("UTC").tz_convert(ET)
    session = _classify_filing_session(ts_et)
    filing_day_et = pd.Timestamp(ts_et.tz_localize(None).date())
    if session == "premarket":
        return _next_trading_date(trading_index, filing_day_et, include_same=True)
    return _next_trading_date(trading_index, filing_day_et, include_same=False)


def _prepare_events_for_trading(
    events: pd.DataFrame,
    *,
    trading_index: pd.DatetimeIndex,
    event_timing_mode: str,
) -> pd.DataFrame:
    ev = events.copy()
    idx = pd.DatetimeIndex(trading_index).normalize().unique().sort_values()
    ev["filing_session"] = ev["AcceptanceDateTime"].apply(_classify_filing_session)
    ev["available_date"] = [
        _available_trading_date(
            filing_date=row.Date,
            acceptance_dt=(row.AcceptanceDateTime if hasattr(row, "AcceptanceDateTime") else pd.NaT),
            trading_index=idx,
            event_timing_mode=str(event_timing_mode),
        )
        for row in ev.itertuples(index=False)
    ]
    ev = ev.dropna(subset=["available_date"]).copy()
    ev["available_date"] = pd.to_datetime(ev["available_date"], errors="coerce").dt.normalize()
    return ev


def _event_alpha_core(
    px: pd.DataFrame,
    events: pd.DataFrame,
    *,
    benchmark: str,
    top_n: int,
    hold_days: int,
    trade_lag: int,
    gross: float,
    cost_bps: float,
    mom_days: int,
    mom_weight: float,
    fallback_mom_weight: float = 0.0,
    form_weights: Dict[str, float],
    eval_last_days: int = 0,
    target_vol: float = 0.0,
    vol_lookback: int = 20,
    max_gross: float = 2.0,
    cooldown_days: int = 0,
    filer_penalty_lambda: float = 0.0,
    filer_penalty_lookback: int = 63,
    scale_gross_by_event_count: bool = False,
    event_timing_mode: str = "strict_acceptance",
) -> Dict[str, Any]:
    if benchmark not in px.columns:
        return {"error": f"Benchmark {benchmark} missing from price panel"}

    fw = {str(k).upper(): float(v) for k, v in (form_weights or {}).items()}
    ev = _prepare_events_for_trading(events, trading_index=px.index, event_timing_mode=str(event_timing_mode))
    ev["base"] = ev["Form"].map(fw).fillna(0.0)
    ev = ev[ev["base"] != 0.0]
    score = ev.pivot_table(index="available_date", columns="Ticker", values="base", aggfunc="sum").sort_index()

    idx = px.index.intersection(score.index).sort_values()
    if int(eval_last_days) > 0 and len(idx) > int(eval_last_days) + 30:
        idx = idx[-int(eval_last_days) :]

    px = px.reindex(idx).ffill()
    score = score.reindex(idx).fillna(0.0).reindex(columns=px.columns, fill_value=0.0)

    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    lag = int(max(1, trade_lag))
    bench = rets[benchmark].shift(-lag)
    mom = (px / px.shift(int(max(1, mom_days))) - 1.0).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    top_n = int(max(1, top_n))
    hold = int(max(1, hold_days))
    gross = float(max(0.0, gross))
    cost = float(cost_bps) / 10000.0
    fallback_mom_weight = float(max(0.0, fallback_mom_weight))
    target_vol = float(max(0.0, target_vol))
    vol_lookback = int(max(5, vol_lookback))
    max_gross = float(max(0.0, max_gross))
    cooldown_days = int(max(0, cooldown_days))
    filer_penalty_lambda = float(max(0.0, filer_penalty_lambda))
    filer_penalty_lookback = int(max(1, filer_penalty_lookback))
    scale_gross_by_event_count = bool(scale_gross_by_event_count)

    if filer_penalty_lambda > 0:
        filing_flag = (score > 0).astype(float)
        recent_filer_count = (
            filing_flag.rolling(window=filer_penalty_lookback, min_periods=1).sum().shift(1).fillna(0.0)
        )
    else:
        recent_filer_count = None

    event_rows = ev.groupby("available_date")
    last_trade_i: Dict[str, int] = {}
    trade_universe = [c for c in px.columns if str(c) != str(benchmark)]
    active = [pd.Series(0.0, index=px.columns, dtype=float) for _ in range(hold)]
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)

    pnl: list[float] = []
    pnl_dates: list[pd.Timestamp] = []
    signal_history: list[Dict[str, Any]] = []

    for dt in idx:
        base = score.loc[dt].reindex(trade_universe, fill_value=0.0)
        mom_dt = mom.loc[dt, trade_universe].clip(lower=-0.5, upper=0.5)

        ranked_scores = pd.Series(0.0, index=pd.Index(trade_universe), dtype=float)
        if base.sum() > 0 or fallback_mom_weight > 0:
            if fallback_mom_weight > 0:
                ranked_scores = ranked_scores + float(fallback_mom_weight) * mom_dt

            if base.sum() > 0:
                eligible = base[base > 0].index
                sc_ev = base.loc[eligible] * (1.0 + float(mom_weight) * mom.loc[dt, eligible].clip(lower=-0.5, upper=0.5))
                if recent_filer_count is not None:
                    sc_ev = sc_ev - float(filer_penalty_lambda) * recent_filer_count.loc[dt, eligible]
                sc_ev = sc_ev.replace([np.inf, -np.inf], 0.0)
                ranked_scores.loc[eligible] = ranked_scores.loc[eligible] + sc_ev

        ranked_scores = ranked_scores.sort_values(ascending=False)
        ranked = ranked_scores.index.tolist() if float(ranked_scores.abs().sum()) > 0 else []

        if not ranked:
            longs: list[str] = []
            w_new = pd.Series(0.0, index=px.columns, dtype=float)
        else:
            longs = []
            if cooldown_days <= 0:
                longs = ranked[:top_n]
            else:
                i_loc = int(px.index.get_indexer([dt])[0])
                for tkr in ranked:
                    last_i = last_trade_i.get(str(tkr), -10**9)
                    if (i_loc - last_i) >= cooldown_days:
                        longs.append(tkr)
                    if len(longs) >= top_n:
                        break
            w_new = pd.Series(0.0, index=px.columns, dtype=float)
            if longs:
                density_scale = min(1.0, float(len(longs)) / float(top_n)) if scale_gross_by_event_count else 1.0
                w_new.loc[longs] = 1.0 / len(longs)
                w_new = w_new * (gross * density_scale)
                if cooldown_days > 0:
                    i_loc = int(px.index.get_indexer([dt])[0])
                    for tkr in longs:
                        last_trade_i[str(tkr)] = i_loc

        active.pop(0)
        active.append(w_new)
        w = sum(active) / float(hold)

        if target_vol > 0 and max_gross > 0:
            hist = pd.Series(pnl[-max(1, vol_lookback) :], dtype=float)
            if len(hist) >= max(5, vol_lookback // 2):
                est = float(hist.std(ddof=0) * np.sqrt(252.0))
                if est > 0:
                    scale = float(target_vol / est)
                    scale = float(np.clip(scale, 0.0, max_gross))
                    w = w * scale

        event_slice = event_rows.get_group(dt) if dt in event_rows.groups else ev.iloc[0:0]
        signal_history.append(
            {
                "date": pd.Timestamp(dt).normalize(),
                "selected": [str(t) for t in longs],
                "weights": w.copy(),
                "raw_signal_weights": w_new.copy(),
                "score_snapshot": ranked_scores.head(max(top_n, 10)).copy(),
                "event_count": int(event_slice["Ticker"].astype(str).nunique()) if not event_slice.empty else 0,
                "forms": {str(k): int(v) for k, v in event_slice["Form"].value_counts().to_dict().items()} if not event_slice.empty else {},
            }
        )

        i_loc = int(idx.get_indexer([dt])[0])
        if (i_loc + lag) >= len(idx):
            w_prev = w
            continue
        turn = float((w - w_prev).abs().sum())
        tc = cost * turn
        r_next = rets.shift(-lag).loc[dt]
        r = float((w * r_next).sum()) - float(tc)
        pnl.append(r)
        pnl_dates.append(pd.Timestamp(dt).normalize())
        w_prev = w

    return {
        "pnl": pd.Series(pnl, index=pd.DatetimeIndex(pnl_dates), name="pnl").fillna(0.0),
        "benchmark_pnl": bench.reindex(pd.DatetimeIndex(pnl_dates)).fillna(0.0),
        "signal_history": signal_history,
        "event_timing": {
            "mode": str(event_timing_mode),
            "events_total": int(len(events)),
            "events_tradeable": int(len(ev)),
            "with_acceptance_time": int(events["AcceptanceDateTime"].notna().sum()) if "AcceptanceDateTime" in events.columns else 0,
            "without_acceptance_time": int(events["AcceptanceDateTime"].isna().sum()) if "AcceptanceDateTime" in events.columns else int(len(events)),
            "session_counts": {str(k): int(v) for k, v in ev["filing_session"].value_counts().to_dict().items()},
        },
    }


def run_event_alpha(
    px: pd.DataFrame,
    events: pd.DataFrame,
    *,
    benchmark: str,
    top_n: int,
    hold_days: int,
    trade_lag: int,
    gross: float,
    cost_bps: float,
    mom_days: int,
    mom_weight: float,
    fallback_mom_weight: float = 0.0,
    form_weights: Dict[str, float],
    eval_last_days: int = 0,
    target_vol: float = 0.0,
    vol_lookback: int = 20,
    max_gross: float = 2.0,
    cooldown_days: int = 0,
    filer_penalty_lambda: float = 0.0,
    filer_penalty_lookback: int = 63,
    scale_gross_by_event_count: bool = False,
    event_timing_mode: str = "strict_acceptance",
) -> Dict[str, Any]:
    core = _event_alpha_core(
        px,
        events,
        benchmark=benchmark,
        top_n=top_n,
        hold_days=hold_days,
        trade_lag=trade_lag,
        gross=gross,
        cost_bps=cost_bps,
        mom_days=mom_days,
        mom_weight=mom_weight,
        fallback_mom_weight=fallback_mom_weight,
        form_weights=form_weights,
        eval_last_days=eval_last_days,
        target_vol=target_vol,
        vol_lookback=vol_lookback,
        max_gross=max_gross,
        cooldown_days=cooldown_days,
        filer_penalty_lambda=filer_penalty_lambda,
        filer_penalty_lookback=filer_penalty_lookback,
        scale_gross_by_event_count=scale_gross_by_event_count,
        event_timing_mode=event_timing_mode,
    )
    if "error" in core:
        return core

    strat = core["pnl"]
    bench = core["benchmark_pnl"]
    eq = (1.0 + strat).cumprod()
    beq = (1.0 + bench).cumprod()
    excess_final = float(eq.iloc[-1] / beq.iloc[-1] - 1.0) if len(eq) else 0.0
    out = {
        "pnl": strat,
        "benchmark_pnl": bench,
        "equity": eq,
        "benchmark_equity": beq,
        "strategy_perf": asdict(_perf(strat)),
        "benchmark_perf": asdict(_perf(bench)),
        "active": {"excess_final": excess_final, "active_sharpe": asdict(_perf(strat - bench))["sharpe"]},
        "rolling_21d_vs_spy": rolling_relative_stats(strat, bench, window=21, thresholds=[0.0, 0.02, 0.05, 0.10]),
        "event_timing": core["event_timing"],
    }
    return out


def build_latest_signal(
    px: pd.DataFrame,
    events: pd.DataFrame,
    *,
    benchmark: str,
    top_n: int,
    hold_days: int,
    trade_lag: int,
    gross: float,
    cost_bps: float,
    mom_days: int,
    mom_weight: float,
    fallback_mom_weight: float = 0.0,
    form_weights: Dict[str, float],
    eval_last_days: int = 0,
    target_vol: float = 0.0,
    vol_lookback: int = 20,
    max_gross: float = 2.0,
    cooldown_days: int = 0,
    filer_penalty_lambda: float = 0.0,
    filer_penalty_lookback: int = 63,
    scale_gross_by_event_count: bool = False,
    event_timing_mode: str = "strict_acceptance",
    cash_symbol: str = "BIL",
    execution_max_gross: float = 1.0,
    strategy_name: str = "sec_event_strict",
) -> Dict[str, Any]:
    core = _event_alpha_core(
        px,
        events,
        benchmark=benchmark,
        top_n=top_n,
        hold_days=hold_days,
        trade_lag=trade_lag,
        gross=gross,
        cost_bps=cost_bps,
        mom_days=mom_days,
        mom_weight=mom_weight,
        fallback_mom_weight=fallback_mom_weight,
        form_weights=form_weights,
        eval_last_days=eval_last_days,
        target_vol=target_vol,
        vol_lookback=vol_lookback,
        max_gross=max_gross,
        cooldown_days=cooldown_days,
        filer_penalty_lambda=filer_penalty_lambda,
        filer_penalty_lookback=filer_penalty_lookback,
        scale_gross_by_event_count=scale_gross_by_event_count,
        event_timing_mode=event_timing_mode,
    )
    if "error" in core:
        return core
    if not core["signal_history"]:
        return {"error": "No tradeable SEC events aligned to the price panel."}

    latest = core["signal_history"][-1]
    weights = latest["weights"].copy()
    weights = weights[weights.abs() > 1e-12]
    weights = weights.drop(labels=[benchmark], errors="ignore")
    long_sum = float(weights[weights > 0.0].sum()) if not weights.empty else 0.0
    scale = 1.0
    if execution_max_gross > 0 and long_sum > float(execution_max_gross):
        scale = float(execution_max_gross) / float(long_sum)
        weights = weights * scale
        long_sum = float(weights[weights > 0.0].sum()) if not weights.empty else 0.0

    out_weights = {str(sym): float(w) for sym, w in weights.items() if abs(float(w)) > 1e-12}
    cash_weight = max(0.0, 1.0 - long_sum)
    if cash_weight > 1e-12:
        out_weights[str(cash_symbol)] = float(cash_weight)
    if not out_weights:
        out_weights[str(cash_symbol)] = 1.0

    ranked = latest["score_snapshot"]
    return {
        "as_of": str(pd.Timestamp(latest["date"]).date()),
        "as_of_month": str(pd.Timestamp(latest["date"]).date()),
        "regime": "risk_on" if float(long_sum) > 0 else "cash",
        "strategy": str(strategy_name),
        "weights": out_weights,
        "diagnostics": {
            "benchmark": str(benchmark),
            "cash_symbol": str(cash_symbol),
            "execution_max_gross": float(execution_max_gross),
            "execution_scale": float(scale),
            "raw_portfolio_gross": float(latest["weights"][latest["weights"] > 0.0].sum()),
            "selected": list(latest["selected"]),
            "event_count": int(latest["event_count"]),
            "forms": dict(latest["forms"]),
            "top_scores": {str(k): float(v) for k, v in ranked.items() if float(v) > 0.0},
            "event_timing": core["event_timing"],
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="SEC filing event alpha backtest vs SPY.")
    ap.add_argument("--prices", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True, help="CSV: Date,Ticker,Form")
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/sec_event_alpha/run1"))
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--hold-days", type=int, default=5)
    ap.add_argument("--trade-lag", type=int, default=1, help="Enter lag in bars after event day (>=1 avoids same-day lookahead).")
    ap.add_argument("--gross", type=float, default=1.0)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--target-vol", type=float, default=0.0, help="If >0, scale exposure to target annual vol.")
    ap.add_argument("--vol-lookback", type=int, default=20)
    ap.add_argument("--max-gross", type=float, default=2.0)
    ap.add_argument("--cooldown-days", type=int, default=0, help="Do not re-enter same ticker within N days.")
    ap.add_argument(
        "--filer-penalty-lambda",
        type=float,
        default=0.0,
        help="If >0, subtract lambda * (recent filing count) from per-event scores.",
    )
    ap.add_argument(
        "--filer-penalty-lookback",
        type=int,
        default=63,
        help="Lookback window (trading days) for recent filing count penalty.",
    )
    ap.add_argument(
        "--scale-gross-by-event-count",
        action="store_true",
        help="Scale gross exposure by (event count / top_n); unallocated weight stays in cash.",
    )
    ap.add_argument("--mom-days", type=int, default=5, help="Pre-event momentum tilt.")
    ap.add_argument("--mom-weight", type=float, default=1.0)
    ap.add_argument(
        "--fallback-mom-weight",
        type=float,
        default=0.0,
        help="If >0, use momentum ranking on non-event days (and add as a baseline score on event days).",
    )
    ap.add_argument("--form-weight-8k", type=float, default=1.0)
    ap.add_argument("--form-weight-10q", type=float, default=0.5)
    ap.add_argument("--form-weight-10k", type=float, default=0.25)
    ap.add_argument("--eval-last-days", type=int, default=0)
    ap.add_argument(
        "--event-timing-mode",
        choices=["strict_acceptance", "legacy_date"],
        default="strict_acceptance",
        help="strict_acceptance uses acceptance timestamps conservatively; legacy_date uses filing date only.",
    )
    args = ap.parse_args()

    px = load_prices(args.prices)
    if args.benchmark not in px.columns:
        print(f"Benchmark {args.benchmark} missing from price panel")
        return 2

    ev = load_events(args.events)

    # Map form weights.
    fw = {"8-K": float(args.form_weight_8k), "10-Q": float(args.form_weight_10q), "10-K": float(args.form_weight_10k)}
    res = run_event_alpha(
        px,
        ev,
        benchmark=str(args.benchmark),
        top_n=int(args.top_n),
        hold_days=int(args.hold_days),
        trade_lag=int(args.trade_lag),
        gross=float(args.gross),
        cost_bps=float(args.cost_bps),
        mom_days=int(args.mom_days),
        mom_weight=float(args.mom_weight),
        fallback_mom_weight=float(args.fallback_mom_weight),
        form_weights=fw,
        eval_last_days=int(args.eval_last_days),
        target_vol=float(args.target_vol),
        vol_lookback=int(args.vol_lookback),
        max_gross=float(args.max_gross),
        cooldown_days=int(args.cooldown_days),
        filer_penalty_lambda=float(args.filer_penalty_lambda),
        filer_penalty_lookback=int(args.filer_penalty_lookback),
        scale_gross_by_event_count=bool(args.scale_gross_by_event_count),
        event_timing_mode=str(args.event_timing_mode),
    )
    if "error" in res:
        print(res["error"])
        return 2

    out = {
        "strategy": res["strategy_perf"],
        "benchmark": res["benchmark_perf"],
        "active": res["active"],
        "rolling_21d_vs_spy": res["rolling_21d_vs_spy"],
        "params": {
            "top_n": args.top_n,
            "hold_days": args.hold_days,
            "trade_lag": args.trade_lag,
            "gross": args.gross,
            "cost_bps": args.cost_bps,
            "target_vol": args.target_vol,
            "vol_lookback": args.vol_lookback,
            "max_gross": args.max_gross,
            "cooldown_days": args.cooldown_days,
            "filer_penalty_lambda": args.filer_penalty_lambda,
            "filer_penalty_lookback": args.filer_penalty_lookback,
            "scale_gross_by_event_count": bool(args.scale_gross_by_event_count),
            "mom_days": args.mom_days,
            "mom_weight": args.mom_weight,
            "fallback_mom_weight": args.fallback_mom_weight,
            "form_weights": fw,
            "eval_last_days": args.eval_last_days,
            "event_timing_mode": str(args.event_timing_mode),
        },
        "event_timing": res.get("event_timing", {}),
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(out, indent=2) + "\n")
    (args.out_dir / "equity.csv").write_text(res["equity"].to_csv())
    (args.out_dir / "benchmark_equity.csv").write_text(res["benchmark_equity"].to_csv())
    (args.out_dir / "pnl.csv").write_text(res["pnl"].to_csv())
    (args.out_dir / "benchmark_pnl.csv").write_text(res["benchmark_pnl"].to_csv())
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
