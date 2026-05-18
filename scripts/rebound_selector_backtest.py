#!/usr/bin/env python3
"""
Rebound Selector Backtest

Goal: a robust "buy-the-dip but not broken" selection system.

This backtest builds a daily feature panel (purely from price/volume), then:
- every N days, selects the top K "rebound candidates" using only information up to the rebalance date
- applies an execution lag (default 1 day) to reduce lookahead bias
- holds weights constant until the next rebalance
- reports performance vs benchmark and a random-picks null

Outputs:
- equity_curve.csv
- picks.csv (per rebalance date)
- report.md + summary.json
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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


def _wide(panel: pd.DataFrame, value_col: str) -> pd.DataFrame:
    wide = (
        panel.pivot_table(index="Date", columns="Instrument", values=value_col, aggfunc="last")
        .sort_index()
        .dropna(axis=0, how="all")
    )
    return wide


def _max_drawdown(equity: pd.Series) -> float:
    x = equity.astype(float)
    peak = x.cummax()
    dd = x / peak - 1.0
    return float(dd.min())


def _cagr(equity: pd.Series, years: float) -> float:
    if years <= 0:
        return float("nan")
    start = float(equity.iloc[0])
    end = float(equity.iloc[-1])
    if start <= 0:
        return float("nan")
    return float((end / start) ** (1.0 / years) - 1.0)


def _sharpe(daily_ret: pd.Series) -> float:
    r = daily_ret.dropna().astype(float)
    if len(r) < 20:
        return float("nan")
    mu = float(r.mean())
    sd = float(r.std(ddof=1))
    if not np.isfinite(sd) or sd <= 1e-12:
        return float("nan")
    return float((mu / sd) * math.sqrt(252.0))


def _zscore_rolling(df: pd.DataFrame, window: int = 60, minp: int = 30) -> pd.DataFrame:
    mu = df.rolling(window=window, min_periods=minp).mean()
    sd = df.rolling(window=window, min_periods=minp).std(ddof=1).replace(0.0, np.nan)
    return (df - mu) / sd


@dataclass(frozen=True)
class SelectorParams:
    # feature horizons
    sma_days: int = 200
    dd_days: int = 21
    ret_short: int = 5
    ret_med: int = 21
    ret_long: int = 63

    # screen rules
    min_price: float = 5.0
    require_uptrend: bool = True
    min_ret_med: float = -0.05  # "actually down"

    # flow/shock proxies
    event_days: int = 21
    dvz_window: int = 60
    dvz_minp: int = 30
    dvz_spike: float = 2.0

    # scoring weights (heuristic)
    w_flow_only: float = 1.5
    w_dvz: float = 0.75
    w_dd: float = 2.0
    w_ret_med: float = 1.0
    w_ret_long: float = 0.5
    w_shock: float = -0.75


def _spearman_corr(a: pd.Series, b: pd.Series) -> float:
    x = a.astype(float)
    y = b.astype(float)
    ok = x.notna() & y.notna()
    if int(ok.sum()) < 15:
        return float("nan")
    xr = x[ok].rank(pct=True)
    yr = y[ok].rank(pct=True)
    sd_x = float(xr.std(ddof=1))
    sd_y = float(yr.std(ddof=1))
    if sd_x <= 1e-12 or sd_y <= 1e-12 or not np.isfinite(sd_x) or not np.isfinite(sd_y):
        return float("nan")
    return float(np.corrcoef(xr.values, yr.values)[0, 1])


def build_feature_frames(
    close_daily: pd.DataFrame,
    volume_daily: Optional[pd.DataFrame],
    params: SelectorParams,
) -> Dict[str, pd.DataFrame]:
    close = close_daily.sort_index().ffill()
    px = close
    ret_d = close.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)

    feats: Dict[str, pd.DataFrame] = {}
    feats["price"] = px
    feats["ret_5d"] = close.pct_change(params.ret_short).replace([np.inf, -np.inf], np.nan)
    feats["ret_21d"] = close.pct_change(params.ret_med).replace([np.inf, -np.inf], np.nan)
    feats["ret_63d"] = close.pct_change(params.ret_long).replace([np.inf, -np.inf], np.nan)
    feats["dd_21d"] = (close / close.rolling(params.dd_days, min_periods=max(10, params.dd_days // 2)).max() - 1.0).replace(
        [np.inf, -np.inf], np.nan
    )
    sma = close.rolling(params.sma_days, min_periods=max(120, params.sma_days // 2)).mean()
    feats["uptrend_200sma"] = (close > sma).astype(float)

    # Standardized daily return shocks
    dstd = ret_d.rolling(window=max(10, params.event_days), min_periods=max(5, int(0.7 * params.event_days))).std(ddof=1)
    eps = 1e-12
    zret = (ret_d / (dstd + eps)).replace([np.inf, -np.inf], np.nan).clip(-20.0, 20.0)
    feats["shock_cnt_z4_1m"] = (
        (zret.abs() > 4.0).astype(float).rolling(window=params.event_days, min_periods=max(5, int(0.7 * params.event_days))).sum()
    )

    if volume_daily is not None and not volume_daily.empty:
        vol = volume_daily.reindex(close.index).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        dv = (close * vol).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        ldv = np.log1p(dv.clip(lower=0.0))
        dvz = _zscore_rolling(ldv, window=params.dvz_window, minp=params.dvz_minp)
        feats["dollar_vol_z"] = dvz
        flow = dvz > params.dvz_spike
        flow_only = flow & (zret.abs() < 1.0)
        feats["flow_only_cnt_1m"] = (
            flow_only.astype(float).rolling(window=params.event_days, min_periods=max(5, int(0.7 * params.event_days))).sum()
        )
    else:
        feats["dollar_vol_z"] = px * np.nan
        feats["flow_only_cnt_1m"] = px * np.nan

    return feats


def _compute_ic_weights(
    feats: Dict[str, pd.DataFrame],
    close: pd.DataFrame,
    dt: pd.Timestamp,
    *,
    train_days: int,
    horizon_days: int,
    train_stride: int = 5,
    max_points: int = 130,
) -> Dict[str, float]:
    """
    Estimate feature weights from trailing cross-sectional IC (Spearman).
    """
    ret_fwd = close.pct_change(int(horizon_days)).shift(-int(horizon_days))
    idx = close.index
    i = int(idx.get_loc(dt))
    start_i = max(0, i - int(train_days))
    train_idx = idx[start_i:i]
    stride = int(max(1, train_stride))
    train_idx = train_idx[::stride]
    if len(train_idx) > int(max_points):
        train_idx = train_idx[-int(max_points) :]
    if len(train_idx) < 40:
        return {}

    raw: Dict[str, float] = {}
    for k, df in feats.items():
        vals = []
        for d in train_idx:
            x = df.loc[d]
            y = ret_fwd.loc[d]
            ic = _spearman_corr(x, y)
            if np.isfinite(ic):
                vals.append(float(ic))
        if len(vals) < 20:
            continue
        # Mean IC divided by variability gives a simple stability-aware signal weight.
        mu = float(np.mean(vals))
        sd = float(np.std(vals, ddof=1)) if len(vals) > 1 else float("nan")
        if not np.isfinite(mu):
            continue
        score = mu if (not np.isfinite(sd) or sd <= 1e-12) else mu / sd
        raw[k] = float(score)

    if not raw:
        return {}
    # Normalize by L1 norm so absolute scales are stable.
    s = sum(abs(v) for v in raw.values())
    if s <= 1e-12:
        return {}
    return {k: float(v / s) for k, v in raw.items()}


def score_and_rank_for_date(
    feats: Dict[str, pd.DataFrame],
    close: pd.DataFrame,
    dt: pd.Timestamp,
    params: SelectorParams,
    *,
    ic_feats: Optional[Dict[str, pd.DataFrame]] = None,
    score_mode: str = "fixed",
    ic_train_days: int = 504,
    ic_horizon_days: int = 21,
    ic_train_stride: int = 5,
    ic_max_points: int = 130,
) -> pd.Series:
    # Extract cross-section for dt.
    def xs(name: str) -> pd.Series:
        s = feats[name].loc[dt]
        if not isinstance(s, pd.Series):
            s = pd.Series(dtype=float)
        return s.astype(float)

    price = xs("price")
    ret_med = xs("ret_21d")
    ret_long = xs("ret_63d")
    dd = xs("dd_21d")
    up = xs("uptrend_200sma")
    dvz = xs("dollar_vol_z").fillna(0.0)
    flow_only = xs("flow_only_cnt_1m").fillna(0.0)
    shock = xs("shock_cnt_z4_1m").fillna(0.0)

    ok = price >= float(params.min_price)
    if bool(params.require_uptrend):
        ok = ok & (up > 0.5)
    ok = ok & (ret_med <= float(params.min_ret_med))

    score_mode = str(score_mode).lower().strip()
    if score_mode == "ic":
        ic_feat_map = ic_feats or {}
        if not ic_feat_map:
            score_mode = "fixed"
        else:
            w = _compute_ic_weights(
                ic_feat_map,
                close,
                dt,
                train_days=int(ic_train_days),
                horizon_days=int(ic_horizon_days),
                train_stride=int(ic_train_stride),
                max_points=int(ic_max_points),
            )
            if not w:
                score_mode = "fixed"
            else:
                score = pd.Series(0.0, index=price.index)
                for k, wk in w.items():
                    score = score + float(wk) * ic_feat_map[k].loc[dt].fillna(0.0)
    if score_mode != "ic":
        score = (
            params.w_flow_only * flow_only
            + params.w_dvz * dvz
            + params.w_dd * (-dd.clip(lower=-0.50, upper=0.0))
            + params.w_ret_med * (-ret_med.clip(lower=-0.50, upper=0.0))
            + params.w_ret_long * (ret_long.fillna(0.0).clip(lower=-0.50, upper=0.50))
            + params.w_shock * shock
        )
    score = score.where(ok, other=np.nan).dropna().sort_values(ascending=False)
    return score


def _perf_report(
    equity: pd.Series,
    daily_ret: pd.Series,
    *,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> Dict[str, float]:
    years = float((end - start).days) / 365.25
    return {
        "start": str(start.date()),
        "end": str(end.date()),
        "n_days": int(daily_ret.dropna().shape[0]),
        "cagr": _cagr(equity, years),
        "sharpe": _sharpe(daily_ret),
        "max_drawdown": _max_drawdown(equity),
        "final_equity": float(equity.iloc[-1]),
    }


def backtest_selector(
    close_daily: pd.DataFrame,
    volume_daily: Optional[pd.DataFrame],
    *,
    benchmark: str,
    params: SelectorParams,
    top_n: int,
    rebalance_days: int,
    exec_lag_days: int,
    cost_bps: float,
    market_filter: bool,
    dd_stop: float,
    dd_cooldown_days: int,
    score_mode: str,
    ic_train_days: int,
    ic_horizon_days: int,
    ic_train_stride: int,
    ic_max_points: int,
    seed: int,
    n_null: int,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, object]]:
    close = close_daily.sort_index().ffill()
    ret_d = close.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    dates = close.index

    feats = build_feature_frames(close, volume_daily, params)
    ic_feats: Dict[str, pd.DataFrame] = {}
    if str(score_mode).lower().strip() == "ic":
        # Precompute transformed features once; avoid rebuilding DataFrames per rebalance.
        ic_feats = {
            "flow_only_cnt_1m": feats["flow_only_cnt_1m"],
            "dollar_vol_z": feats["dollar_vol_z"],
            "dd_21d_pos": (-feats["dd_21d"].clip(lower=-0.50, upper=0.0)),
            "ret_21d_pos": (-feats["ret_21d"].clip(lower=-0.50, upper=0.0)),
            "ret_63d": feats["ret_63d"].fillna(0.0).clip(lower=-0.50, upper=0.50),
            "shock_cnt_z4_1m": feats["shock_cnt_z4_1m"],
        }
    min_warmup = int(max(params.sma_days, params.ret_long, params.dd_days, params.dvz_window, params.event_days) + 5)
    start_i = min_warmup
    if start_i >= len(dates) - (exec_lag_days + rebalance_days + 2):
        raise ValueError("Not enough data for backtest after warmup.")

    # Build scheduled rebalances.
    rebal_dates = list(dates[start_i : len(dates) - (exec_lag_days + 1) : int(rebalance_days)])
    if not rebal_dates:
        raise ValueError("No rebalance dates produced.")

    weight = pd.DataFrame(0.0, index=dates, columns=close.columns)
    picks_rows: List[Dict[str, object]] = []

    prev_w = pd.Series(0.0, index=close.columns)
    rng = np.random.default_rng(int(seed))

    for dt in rebal_dates:
        score = score_and_rank_for_date(
            feats,
            close,
            dt,
            params,
            ic_feats=ic_feats,
            score_mode=str(score_mode),
            ic_train_days=int(ic_train_days),
            ic_horizon_days=int(ic_horizon_days),
            ic_train_stride=int(ic_train_stride),
            ic_max_points=int(ic_max_points),
        )
        if score.empty:
            picks = []
        else:
            picks = list(score.index[: int(top_n)])
        trade_dt = dates[dates.get_loc(dt) + int(exec_lag_days)]

        # Apply weights from trade_dt inclusive until the next trade_dt (exclusive).
        w = pd.Series(0.0, index=close.columns)
        if picks:
            w.loc[picks] = 1.0 / float(len(picks))
        w = w.fillna(0.0)

        # Determine segment end
        dt_idx = dates.get_loc(dt)
        seg_start = dates.get_loc(trade_dt)
        next_dt_idx = dt_idx + int(rebalance_days)
        if next_dt_idx < len(dates) - int(exec_lag_days):
            next_trade = dates[next_dt_idx + int(exec_lag_days)]
            seg_end = dates.get_loc(next_trade)
        else:
            seg_end = len(dates)

        weight.iloc[seg_start:seg_end, :] = w.values

        for inst in picks:
            picks_rows.append({"rebalance_date": dt, "trade_date": trade_dt, "instrument": str(inst), "score": float(score.loc[inst])})

        prev_w = w

    # Market regime filter on the universe equal-weight index (simple risk-on/off).
    risk_on = pd.Series(True, index=dates)
    if bool(market_filter):
        eqw_ret = ret_d.mean(axis=1).astype(float)
        eqw_idx = (1.0 + eqw_ret).cumprod()
        sma = eqw_idx.rolling(200, min_periods=120).mean()
        risk_on = (eqw_idx > sma).fillna(False)
        weight = weight.mul(risk_on.astype(float), axis=0)

    # Costs: apply on days where weight changes (trade days).
    turnover = weight.diff().abs().sum(axis=1).fillna(0.0)
    cost = (float(cost_bps) / 10000.0) * turnover

    # Portfolio daily returns (weights held from t-1 to t), with an objective DD stop.
    w_prev = weight.shift(1).fillna(0.0)
    port_ret = pd.Series(0.0, index=dates)
    equity = pd.Series(1.0, index=dates)
    peak = 1.0
    cooldown = 0
    dd_stop = float(dd_stop)
    dd_cooldown_days = int(max(0, dd_cooldown_days))
    for i, dt in enumerate(dates):
        if i == 0:
            continue
        w = w_prev.iloc[i]
        r = float((w * ret_d.iloc[i]).sum())
        c = float(cost.iloc[i])
        if dd_stop > 0.0:
            dd = equity.iloc[i - 1] / peak - 1.0
            if cooldown > 0:
                # Stay in cash during cooldown.
                w = 0.0 * w
                r = 0.0
                c = 0.0
                cooldown -= 1
            else:
                # Trigger stop if drawdown breaches budget.
                if dd <= -dd_stop:
                    w = 0.0 * w
                    r = 0.0
                    c = 0.0
                    cooldown = dd_cooldown_days
        port_ret.iloc[i] = r - c
        equity.iloc[i] = equity.iloc[i - 1] * (1.0 + port_ret.iloc[i])
        peak = max(peak, float(equity.iloc[i]))

    # Benchmark: if the requested ticker isn't present (common for constituent-only panels),
    # fall back to an equal-weight index of the available universe.
    benchmark_name = str(benchmark)
    if str(benchmark) in close.columns:
        bench_ret = close[str(benchmark)].pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    else:
        benchmark_name = "EQW"
        bench_ret = ret_d.mean(axis=1).astype(float)
    bench_eq = (1.0 + bench_ret).cumprod()

    # Null: random picks each rebalance (same count as real picks on that date).
    null_eqs: List[pd.Series] = []
    null_rets: List[pd.Series] = []
    cols = list(close.columns)
    cols_no_bench = [c for c in cols if c != benchmark]

    # Precompute "eligible" per rebalance (price+trend constraints), then random within those.
    eligible_cache: Dict[pd.Timestamp, List[str]] = {}
    for dt in rebal_dates:
        xs_price = feats["price"].loc[dt]
        xs_up = feats["uptrend_200sma"].loc[dt]
        elig = (xs_price >= float(params.min_price)).fillna(False)
        if bool(params.require_uptrend):
            elig = elig & (xs_up > 0.5).fillna(False)
        eligible_cache[dt] = [str(x) for x, ok in elig.items() if bool(ok)]

    for j in range(int(n_null)):
        w_null = pd.DataFrame(0.0, index=dates, columns=close.columns)
        for dt in rebal_dates:
            trade_dt = dates[dates.get_loc(dt) + int(exec_lag_days)]
            dt_idx = dates.get_loc(dt)
            seg_start = dates.get_loc(trade_dt)
            next_dt_idx = dt_idx + int(rebalance_days)
            if next_dt_idx < len(dates) - int(exec_lag_days):
                next_trade = dates[next_dt_idx + int(exec_lag_days)]
                seg_end = dates.get_loc(next_trade)
            else:
                seg_end = len(dates)

            # Match K to the real strategy's non-zero count on trade_dt.
            k = int((weight.loc[trade_dt].abs() > 1e-12).sum())
            elig = eligible_cache.get(dt, cols_no_bench)
            if k <= 0 or len(elig) == 0:
                continue
            picks = list(rng.choice(elig, size=min(k, len(elig)), replace=False))
            w = pd.Series(0.0, index=close.columns)
            w.loc[picks] = 1.0 / float(len(picks))
            w_null.iloc[seg_start:seg_end, :] = w.values

        turnover_n = w_null.diff().abs().sum(axis=1).fillna(0.0)
        cost_n = (float(cost_bps) / 10000.0) * turnover_n
        r_n = (w_null.shift(1).fillna(0.0) * ret_d).sum(axis=1) - cost_n
        eq_n = (1.0 + r_n).cumprod()
        null_rets.append(r_n)
        null_eqs.append(eq_n)

    start = dates[start_i + int(exec_lag_days)]
    end = dates[-1]
    summary: Dict[str, object] = {
        "params": params.__dict__,
        "top_n": int(top_n),
        "rebalance_days": int(rebalance_days),
        "exec_lag_days": int(exec_lag_days),
        "cost_bps": float(cost_bps),
        "market_filter": bool(market_filter),
        "dd_stop": float(dd_stop),
        "dd_cooldown_days": int(dd_cooldown_days),
        "score_mode": str(score_mode),
        "ic_train_days": int(ic_train_days),
        "ic_horizon_days": int(ic_horizon_days),
        "ic_train_stride": int(ic_train_stride),
        "ic_max_points": int(ic_max_points),
        "benchmark": benchmark_name,
        "strategy": _perf_report(equity.loc[start:], port_ret.loc[start:], start=start, end=end),
        "benchmark_perf": _perf_report(bench_eq.loc[start:], bench_ret.loc[start:], start=start, end=end),
        "null": {},
    }

    if null_eqs:
        null_cagr = []
        null_sh = []
        null_mdd = []
        for eq_n, r_n in zip(null_eqs, null_rets):
            pr = _perf_report(eq_n.loc[start:], r_n.loc[start:], start=start, end=end)
            null_cagr.append(pr["cagr"])
            null_sh.append(pr["sharpe"])
            null_mdd.append(pr["max_drawdown"])
        summary["null"] = {
            "n": int(len(null_eqs)),
            "cagr_median": float(np.median(null_cagr)),
            "sharpe_median": float(np.median(null_sh)),
            "mdd_median": float(np.median(null_mdd)),
            "cagr_p90": float(np.quantile(null_cagr, 0.9)),
        }

    equity_df = pd.DataFrame(
        {
            "date": dates,
            "strategy_equity": equity.values,
            "benchmark_equity": bench_eq.values,
            "strategy_ret": port_ret.values,
            "benchmark_ret": bench_ret.values,
            "turnover": turnover.values,
            "cost": cost.values,
        }
    )
    picks_df = pd.DataFrame(picks_rows)
    return equity_df, picks_df, summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="QQQ")
    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--rebalance-days", type=int, default=5, help="How often to refresh the list.")
    ap.add_argument("--exec-lag-days", type=int, default=1, help="Execution lag (days) to reduce lookahead.")
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--no-market-filter", action="store_true", help="Disable market regime filter (EQW > 200SMA).")
    ap.add_argument("--dd-stop", type=float, default=0.25, help="Drawdown stop budget (0 disables).")
    ap.add_argument("--dd-cooldown-days", type=int, default=21, help="Days to stay in cash after DD stop triggers.")
    ap.add_argument("--score-mode", choices=["fixed", "ic"], default="ic", help="Fixed heuristic weights or trailing IC-learned weights.")
    ap.add_argument("--ic-train-days", type=int, default=504, help="Training lookback for IC-learned weights.")
    ap.add_argument("--ic-horizon-days", type=int, default=21, help="Forward horizon for IC target.")
    ap.add_argument("--ic-train-stride", type=int, default=5, help="Sample every N training days for IC speed.")
    ap.add_argument("--ic-max-points", type=int, default=130, help="Max sampled training points for IC.")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--n-null", type=int, default=50, help="Random-picks null simulations.")

    ap.add_argument("--min-price", type=float, default=5.0)
    ap.add_argument("--no-uptrend", action="store_true", help="Disable 200SMA uptrend constraint.")
    ap.add_argument("--min-ret-21d", type=float, default=-0.05)
    ap.add_argument("--dvz-spike", type=float, default=2.0)
    args = ap.parse_args()

    panel = _load_panel(args.panel)
    close = _wide(panel, "Price_Close")
    vol = _wide(panel, "Volume") if "Volume" in panel.columns else None

    params = SelectorParams(
        min_price=float(args.min_price),
        require_uptrend=not bool(args.no_uptrend),
        min_ret_med=float(args.min_ret_21d),
        dvz_spike=float(args.dvz_spike),
    )

    eq, picks, summary = backtest_selector(
        close,
        vol,
        benchmark=str(args.benchmark),
        params=params,
        top_n=int(args.top_n),
        rebalance_days=int(args.rebalance_days),
        exec_lag_days=int(args.exec_lag_days),
        cost_bps=float(args.cost_bps),
        market_filter=not bool(args.no_market_filter),
        dd_stop=float(args.dd_stop),
        dd_cooldown_days=int(args.dd_cooldown_days),
        score_mode=str(args.score_mode),
        ic_train_days=int(args.ic_train_days),
        ic_horizon_days=int(args.ic_horizon_days),
        ic_train_stride=int(args.ic_train_stride),
        ic_max_points=int(args.ic_max_points),
        seed=int(args.seed),
        n_null=int(args.n_null),
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "equity_curve.csv").write_text(eq.to_csv(index=False))
    picks.to_csv(args.out_dir / "picks.csv", index=False)
    (args.out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))

    md = []
    md.append("# Rebound Selector Backtest\n")
    md.append("## Summary\n")
    md.append("```json")
    md.append(json.dumps(summary, indent=2, default=str))
    md.append("```\n")
    if not picks.empty:
        md.append("## Latest Picks\n")
        latest = picks.sort_values("trade_date").groupby("trade_date", as_index=False).tail(int(args.top_n))
        last_dt = latest["trade_date"].max()
        last = latest[latest["trade_date"] == last_dt].sort_values("score", ascending=False)
        md.append(f"- last trade_date: `{pd.Timestamp(last_dt).date().isoformat()}`\n")
        md.append(last[["instrument", "score"]].head(25).to_markdown(index=False))
        md.append("")
    (args.out_dir / "report.md").write_text("\n".join(md) + "\n")

    s = summary["strategy"]
    b = summary["benchmark_perf"]
    print(f"Strategy: CAGR={s['cagr']:.3f} Sharpe={s['sharpe']:.2f} MDD={s['max_drawdown']:.3f}")
    print(f"Bench({summary['benchmark']}): CAGR={b['cagr']:.3f} Sharpe={b['sharpe']:.2f} MDD={b['max_drawdown']:.3f}")
    if summary.get("null"):
        n = summary["null"]
        if isinstance(n, dict) and n:
            print(
                f"Null median: CAGR={n.get('cagr_median', float('nan')):.3f} "
                f"Sharpe={n.get('sharpe_median', float('nan')):.2f} "
                f"MDD={n.get('mdd_median', float('nan')):.3f}"
            )
    print(f"Wrote {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
