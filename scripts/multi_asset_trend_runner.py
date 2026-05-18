#!/usr/bin/env python3
"""
Multi-asset trend runner (offline once data is present).

Goal: a passive-ish, academically defensible return source:
- Time-series momentum ("trend following") across asset classes
- Monthly rebalancing
- Volatility targeting + drawdown throttle overlays
- Simple liquidity/slippage knobs

This is not investment advice and is not production execution code.
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
    n_months: int
    cagr: float
    sharpe: float
    max_drawdown: float
    annual_vol: float
    final_equity: float


def load_prices(panel_csv: Path) -> Tuple[pd.DataFrame, Optional[pd.DataFrame]]:
    df = pd.read_csv(panel_csv)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise ValueError("Panel must have columns: Instrument, Date, Price_Close, Volume(optional)")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df = df.sort_values(["Date", "Instrument"])

    prices = (
        df.pivot(index="Date", columns="Instrument", values="Price_Close")
        .sort_index()
        .astype(float)
    )
    vols = None
    if "Volume" in df.columns:
        vols = (
            df.pivot(index="Date", columns="Instrument", values="Volume")
            .sort_index()
        )
    return prices, vols


def _max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    dd = equity / equity.cummax() - 1.0
    return float(dd.min())


def perf(pnl_m: pd.Series) -> Perf:
    pnl_m = pnl_m.fillna(0.0)
    equity = (1.0 + pnl_m).cumprod()
    n = len(pnl_m)
    vol = float(pnl_m.std(ddof=0) * np.sqrt(12.0)) if n > 2 else 0.0
    sharpe = float((pnl_m.mean() * 12.0) / vol) if vol > 0 else 0.0
    cagr = float(equity.iloc[-1] ** (12.0 / n) - 1.0) if n > 1 else 0.0
    return Perf(
        start=str(equity.index.min().date()) if not equity.empty else "",
        end=str(equity.index.max().date()) if not equity.empty else "",
        n_months=int(n),
        cagr=cagr,
        sharpe=sharpe,
        max_drawdown=_max_drawdown(equity),
        annual_vol=vol,
        final_equity=float(equity.iloc[-1]) if not equity.empty else 1.0,
    )


def _monthly_last(prices_daily: pd.DataFrame) -> pd.DataFrame:
    return prices_daily.resample("ME").last()


def _monthly_sum(volumes_daily: Optional[pd.DataFrame]) -> Optional[pd.DataFrame]:
    if volumes_daily is None:
        return None
    return volumes_daily.resample("ME").sum(min_count=1)


def _ts_mom_signal(
    prices_m: pd.DataFrame,
    *,
    lookback_months: List[int],
    ma_months: List[int],
    side: str,
    combine: str,
    signal_smooth_months: int,
) -> pd.DataFrame:
    # Ensemble time-series momentum signal across lookbacks and moving-average filters.
    # Returns a forecast signal in [-1, +1] (or [0, +1] for long-only).
    px = prices_m.copy()
    lookbacks = [int(x) for x in lookback_months if int(x) > 0]
    mas = [int(x) for x in ma_months if int(x) > 1]
    if not lookbacks:
        lookbacks = [12]
    if not mas:
        mas = [10]

    # Return-direction vote.
    ret_votes = []
    for lb in lookbacks:
        ret = px / px.shift(lb) - 1.0
        ret_votes.append(np.sign(ret))
    ret_vote = pd.concat(ret_votes, axis=1).T.groupby(level=0).mean().T

    # MA-direction vote.
    ma_votes = []
    for m in mas:
        ma = px.rolling(m, min_periods=max(3, m // 2)).mean()
        ma_votes.append(np.sign(px - ma))
    ma_vote = pd.concat(ma_votes, axis=1).T.groupby(level=0).mean().T

    if combine == "prod":
        combined = ret_vote * ma_vote
    else:
        combined = ret_vote + ma_vote

    # Convert combined vote to a bounded forecast strength in [-1, +1].
    forecast = (combined / 2.0).clip(-1.0, 1.0).fillna(0.0)
    if int(signal_smooth_months) > 1:
        forecast = forecast.ewm(span=int(signal_smooth_months), adjust=False, min_periods=2).mean().fillna(0.0)
    if side == "long_only":
        forecast = forecast.clip(lower=0.0)
    return forecast.astype(float)


def _rolling_vol(rets_m: pd.DataFrame, vol_months: int) -> pd.DataFrame:
    return rets_m.rolling(vol_months, min_periods=max(3, vol_months // 2)).std(ddof=0) * np.sqrt(12.0)


def _risk_parity_weights(
    vol_ann: pd.Series,
    *,
    max_weight: float,
) -> pd.Series:
    v = vol_ann.replace([np.inf, -np.inf], np.nan).dropna()
    if v.empty:
        return pd.Series(dtype=float)
    inv = 1.0 / v.clip(lower=1e-6)
    w = inv / inv.sum()
    if max_weight > 0:
        w = w.clip(upper=max_weight)
        if float(w.sum()) > 0:
            w = w / w.sum()
    return w


def _apply_vol_target(
    pnl: pd.Series,
    *,
    target_vol: float,
    vol_lookback_months: int,
    max_leverage: float,
) -> Tuple[pd.Series, pd.Series]:
    vol = pnl.rolling(vol_lookback_months, min_periods=max(6, vol_lookback_months // 2)).std(ddof=0) * np.sqrt(12.0)
    scale = (target_vol / vol).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, max_leverage)
    return pnl * scale, scale


def _apply_dd_throttle(
    pnl: pd.Series,
    *,
    dd_throttle: float,
    dd_floor_exposure: float,
) -> Tuple[pd.Series, pd.Series]:
    equity = (1.0 + pnl).cumprod()
    peak = equity.cummax()
    dd = equity / peak - 1.0
    exposure = pd.Series(1.0, index=pnl.index, dtype=float)
    if dd_throttle > 0:
        # Linear throttle beyond threshold down to a floor.
        over = (-dd - dd_throttle).clip(lower=0.0)
        # If dd is 0.40 and throttle is 0.20 => over=0.20 => exposure down towards floor.
        exposure = (1.0 - over / max(1e-6, (1.0 - dd_throttle))).clip(lower=dd_floor_exposure, upper=1.0)
    return pnl * exposure, exposure


def _median_monthly_dollar_volume(
    prices_m: pd.DataFrame,
    volumes_m: Optional[pd.DataFrame],
    *,
    lookback_months: int,
) -> Optional[pd.DataFrame]:
    if volumes_m is None:
        return None
    dv = prices_m * volumes_m
    return dv.rolling(lookback_months, min_periods=max(3, lookback_months // 2)).median()


def _slippage_cost_monthly(
    *,
    turnover: float,
    portfolio_usd: float,
    dollar_volume: Optional[pd.Series],
    slippage_bps: float,
    slippage_cap_bps: float,
    slippage_ref_participation: float,
) -> float:
    if slippage_bps <= 0 or turnover <= 0 or portfolio_usd <= 0:
        return 0.0
    if dollar_volume is None or dollar_volume.dropna().empty:
        return float((slippage_bps / 10000.0) * turnover)
    adv = float(dollar_volume.dropna().median())
    if adv <= 0:
        return float((slippage_bps / 10000.0) * turnover)
    trade_notional = float(portfolio_usd * turnover)
    participation = trade_notional / adv
    mult = min(1.0, participation / max(1e-6, slippage_ref_participation))
    slip_bps = min(float(slippage_cap_bps), float(slippage_bps) * mult)
    return float((slip_bps / 10000.0) * turnover)


def run_trend_backtest(
    *,
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    assets: List[str],
    cash_proxy: Optional[str],
    lookback_months: List[int],
    ma_months: List[int],
    vol_months: int,
    min_history_months: int,
    max_weight: float,
    rebalance_months: int,
    side: str,
    signal_combine: str,
    signal_threshold: float,
    signal_smooth_months: int,
    # Frictions
    cost_bps: float,
    slippage_bps: float,
    slippage_cap_bps: float,
    slippage_ref_participation: float,
    portfolio_usd: float,
    min_median_dollar_volume: float,
    dollar_volume_lookback_months: int,
    # Overlays
    target_vol: float,
    vol_target_lookback_months: int,
    max_leverage: float,
    dd_throttle: float,
    dd_floor_exposure: float,
) -> Dict[str, Any]:
    prices_daily = prices_daily.copy().sort_index()
    if volumes_daily is not None:
        volumes_daily = volumes_daily.reindex(prices_daily.index).copy()

    universe = [a for a in assets if a in prices_daily.columns]
    if not universe:
        return {"error": "No requested assets found in panel."}

    px_d = prices_daily[universe].ffill()
    px_m = _monthly_last(px_d)
    rets_m = px_m.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0)

    vols_m = _monthly_sum(volumes_daily[universe]) if volumes_daily is not None else None
    dv_med = _median_monthly_dollar_volume(px_m, vols_m, lookback_months=dollar_volume_lookback_months)

    sig = _ts_mom_signal(
        px_m,
        lookback_months=lookback_months,
        ma_months=ma_months,
        side=side,
        combine=signal_combine,
        signal_smooth_months=int(signal_smooth_months),
    )
    vol_ann = _rolling_vol(rets_m, vol_months)

    pnl = []
    dates = []
    weights_hist: List[Tuple[pd.Timestamp, pd.Series]] = []
    prev_w = pd.Series(0.0, index=universe, dtype=float)

    cash_ticker = cash_proxy if (cash_proxy and cash_proxy in universe) else None

    for i, t in enumerate(px_m.index):
        if i < min_history_months:
            continue
        if rebalance_months > 1 and (i % rebalance_months) != 0:
            # Hold weights; compute next month return.
            pass

        if i >= len(px_m.index) - 1:
            break

        # Determine weights at t, applied to (t -> t+1) return.
        forecast = sig.loc[t].fillna(0.0)
        thr = float(abs(signal_threshold))
        eligible_assets = forecast[forecast.abs() > thr].index.tolist()

        if eligible_assets:
            # Liquidity gate: require median monthly dollar volume.
            if dv_med is not None and min_median_dollar_volume > 0:
                dv_t = dv_med.loc[t, eligible_assets]
                eligible_assets = [a for a in eligible_assets if float(dv_t.get(a, 0.0)) >= float(min_median_dollar_volume)]

        if eligible_assets:
            w = _risk_parity_weights(vol_ann.loc[t, eligible_assets], max_weight=max_weight)
            # Apply direction for long/short.
            if side == "long_short":
                w = w * forecast.reindex(w.index).fillna(0.0)
                # Re-normalize by gross exposure (sum abs weights) to 1.
                gross = float(w.abs().sum())
                if gross > 0:
                    w = w / gross
        else:
            w = pd.Series(dtype=float)

        # Optionally allocate uninvested to cash proxy (if present) else 0-return cash.
        if side == "long_only" and cash_proxy and cash_proxy in universe and cash_proxy not in w.index:
            remain = 1.0 - float(w.sum()) if not w.empty else 1.0
            if remain > 0:
                w = pd.concat([w, pd.Series({cash_proxy: remain})])
        if not w.empty:
            w = w.reindex(universe).fillna(0.0)
        else:
            w = pd.Series(0.0, index=universe, dtype=float)

        turnover = float((w - prev_w).abs().sum())
        tc = float((cost_bps / 10000.0) * turnover) if cost_bps > 0 else 0.0
        slip = _slippage_cost_monthly(
            turnover=turnover,
            portfolio_usd=portfolio_usd,
            dollar_volume=(dv_med.loc[t] if dv_med is not None else None),
            slippage_bps=slippage_bps,
            slippage_cap_bps=slippage_cap_bps,
            slippage_ref_participation=slippage_ref_participation,
        )

        r_next = rets_m.shift(-1).loc[t].reindex(universe).fillna(0.0)
        r_positions = float((w * r_next).sum())
        # Managed-futures convention: long/short positions are collateralized; add cash return.
        r_cash = float(r_next.get(cash_ticker, 0.0)) if (side == "long_short" and cash_ticker) else 0.0
        r = (r_positions + r_cash) - tc - slip

        dates.append(t)
        pnl.append(r)
        weights_hist.append((t, w))
        prev_w = w

    pnl_s = pd.Series(pnl, index=pd.DatetimeIndex(dates), name="pnl")
    # Overlays applied to the realized pnl stream (good enough for research harness).
    pnl_vt, vt_scale = _apply_vol_target(
        pnl_s,
        target_vol=target_vol,
        vol_lookback_months=vol_target_lookback_months,
        max_leverage=max_leverage,
    )
    pnl_final, dd_scale = _apply_dd_throttle(
        pnl_vt,
        dd_throttle=dd_throttle,
        dd_floor_exposure=dd_floor_exposure,
    )

    out = {
        "pnl": pnl_final,
        "raw_pnl": pnl_s,
        "weights": weights_hist,
        "vt_scale": vt_scale,
        "dd_scale": dd_scale,
        "perf": asdict(perf(pnl_final)),
    }
    return out


def make_benchmarks(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    *,
    benchmark_ticker: str,
    bond_ticker: str,
    target_vol: float,
    vol_target_lookback_months: int,
    max_leverage: float,
    dd_throttle: float,
    dd_floor_exposure: float,
    cost_bps: float,
    slippage_bps: float,
    slippage_cap_bps: float,
    slippage_ref_participation: float,
    portfolio_usd: float,
    dollar_volume_lookback_months: int,
) -> Dict[str, Optional[pd.Series]]:
    if benchmark_ticker not in prices_daily.columns:
        return {"raw": None, "vol_target_costed": None, "dd_throttle_costed": None, "risk_managed_costed": None, "sixty_forty_raw": None, "sixty_forty_costed": None}

    px = prices_daily[[benchmark_ticker]].ffill()
    px_m = _monthly_last(px)
    rets_m = px_m.pct_change().fillna(0.0)[benchmark_ticker]
    vols_m = _monthly_sum(volumes_daily[[benchmark_ticker]]) if volumes_daily is not None else None
    dv_med = _median_monthly_dollar_volume(px_m, vols_m, lookback_months=dollar_volume_lookback_months)

    # Apply overlays to benchmark returns (no timing tricks; same month-ahead convention).
    pnl_vt, vt_scale = _apply_vol_target(
        rets_m,
        target_vol=target_vol,
        vol_lookback_months=vol_target_lookback_months,
        max_leverage=max_leverage,
    )
    pnl_rm, dd_scale = _apply_dd_throttle(
        pnl_vt,
        dd_throttle=dd_throttle,
        dd_floor_exposure=dd_floor_exposure,
    )
    pnl_dd_only, dd_only_scale = _apply_dd_throttle(
        rets_m,
        dd_throttle=dd_throttle,
        dd_floor_exposure=dd_floor_exposure,
    )

    # Cost the benchmark based on turnover induced by overlay changes (approx).
    # We approximate "turnover" as absolute change in exposure (scale) month to month.
    exposure = (vt_scale * dd_scale).fillna(0.0)
    turnover = exposure.diff().abs().fillna(0.0)
    tc = (cost_bps / 10000.0) * turnover if cost_bps > 0 else 0.0
    slip = []
    for t in exposure.index:
        slip.append(
            _slippage_cost_monthly(
                turnover=float(turnover.loc[t]),
                portfolio_usd=portfolio_usd,
                dollar_volume=(dv_med.loc[t] if dv_med is not None and t in dv_med.index else None),
                slippage_bps=slippage_bps,
                slippage_cap_bps=slippage_cap_bps,
                slippage_ref_participation=slippage_ref_participation,
            )
        )
    slip_s = pd.Series(slip, index=exposure.index, dtype=float)
    costed = pnl_rm - tc - slip_s

    # Also cost vol-target only and dd-only variants for attribution.
    vt_turn = vt_scale.diff().abs().fillna(0.0)
    vt_tc = (cost_bps / 10000.0) * vt_turn if cost_bps > 0 else 0.0
    vt_slip = []
    for t in vt_scale.index:
        vt_slip.append(
            _slippage_cost_monthly(
                turnover=float(vt_turn.loc[t]),
                portfolio_usd=portfolio_usd,
                dollar_volume=(dv_med.loc[t] if dv_med is not None and t in dv_med.index else None),
                slippage_bps=slippage_bps,
                slippage_cap_bps=slippage_cap_bps,
                slippage_ref_participation=slippage_ref_participation,
            )
        )
    vt_costed = pnl_vt - vt_tc - pd.Series(vt_slip, index=vt_scale.index, dtype=float)

    dd_turn = dd_only_scale.diff().abs().fillna(0.0)
    dd_tc = (cost_bps / 10000.0) * dd_turn if cost_bps > 0 else 0.0
    dd_slip = []
    for t in dd_only_scale.index:
        dd_slip.append(
            _slippage_cost_monthly(
                turnover=float(dd_turn.loc[t]),
                portfolio_usd=portfolio_usd,
                dollar_volume=(dv_med.loc[t] if dv_med is not None and t in dv_med.index else None),
                slippage_bps=slippage_bps,
                slippage_cap_bps=slippage_cap_bps,
                slippage_ref_participation=slippage_ref_participation,
            )
        )
    dd_costed = pnl_dd_only - dd_tc - pd.Series(dd_slip, index=dd_only_scale.index, dtype=float)

    # 60/40 (raw + costed by assuming monthly rebalancing turnover).
    sixty_forty_raw = None
    sixty_forty_costed = None
    if bond_ticker in prices_daily.columns:
        px2 = prices_daily[[benchmark_ticker, bond_ticker]].ffill()
        px2_m = _monthly_last(px2)
        r2 = px2_m.pct_change().fillna(0.0)
        w = pd.Series({benchmark_ticker: 0.6, bond_ticker: 0.4})
        sixty_forty_raw = (r2 * w).sum(axis=1)
        # Approx turnover from monthly rebalancing.
        equity = (1.0 + sixty_forty_raw).cumprod()
        # Rebalance implies turnover roughly proportional to drift; estimate from weight drift.
        # Simple approximation: turnover = sum(|w_t - w_{t-1}|).
        w_hist = []
        prev_w = w
        for t in r2.index:
            # Update weights by returns.
            grew = prev_w * (1.0 + r2.loc[t].reindex(prev_w.index).fillna(0.0))
            if float(grew.sum()) > 0:
                drift_w = grew / float(grew.sum())
            else:
                drift_w = prev_w
            w_hist.append(drift_w)
            prev_w = drift_w
        w_hist = pd.DataFrame(w_hist, index=r2.index, columns=w.index)
        turn = w_hist.diff().abs().sum(axis=1).fillna(0.0)
        sixty_forty_costed = sixty_forty_raw - (cost_bps / 10000.0) * turn

    return {
        "raw": rets_m,
        "vol_target_costed": vt_costed,
        "dd_throttle_costed": dd_costed,
        "risk_managed_costed": costed,
        "sixty_forty_raw": sixty_forty_raw,
        "sixty_forty_costed": sixty_forty_costed,
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Multi-asset trend runner.")
    sr_root = Path(__file__).resolve().parents[1]
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, default=sr_root / "backtests/outputs/multi_asset_trend")
    p.add_argument("--assets", nargs="*", default=[])
    p.add_argument("--assets-file", type=Path, default=sr_root / "config/tickers_multi_asset_core.txt")
    p.add_argument("--cash-proxy", type=str, default="BIL")

    # Signal params
    p.add_argument("--lookback-months", type=int, nargs="+", default=[12])
    p.add_argument("--ma-months", type=int, nargs="+", default=[10])
    p.add_argument("--vol-months", type=int, default=12)
    p.add_argument("--min-history-months", type=int, default=24)
    p.add_argument("--rebalance-months", type=int, default=1)
    p.add_argument("--max-weight", type=float, default=0.35)
    p.add_argument("--side", choices=["long_only", "long_short"], default="long_only")
    p.add_argument("--signal-combine", choices=["sum", "prod"], default="sum", help="How to combine return-trend and MA-trend votes.")
    p.add_argument("--signal-threshold", type=float, default=0.0, help="Ignore weak forecasts with |signal| <= threshold (0..1).")
    p.add_argument("--signal-smooth-months", type=int, default=1, help="EWMA smoothing span for the forecast (>=1 disables).")

    # Frictions
    p.add_argument("--cost-bps", type=float, default=5.0)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    p.add_argument("--slippage-cap-bps", type=float, default=25.0)
    p.add_argument("--slippage-ref-participation", type=float, default=0.10)
    p.add_argument("--portfolio-usd", type=float, default=250000.0)
    p.add_argument("--min-median-dollar-volume", type=float, default=10_000_000.0)
    p.add_argument("--dollar-volume-lookback-months", type=int, default=12)

    # Overlays
    p.add_argument("--target-vol", type=float, default=0.12)
    p.add_argument("--vol-target-lookback-months", type=int, default=12)
    p.add_argument("--max-leverage", type=float, default=1.5)
    p.add_argument("--dd-throttle", type=float, default=0.20)
    p.add_argument("--dd-floor-exposure", type=float, default=0.50)
    p.add_argument("--benchmark", type=str, default="SPY")
    p.add_argument("--bond-benchmark", type=str, default="IEF")
    args = p.parse_args()

    assets = list(args.assets)
    if args.assets_file and args.assets_file.exists():
        lines = [
            l.strip()
            for l in args.assets_file.read_text().splitlines()
            if l.strip() and not l.strip().startswith("#")
        ]
        assets.extend(lines)
    assets = sorted(dict.fromkeys(assets))

    prices, vols = load_prices(args.panel)
    res = run_trend_backtest(
        prices_daily=prices,
        volumes_daily=vols,
        assets=assets,
        cash_proxy=args.cash_proxy,
        lookback_months=list(args.lookback_months),
        ma_months=list(args.ma_months),
        vol_months=int(args.vol_months),
        min_history_months=int(args.min_history_months),
        max_weight=float(args.max_weight),
        rebalance_months=int(args.rebalance_months),
        side=str(args.side),
        signal_combine=str(args.signal_combine),
        signal_threshold=float(args.signal_threshold),
        signal_smooth_months=int(args.signal_smooth_months),
        cost_bps=float(args.cost_bps),
        slippage_bps=float(args.slippage_bps),
        slippage_cap_bps=float(args.slippage_cap_bps),
        slippage_ref_participation=float(args.slippage_ref_participation),
        portfolio_usd=float(args.portfolio_usd),
        min_median_dollar_volume=float(args.min_median_dollar_volume),
        dollar_volume_lookback_months=int(args.dollar_volume_lookback_months),
        target_vol=float(args.target_vol),
        vol_target_lookback_months=int(args.vol_target_lookback_months),
        max_leverage=float(args.max_leverage),
        dd_throttle=float(args.dd_throttle),
        dd_floor_exposure=float(args.dd_floor_exposure),
    )
    if "error" in res:
        print(f"Error: {res['error']}")
        return 1

    benches = make_benchmarks(
        prices,
        vols,
        benchmark_ticker=str(args.benchmark),
        bond_ticker=str(args.bond_benchmark),
        target_vol=float(args.target_vol),
        vol_target_lookback_months=int(args.vol_target_lookback_months),
        max_leverage=float(args.max_leverage),
        dd_throttle=float(args.dd_throttle),
        dd_floor_exposure=float(args.dd_floor_exposure),
        cost_bps=float(args.cost_bps),
        slippage_bps=float(args.slippage_bps),
        slippage_cap_bps=float(args.slippage_cap_bps),
        slippage_ref_participation=float(args.slippage_ref_participation),
        portfolio_usd=float(args.portfolio_usd),
        dollar_volume_lookback_months=int(args.dollar_volume_lookback_months),
    )
    bench = benches.get("risk_managed_costed")
    pnl = res["pnl"]
    if bench is not None:
        bench = bench.reindex(pnl.index).fillna(0.0)
        excess = pnl - bench
        ir = float((excess.mean() * 12.0) / (excess.std(ddof=0) * np.sqrt(12.0))) if excess.std(ddof=0) > 0 else 0.0
        out = {"strategy": res["perf"], "benchmark": asdict(perf(bench)), "excess_ann": float(excess.mean() * 12.0), "info_ratio": float(ir)}
    else:
        out = {"strategy": res["perf"], "benchmark": None}

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(out, indent=2))
    (args.out_dir / "equity_curve.csv").write_text(((1.0 + pnl).cumprod().rename("equity")).to_csv())
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
