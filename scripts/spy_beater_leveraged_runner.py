#!/usr/bin/env python3
"""
Leveraged-ETF tactical engine (offline once panel exists).

Goal:
  Target SPY-like "safety" (controlled volatility/drawdowns) while attempting
  higher return via conditional exposure to leveraged equity ETFs.

This is a research/backtest harness, not execution code or investment advice.
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
    n_days: int
    cagr: float
    sharpe: float
    max_drawdown: float
    annual_vol: float
    final_equity: float


def info_ratio(active: pd.Series, *, ann_factor: float) -> float:
    active = active.fillna(0.0)
    if len(active) < 3:
        return 0.0
    ann = float(active.mean() * ann_factor)
    vol = float(active.std(ddof=0) * np.sqrt(ann_factor))
    return float(ann / vol) if vol > 0 else 0.0


def load_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Panel must have columns: {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = (
        df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last")
        .sort_index()
        .astype(float)
    )
    return px


def _to_returns(price: pd.Series) -> pd.Series:
    return price.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)


def _max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    dd = equity / equity.cummax() - 1.0
    return float(dd.min())


def perf(pnl_d: pd.Series, *, ann_factor: float) -> Perf:
    pnl_d = pnl_d.fillna(0.0)
    eq = (1.0 + pnl_d).cumprod()
    n = len(pnl_d)
    vol = float(pnl_d.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((pnl_d.mean() * 252.0) / vol) if vol > 0 else 0.0
    sharpe = float((pnl_d.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / n) - 1.0) if n > 1 else 0.0
    return Perf(
        start=str(eq.index.min().date()) if not eq.empty else "",
        end=str(eq.index.max().date()) if not eq.empty else "",
        n_days=int(n),
        cagr=cagr,
        sharpe=sharpe,
        max_drawdown=_max_drawdown(eq),
        annual_vol=vol,
        final_equity=float(eq.iloc[-1]) if not eq.empty else 1.0,
    )


def _rolling_vol(ret: pd.Series, lookback: int, *, ann_factor: float) -> pd.Series:
    return ret.rolling(lookback, min_periods=max(10, lookback // 2)).std(ddof=0) * np.sqrt(ann_factor)


def _trend_filter(price: pd.Series, sma_days: int) -> pd.Series:
    sma = price.rolling(sma_days, min_periods=max(50, sma_days // 2)).mean()
    return (price > sma).fillna(False)


def _momentum_score(price: pd.Series, lookback: int) -> pd.Series:
    return (price / price.shift(lookback) - 1.0).replace([np.inf, -np.inf], np.nan).fillna(0.0)


def run_engine(
    prices: pd.DataFrame,
    *,
    benchmark: str,
    risky: List[str],
    defensive: List[str],
    inverse: List[str],
    bear_mode: str,
    top_k_risky: int,
    top_k_defensive: int,
    rebalance_every: int,
    cash: str,
    core_weight: float,
    core_to_cash_when_bear: bool,
    ann_factor: float,
    sma_days: int,
    mom_days: int,
    mom_floor: float,
    require_asset_trend: bool,
    allocate_residual_to_cash: bool,
    # Risk-off regime filter (bench-based)
    risk_off_vol_lookback: int,
    risk_off_vol_max: float,
    risk_off_crash_days: int,
    risk_off_crash_ret: float,
    risk_off_cooldown_days: int,
    # CPPI-style floor (portfolio-based)
    cppi_floor_frac: float,
    cppi_multiplier: float,
    # Crypto gating (BTC-based)
    crypto_gate: bool,
    crypto_trend_sma_days: int,
    crypto_vol_lookback: int,
    crypto_vol_max: float,
    vol_lookback: int,
    target_vol: float,
    max_gross: float,
    dd_stop: float,
    dd_floor_gross: float,
    port_dd_stop: float,
    port_dd_cooldown_days: int,
    rebalance_threshold: float,
    cost_bps: float,
) -> Dict[str, Any]:
    prices = prices.sort_index()
    # If the panel includes assets with non-equity calendars (e.g. crypto weekends),
    # align the backtest calendar to the benchmark's available dates to avoid
    # artificial 0-return weekend bars.
    if benchmark in prices.columns:
        bm = prices[benchmark]
        prices = prices.loc[bm.dropna().index]
    prices = prices.ffill()
    tickers = sorted(set([benchmark, *risky, *defensive, *inverse, cash]))
    tickers = [t for t in tickers if t in prices.columns]
    if benchmark not in tickers:
        return {"error": f"Benchmark {benchmark} missing from panel"}
    if cash not in tickers:
        # If BIL missing, treat cash as 0% return.
        cash = ""

    px = prices[tickers].copy()
    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    bench_px = px[benchmark]
    bull = _trend_filter(bench_px, sma_days=sma_days)
    require_asset_trend = bool(require_asset_trend)
    allocate_residual_to_cash = bool(allocate_residual_to_cash)
    if require_asset_trend:
        asset_trend = {t: _trend_filter(px[t], sma_days=sma_days) for t in tickers if t != ""}
    else:
        asset_trend = {}

    # Drawdown throttle on benchmark to approximate "safety": when SPY is in deep drawdown, cut gross.
    bench_eq = (1.0 + rets[benchmark]).cumprod()
    bench_dd = (bench_eq / bench_eq.cummax() - 1.0).fillna(0.0)

    mom = {t: _momentum_score(px[t], lookback=mom_days) for t in tickers if t != ""}
    mom_floor = float(mom_floor)
    port_dd_stop = float(max(0.0, port_dd_stop))
    port_dd_cooldown_days = int(max(0, port_dd_cooldown_days))
    risk_off_vol_lookback = int(max(5, risk_off_vol_lookback))
    risk_off_vol_max = float(max(0.0, risk_off_vol_max))
    risk_off_crash_days = int(max(1, risk_off_crash_days))
    risk_off_crash_ret = float(risk_off_crash_ret)
    risk_off_cooldown_days = int(max(0, risk_off_cooldown_days))
    cppi_floor_frac = float(max(0.0, min(1.0, cppi_floor_frac)))
    cppi_multiplier = float(max(0.0, cppi_multiplier))
    crypto_gate = bool(crypto_gate)
    crypto_trend_sma_days = int(max(10, crypto_trend_sma_days))
    crypto_vol_lookback = int(max(5, crypto_vol_lookback))
    crypto_vol_max = float(max(0.0, crypto_vol_max))

    # Daily portfolio weights decided at t close, applied to t+1 return.
    w_prev = pd.Series(0.0, index=tickers, dtype=float)
    weights_hist: List[Tuple[pd.Timestamp, pd.Series]] = []
    meta_hist: List[Tuple[pd.Timestamp, Dict[str, Any]]] = []
    pnl = []
    bench_pnl = []
    dates = []
    cooldown_left = 0
    regime_cooldown_left = 0
    eq = 1.0
    peak = 1.0

    rebalance_every = int(max(1, rebalance_every))
    top_k_risky = int(max(1, top_k_risky))
    top_k_defensive = int(max(1, top_k_defensive))
    bear_mode = str(bear_mode).strip().lower()
    if bear_mode not in {"defensive", "inverse", "best"}:
        bear_mode = "defensive"

    all_dates = list(px.index[:-1])
    for i, dt in enumerate(all_dates):
        # Decide regime.
        in_bull = bool(bull.loc[dt])
        dd = float(bench_dd.loc[dt])
        # Risk-off regime filter based on benchmark realized vol + crash drawdown.
        risk_off = False
        crash_ret = 0.0
        est_bench_vol = 0.0
        if risk_off_vol_max > 0:
            hist = rets[benchmark].iloc[max(0, i - risk_off_vol_lookback + 1) : i + 1]
            if len(hist) >= max(5, risk_off_vol_lookback // 2):
                est_bench_vol = float(hist.std(ddof=0) * np.sqrt(ann_factor))
                if est_bench_vol >= risk_off_vol_max:
                    risk_off = True
        if risk_off_crash_ret < 0:
            if i - risk_off_crash_days >= 0:
                crash_ret = float((bench_px.iloc[i] / bench_px.iloc[i - risk_off_crash_days]) - 1.0)
            if crash_ret <= float(risk_off_crash_ret):
                risk_off = True
        if risk_off and risk_off_cooldown_days > 0:
            regime_cooldown_left = max(regime_cooldown_left, int(risk_off_cooldown_days))
        if regime_cooldown_left > 0:
            risk_off = True

        # Base gross based on target vol, but gated by drawdown stop.
        gross = float(max_gross)
        if dd_stop > 0 and dd <= -abs(dd_stop):
            gross = float(dd_floor_gross)

        # Portfolio drawdown stop (based only on realized PnL to date).
        port_dd = 0.0
        if eq > 0:
            peak = max(peak, eq)
            port_dd = float(eq / peak - 1.0)
        if port_dd_stop > 0 and port_dd <= -abs(port_dd_stop):
            cooldown_left = max(cooldown_left, int(port_dd_cooldown_days))
        if cooldown_left > 0:
            in_bull = False
            gross = 0.0
        if risk_off:
            in_bull = False
            gross = 0.0

        # CPPI-like floor scaling: limit gross exposure as equity approaches a floor.
        cppi_gross_cap = float(max_gross)
        cppi_floor = float(cppi_floor_frac * peak)
        cppi_cushion = float(max(0.0, eq - cppi_floor) / max(1e-9, eq))
        if cppi_floor_frac > 0 and cppi_multiplier > 0:
            cppi_gross_cap = float(np.clip(cppi_multiplier * cppi_cushion, 0.0, max_gross))
            gross = float(min(gross, cppi_gross_cap))

        # Select basket.
        basket: List[str]
        if in_bull and risky:
            # Pick top-k momentum among risky set.
            # Optional crypto gate: only allow crypto if BTC is trending and below vol cap.
            crypto_ok = True
            if crypto_gate:
                crypto_ok = True
                if "BTC-USD" in px.columns:
                    btc_trend = bool(_trend_filter(px["BTC-USD"], sma_days=crypto_trend_sma_days).loc[dt])
                    btc_hist = rets["BTC-USD"].iloc[max(0, i - crypto_vol_lookback + 1) : i + 1]
                    btc_vol = float(btc_hist.std(ddof=0) * np.sqrt(ann_factor)) if len(btc_hist) >= 5 else 0.0
                    if (not btc_trend) or (crypto_vol_max > 0 and btc_vol >= crypto_vol_max):
                        crypto_ok = False
                else:
                    crypto_ok = False

            scores = {
                t: float(mom[t].loc[dt])
                for t in risky
                if t in px.columns
                and float(mom[t].loc[dt]) >= mom_floor
                and (not require_asset_trend or bool(asset_trend[t].loc[dt]))
                and (crypto_ok or not str(t).endswith("-USD"))
            }
            if scores:
                ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
                basket = [t for t, _ in ranked[:top_k_risky]]
            else:
                basket = [cash] if cash else []
        else:
            # Bear: choose between defensive and/or inverse depending on mode.
            def_scores = {
                t: float(mom[t].loc[dt])
                for t in defensive
                if t in px.columns
                and float(mom[t].loc[dt]) >= mom_floor
                and (not require_asset_trend or bool(asset_trend[t].loc[dt]))
            }
            inv_scores = {
                t: float(mom[t].loc[dt])
                for t in inverse
                if t in px.columns
                and float(mom[t].loc[dt]) >= mom_floor
                and (not require_asset_trend or bool(asset_trend[t].loc[dt]))
            }

            if bear_mode == "inverse":
                src = inv_scores
                k = top_k_defensive
            elif bear_mode == "best":
                src = {**def_scores, **inv_scores}
                k = top_k_defensive
            else:
                src = def_scores
                k = top_k_defensive

            if src:
                ranked = sorted(src.items(), key=lambda kv: kv[1], reverse=True)
                basket = [t for t, _ in ranked[:k]]
            else:
                basket = [cash] if cash else []

        # Optional cadence: only change weights every N bars; otherwise keep previous weights.
        do_rebalance = (i % rebalance_every) == 0
        if do_rebalance:
            core_weight_clamped = float(np.clip(core_weight, 0.0, 1.0))
            overlay_weight = float(1.0 - core_weight_clamped)

            w = pd.Series(0.0, index=tickers, dtype=float)
            if core_weight_clamped > 0:
                if in_bull or not core_to_cash_when_bear:
                    w.loc[benchmark] += core_weight_clamped
                elif cash:
                    w.loc[cash] += core_weight_clamped

            if basket and overlay_weight > 0:
                w.loc[basket] += overlay_weight * (1.0 / len(basket))
        else:
            w = w_prev.copy()
            core_weight_clamped = float(np.clip(core_weight, 0.0, 1.0))

        # Vol targeting on the chosen basket return stream.
        port_ret_hist = (w_prev.reindex(tickers).fillna(0.0) * rets[tickers]).sum(axis=1)
        vol = (
            float(_rolling_vol(port_ret_hist, lookback=vol_lookback, ann_factor=ann_factor).loc[dt])
            if dt in port_ret_hist.index
            else 0.0
        )
        if target_vol > 0 and vol > 0:
            gross = min(gross, float(target_vol / vol))
        gross = float(np.clip(gross, 0.0, max_gross))

        if do_rebalance:
            # Apply leverage/vol scaling to the overlay only; keep the core unlevered.
            if core_weight_clamped > 0:
                w_core = pd.Series(0.0, index=tickers, dtype=float)
                if in_bull or not core_to_cash_when_bear:
                    w_core.loc[benchmark] = core_weight_clamped
                elif cash:
                    w_core.loc[cash] = core_weight_clamped
                w_overlay = (w - w_core).clip(lower=0.0)
                w = w_core + (w_overlay * gross)
            else:
                w = w * gross
            if allocate_residual_to_cash and cash:
                resid = float(1.0 - w.sum())
                if resid > 0:
                    w.loc[cash] += resid

        # Reduce churn: only rebalance if weights changed enough.
        turn = float((w - w_prev).abs().sum())
        if rebalance_threshold > 0 and turn < rebalance_threshold:
            w = w_prev
            turn = 0.0

        tc = float((cost_bps / 10000.0) * turn) if cost_bps > 0 else 0.0

        r_next = rets.shift(-1).loc[dt].reindex(tickers).fillna(0.0)
        r = float((w * r_next).sum()) - tc
        b = float(rets.shift(-1).loc[dt, benchmark])

        pnl.append(r)
        bench_pnl.append(b)
        dates.append(dt)
        if cooldown_left > 0:
            cooldown_left -= 1
        if regime_cooldown_left > 0:
            regime_cooldown_left -= 1
        eq = float(eq * (1.0 + r))
        weights_hist.append((dt, w.copy()))
        meta_hist.append(
            (
                dt,
                {
                    "in_bull": in_bull,
                    "benchmark_drawdown": dd,
                    "portfolio_drawdown": float(port_dd),
                    "cooldown_left": int(cooldown_left),
                    "risk_off": bool(risk_off),
                    "risk_off_cooldown_left": int(regime_cooldown_left),
                    "bench_realized_vol": float(est_bench_vol),
                    "bench_crash_ret": float(crash_ret),
                    "cppe_eq": float(eq),
                    "cppe_peak": float(peak),
                    "cppe_floor": float(cppi_floor),
                    "cppe_cushion": float(cppi_cushion),
                    "cppe_gross_cap": float(cppi_gross_cap),
                    "selected": basket,
                    "gross": float(gross),
                    "do_rebalance": bool(do_rebalance),
                    "turnover": float(turn),
                    "cost_paid": float(tc),
                    "est_annual_vol": float(vol),
                },
            )
        )
        w_prev = w

    pnl_s = pd.Series(pnl, index=pd.DatetimeIndex(dates), name="pnl")
    bench_pnl_s = pd.Series(bench_pnl, index=pd.DatetimeIndex(dates), name="benchmark_pnl")
    eq = (1.0 + pnl_s.fillna(0.0)).cumprod()
    bench_eq = (1.0 + bench_pnl_s.fillna(0.0)).cumprod()
    active = pnl_s - bench_pnl_s
    n_days = int(len(pnl_s))
    excess_final = float(eq.iloc[-1] / bench_eq.iloc[-1] - 1.0) if n_days else 0.0
    excess_cagr = (
        float((eq.iloc[-1] / bench_eq.iloc[-1]) ** (ann_factor / n_days) - 1.0) if n_days > 1 else 0.0
    )

    return {
        "pnl": pnl_s,
        "benchmark_pnl": bench_pnl_s,
        "equity": eq,
        "benchmark_equity": bench_eq,
        "active": active,
        "weights": weights_hist,
        "meta": meta_hist,
        "perf": asdict(perf(pnl_s, ann_factor=ann_factor)),
        "benchmark_perf": asdict(perf(bench_pnl_s, ann_factor=ann_factor)),
        "active_perf": {
            "information_ratio": info_ratio(active, ann_factor=ann_factor),
            "active_ann_mean": float(active.mean() * ann_factor) if len(active) else 0.0,
            "active_ann_vol": float(active.std(ddof=0) * np.sqrt(ann_factor)) if len(active) else 0.0,
            "excess_final": excess_final,
            "excess_cagr": excess_cagr,
        },
        "benchmark": benchmark,
    }


def _last_year_slice(index: pd.DatetimeIndex) -> Tuple[pd.Timestamp, pd.Timestamp]:
    idx = pd.DatetimeIndex(index).sort_values()
    if idx.empty:
        raise ValueError("Empty index")
    end = idx.max()
    start = end - pd.Timedelta(days=365)
    start = idx[idx >= start].min()
    return start, end


def main() -> int:
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--config-json", type=Path, default=None)
    known, _ = pre.parse_known_args()

    p = argparse.ArgumentParser(description="Leveraged ETF tactical engine runner.", parents=[pre])
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater"))
    p.add_argument("--benchmark", type=str, default="SPY")
    p.add_argument("--risky", nargs="+", default=["UPRO", "TQQQ"])
    p.add_argument("--defensive", nargs="+", default=["TLT", "IEF", "GLD"])
    p.add_argument("--inverse", nargs="+", default=["SH", "PSQ"])
    p.add_argument("--bear-mode", type=str, default="defensive", choices=["defensive", "inverse", "best"])
    p.add_argument("--top-k-risky", type=int, default=1)
    p.add_argument("--top-k-defensive", type=int, default=1)
    p.add_argument("--rebalance-every", type=int, default=1, help="Only change weights every N bars.")
    p.add_argument("--cash", type=str, default="BIL")
    p.add_argument("--core-weight", type=float, default=0.0, help="Unlevered core weight in benchmark (0..1).")
    p.add_argument(
        "--core-to-cash-when-bear",
        action="store_true",
        help="If set, move the unlevered core from benchmark to cash when trend filter is off.",
    )

    p.add_argument("--sma-days", type=int, default=200)
    p.add_argument("--mom-days", type=int, default=63)  # ~3 months
    p.add_argument(
        "--mom-floor",
        type=float,
        default=-1e9,
        help="Only consider assets with momentum >= floor (0 enforces absolute momentum).",
    )
    p.add_argument("--vol-lookback", type=int, default=20)
    p.add_argument("--target-vol", type=float, default=0.18)
    p.add_argument("--max-gross", type=float, default=1.0)
    p.add_argument("--dd-stop", type=float, default=0.15)
    p.add_argument("--dd-floor-gross", type=float, default=0.0)
    p.add_argument("--port-dd-stop", type=float, default=0.0, help="If >0, go to cash when portfolio drawdown exceeds this.")
    p.add_argument("--port-dd-cooldown-days", type=int, default=21, help="Cooldown days after portfolio DD stop triggers.")
    p.add_argument("--require-asset-trend", action="store_true", help="Only select assets that are above their own SMA.")
    p.add_argument("--allocate-residual-to-cash", action="store_true", help="Allocate uninvested residual weight to cash proxy.")
    p.add_argument("--risk-off-vol-lookback", type=int, default=20)
    p.add_argument("--risk-off-vol-max", type=float, default=0.0, help="If >0, go risk-off when benchmark realized vol exceeds this.")
    p.add_argument("--risk-off-crash-days", type=int, default=5)
    p.add_argument("--risk-off-crash-ret", type=float, default=0.0, help="If <0, go risk-off when benchmark return over N days <= this.")
    p.add_argument("--risk-off-cooldown-days", type=int, default=21)
    p.add_argument("--cppi-floor-frac", type=float, default=0.0, help="If >0, apply CPPI floor as a fraction of peak equity (e.g. 0.9).")
    p.add_argument("--cppi-multiplier", type=float, default=0.0, help="CPPI multiplier m (e.g. 3..6).")
    p.add_argument("--crypto-gate", action="store_true", help="Gate crypto exposure using BTC trend + vol cap.")
    p.add_argument("--crypto-trend-sma-days", type=int, default=200)
    p.add_argument("--crypto-vol-lookback", type=int, default=20)
    p.add_argument("--crypto-vol-max", type=float, default=0.0, help="If >0, ban crypto when BTC realized vol exceeds this.")
    p.add_argument("--rebalance-threshold", type=float, default=0.10)
    p.add_argument("--cost-bps", type=float, default=2.0)
    p.add_argument(
        "--ann-factor",
        type=float,
        default=252.0,
        help="Annualization factor (252 for daily; ~252*78 for 5m bars).",
    )

    p.add_argument("--eval-last-year", action="store_true", help="Report metrics on last 365d only.")

    if known.config_json is not None:
        cfg = json.loads(known.config_json.read_text())
        # Only set defaults for known keys to keep argparse strict.
        allowed = {
            "benchmark",
            "risky",
            "defensive",
            "inverse",
            "bear_mode",
            "top_k_risky",
            "top_k_defensive",
            "rebalance_every",
            "cash",
            "core_weight",
            "core_to_cash_when_bear",
            "sma_days",
            "mom_days",
            "mom_floor",
            "require_asset_trend",
            "allocate_residual_to_cash",
            "risk_off_vol_lookback",
            "risk_off_vol_max",
            "risk_off_crash_days",
            "risk_off_crash_ret",
            "risk_off_cooldown_days",
            "cppi_floor_frac",
            "cppi_multiplier",
            "crypto_gate",
            "crypto_trend_sma_days",
            "crypto_vol_lookback",
            "crypto_vol_max",
            "vol_lookback",
            "target_vol",
            "max_gross",
            "dd_stop",
            "dd_floor_gross",
            "port_dd_stop",
            "port_dd_cooldown_days",
            "rebalance_threshold",
            "cost_bps",
            "ann_factor",
        }
        defaults = {k: v for k, v in cfg.items() if k in allowed}
        p.set_defaults(**defaults)

    args = p.parse_args()

    prices = load_prices(args.panel)
    if args.eval_last_year:
        s, e = _last_year_slice(prices.index)
        prices = prices[(prices.index >= s) & (prices.index <= e)]

    res = run_engine(
        prices,
        benchmark=str(args.benchmark),
        risky=list(args.risky),
        defensive=list(args.defensive),
        inverse=list(args.inverse),
        bear_mode=str(args.bear_mode),
        top_k_risky=int(args.top_k_risky),
        top_k_defensive=int(args.top_k_defensive),
        rebalance_every=int(args.rebalance_every),
        cash=str(args.cash),
        core_weight=float(args.core_weight),
        core_to_cash_when_bear=bool(args.core_to_cash_when_bear),
        ann_factor=float(args.ann_factor),
        sma_days=int(args.sma_days),
        mom_days=int(args.mom_days),
        mom_floor=float(args.mom_floor),
        require_asset_trend=bool(args.require_asset_trend),
        allocate_residual_to_cash=bool(args.allocate_residual_to_cash),
        risk_off_vol_lookback=int(args.risk_off_vol_lookback),
        risk_off_vol_max=float(args.risk_off_vol_max),
        risk_off_crash_days=int(args.risk_off_crash_days),
        risk_off_crash_ret=float(args.risk_off_crash_ret),
        risk_off_cooldown_days=int(args.risk_off_cooldown_days),
        cppi_floor_frac=float(args.cppi_floor_frac),
        cppi_multiplier=float(args.cppi_multiplier),
        crypto_gate=bool(args.crypto_gate),
        crypto_trend_sma_days=int(args.crypto_trend_sma_days),
        crypto_vol_lookback=int(args.crypto_vol_lookback),
        crypto_vol_max=float(args.crypto_vol_max),
        vol_lookback=int(args.vol_lookback),
        target_vol=float(args.target_vol),
        max_gross=float(args.max_gross),
        dd_stop=float(args.dd_stop),
        dd_floor_gross=float(args.dd_floor_gross),
        port_dd_stop=float(args.port_dd_stop),
        port_dd_cooldown_days=int(args.port_dd_cooldown_days),
        rebalance_threshold=float(args.rebalance_threshold),
        cost_bps=float(args.cost_bps),
    )
    if "error" in res:
        print(res["error"])
        return 2

    args.out_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "strategy": res["perf"],
        "benchmark": res["benchmark_perf"],
        "active": res["active_perf"],
        "params": {
            "benchmark": args.benchmark,
            "risky": args.risky,
            "defensive": args.defensive,
            "inverse": args.inverse,
            "bear_mode": args.bear_mode,
            "top_k_risky": args.top_k_risky,
            "top_k_defensive": args.top_k_defensive,
            "rebalance_every": args.rebalance_every,
            "cash": args.cash,
            "core_weight": args.core_weight,
            "core_to_cash_when_bear": bool(args.core_to_cash_when_bear),
            "ann_factor": args.ann_factor,
            "sma_days": args.sma_days,
            "mom_days": args.mom_days,
            "mom_floor": args.mom_floor,
            "require_asset_trend": bool(args.require_asset_trend),
            "allocate_residual_to_cash": bool(args.allocate_residual_to_cash),
            "risk_off_vol_lookback": args.risk_off_vol_lookback,
            "risk_off_vol_max": args.risk_off_vol_max,
            "risk_off_crash_days": args.risk_off_crash_days,
            "risk_off_crash_ret": args.risk_off_crash_ret,
            "risk_off_cooldown_days": args.risk_off_cooldown_days,
            "cppi_floor_frac": args.cppi_floor_frac,
            "cppi_multiplier": args.cppi_multiplier,
            "crypto_gate": bool(args.crypto_gate),
            "crypto_trend_sma_days": args.crypto_trend_sma_days,
            "crypto_vol_lookback": args.crypto_vol_lookback,
            "crypto_vol_max": args.crypto_vol_max,
            "vol_lookback": args.vol_lookback,
            "target_vol": args.target_vol,
            "max_gross": args.max_gross,
            "dd_stop": args.dd_stop,
            "dd_floor_gross": args.dd_floor_gross,
            "port_dd_stop": args.port_dd_stop,
            "port_dd_cooldown_days": args.port_dd_cooldown_days,
            "rebalance_threshold": args.rebalance_threshold,
            "cost_bps": args.cost_bps,
        },
    }
    (args.out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (args.out_dir / "equity.csv").write_text(res["equity"].to_csv())
    (args.out_dir / "benchmark_equity.csv").write_text(res["benchmark_equity"].to_csv())
    # Save last weights for inspection.
    if res.get("weights"):
        as_of, w = res["weights"][-1]
        meta = res.get("meta")[-1][1] if res.get("meta") else {}
        sig = {
            "as_of": str(getattr(as_of, "date", lambda: as_of)()),
            "meta": meta,
            "weights": {k: float(v) for k, v in w.items() if float(v) != 0.0},
        }
        (args.out_dir / "signal.json").write_text(json.dumps(sig, indent=2) + "\n")

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
