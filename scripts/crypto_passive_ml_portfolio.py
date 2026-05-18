#!/usr/bin/env python3
"""
Passive crypto allocation model (factor-style features + rolling ML).

Design goals:
- Passive-ish: monthly rebalance, long-only (spot-friendly), caps, low churn.
- Stable: vol targeting, BTC regime filter, drawdown throttle.
- Honest evaluation: strict walk-forward (train on past months only).

Data:
- Uses a tidy daily panel: Instrument, Date, Price_Close, Volume
- Recommended to generate via `scripts/fetch_yfinance_tidy_panel.py`

Benchmarks:
- Equal-weight buy&hold of the same universe
- BTC-USD buy&hold
- BTC/ETH 60/40 buy&hold (if present)
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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


def _max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    dd = equity / equity.cummax() - 1.0
    return float(dd.min())


def _perf(pnl: pd.Series) -> Perf:
    pnl = pnl.fillna(0.0)
    equity = (1.0 + pnl).cumprod()
    n = len(pnl)
    vol = float(pnl.std(ddof=0) * np.sqrt(12.0)) if n > 2 else 0.0
    sharpe = float((pnl.mean() * 12.0) / vol) if vol > 0 else 0.0
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


def load_prices(panel_csv: Path, universe: str) -> Tuple[pd.DataFrame, Optional[pd.DataFrame]]:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Instrument"] = df["Instrument"].astype(str)
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    if universe == "crypto":
        df = df[df["Instrument"].str.endswith("-USD")]

    # Do not forward-fill crypto prices: missing points often indicate data gaps that
    # can create artificial jumps when resumed.
    prices = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index()
    vols = None
    if "Volume" in df.columns:
        df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")
        vols = df.pivot_table(index="Date", columns="Instrument", values="Volume", aggfunc="last").sort_index()
        vols = vols.reindex(prices.index)
    return prices, vols


def to_monthly(prices: pd.DataFrame, volumes: Optional[pd.DataFrame]) -> Tuple[pd.DataFrame, pd.DataFrame, Optional[pd.DataFrame]]:
    # Month-end close
    px_m = prices.resample("ME").last()
    rets_m = px_m.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)
    vol_m = prices.pct_change(fill_method=None).rolling(20, min_periods=10).std(ddof=0).resample("ME").last() * np.sqrt(252.0)
    vol_m = vol_m.replace([np.inf, -np.inf], np.nan)
    volu_m = None
    if volumes is not None:
        volu_m = volumes.resample("ME").sum().replace([np.inf, -np.inf], np.nan)
    return px_m, rets_m, volu_m


def _rolling_beta_to_btc(rets_m: pd.DataFrame, window: int = 12, btc: str = "BTC-USD") -> pd.DataFrame:
    if btc not in rets_m.columns:
        return pd.DataFrame(index=rets_m.index, columns=rets_m.columns, dtype=float)
    r_btc = rets_m[btc]
    var = r_btc.rolling(window, min_periods=max(6, window // 2)).var(ddof=0)
    betas = {}
    for col in rets_m.columns:
        cov = rets_m[col].rolling(window, min_periods=max(6, window // 2)).cov(r_btc)
        betas[col] = (cov / var).replace([np.inf, -np.inf], np.nan)
    return pd.DataFrame(betas)


def compute_features(px_m: pd.DataFrame, rets_m: pd.DataFrame, vol_m: pd.DataFrame, volu_m: Optional[pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    mom1 = px_m / px_m.shift(1) - 1.0
    mom3 = px_m / px_m.shift(3) - 1.0
    mom12 = px_m / px_m.shift(12) - 1.0
    rev1 = -(px_m / px_m.shift(1) - 1.0)
    dd = px_m / px_m.cummax() - 1.0
    beta_btc = _rolling_beta_to_btc(rets_m, window=12)
    # crude "idiosyncratic vol" proxy: vol minus |beta|*btc_vol
    if "BTC-USD" in rets_m.columns:
        btc_vol = rets_m["BTC-USD"].rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
        idio = (rets_m.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)) - beta_btc.abs().mul(btc_vol, axis=0)
    else:
        idio = rets_m.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
    vtrend = None
    if volu_m is not None:
        vtrend = volu_m.rolling(3, min_periods=2).mean() / volu_m.rolling(12, min_periods=6).mean() - 1.0
    return {
        "mom1": mom1,
        "mom3": mom3,
        "mom12": mom12,
        "rev1": rev1,
        "vol": vol_m,
        "dd": dd,
        "beta_btc": beta_btc,
        "idio_vol": idio,
        "vtrend": vtrend,
        "rets": rets_m,
    }


def _standardize_cross_section(x: pd.Series) -> pd.Series:
    x = x.replace([np.inf, -np.inf], np.nan).dropna()
    if x.empty:
        return x
    mu = float(x.mean())
    sd = float(x.std(ddof=0))
    if sd == 0:
        return x * 0.0
    return (x - mu) / sd


def _btc_regime(prices_daily: pd.DataFrame, btc: str = "BTC-USD", ma_days: int = 200) -> pd.Series:
    if btc not in prices_daily.columns:
        return pd.Series(index=prices_daily.index, data=True)
    px = prices_daily[btc].ffill()
    ma = px.rolling(ma_days, min_periods=max(50, ma_days // 2)).mean()
    regime = (px > ma).fillna(False)
    return regime


def backtest(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    train_months: int,
    top_n: int,
    max_weight: float,
    rebalance_months: int,
    cost_bps: float,
    slippage_bps: float,
    slippage_cap_bps: float,
    slippage_ref_participation: float,
    target_vol: float,
    dd_throttle: float,
    dd_floor_exposure: float,
    btc_filter: bool,
    seed: int,
    min_history_months: int,
    max_assets: int,
    max_abs_monthly_return: float = 3.0,
    min_median_dollar_volume: float = 0.0,
    dollar_volume_lookback_months: int = 6,
    exclude_numeric_tickers: bool = True,
) -> Dict[str, object]:
    from sklearn.linear_model import Ridge

    px_m, rets_m, volu_m = to_monthly(prices_daily, volumes_daily)
    vol_m = prices_daily.pct_change(fill_method=None).rolling(20, min_periods=10).std(ddof=0).resample("ME").last() * np.sqrt(252.0)
    feats = compute_features(px_m, rets_m, vol_m, volu_m)

    # restrict to assets with some history
    rets_m = feats["rets"]
    cols = [c for c in rets_m.columns if rets_m[c].dropna().shape[0] >= min_history_months]
    # Keep the most liquid/available names by history length.
    cols = sorted(cols, key=lambda c: rets_m[c].dropna().shape[0], reverse=True)
    if max_assets > 0:
        cols = cols[:max_assets]

    # Basic data hygiene filters (yfinance crypto sometimes has bad mappings / unit quirks).
    if exclude_numeric_tickers:
        cols = [c for c in cols if not any(ch.isdigit() for ch in c)]
    if cols:
        rets_tmp = rets_m[cols].replace([np.inf, -np.inf], np.nan)
        max_abs = rets_tmp.abs().max(skipna=True)
        cols = [c for c in cols if float(max_abs.get(c, 0.0)) <= max_abs_monthly_return]

    dv_m = (volu_m * px_m).replace([np.inf, -np.inf], np.nan) if volu_m is not None else None
    dv_med = None
    if dv_m is not None and min_median_dollar_volume > 0:
        lookback = max(3, int(dollar_volume_lookback_months))
        dv_med = dv_m.rolling(lookback, min_periods=max(2, lookback // 2)).median()

    if len(cols) < max(5, top_n):
        return {"error": f"Insufficient assets with history: {len(cols)}"}
    for k in list(feats.keys()):
        if feats[k] is None:
            continue
        feats[k] = feats[k][cols]

    dates = rets_m.index
    model = Ridge(alpha=1.0, random_state=seed)

    weights_hist = []
    pnl = []
    pnl_dates = []

    # regime series on month-end
    btc_regime = _btc_regime(prices_daily).resample("ME").last() if btc_filter else pd.Series(index=dates, data=True)

    w_prev = pd.Series(0.0, index=cols)

    for t in range(train_months, len(dates) - 1):
        dt = dates[t]

        if (t - train_months) % rebalance_months != 0 and weights_hist:
            # hold weights
            w = weights_hist[-1][1]
        else:
            # Build train set: cross-sectional rows over past train_months
            X_rows = []
            y_rows = []
            for j in range(t - train_months, t):
                d = dates[j]
                x = pd.DataFrame(
                    {
                        "mom1": _standardize_cross_section(feats["mom1"].loc[d]),
                        "mom3": _standardize_cross_section(feats["mom3"].loc[d]),
                        "mom12": _standardize_cross_section(feats["mom12"].loc[d]),
                        "rev1": _standardize_cross_section(feats["rev1"].loc[d]),
                        "vol": _standardize_cross_section(feats["vol"].loc[d]),
                        "dd": _standardize_cross_section(feats["dd"].loc[d]),
                        "beta_btc": _standardize_cross_section(feats["beta_btc"].loc[d]),
                        "idio_vol": _standardize_cross_section(feats["idio_vol"].loc[d]),
                    }
                )
                if feats["vtrend"] is not None:
                    x["vtrend"] = _standardize_cross_section(feats["vtrend"].loc[d])
                y = rets_m.shift(-1).loc[d]
                frame = x.join(y.rename("y")).dropna()
                if frame.empty:
                    continue
                frame = frame.assign(date=d)
                frame.index = pd.MultiIndex.from_product([[d], frame.index], names=["date", "ticker"])
                X_rows.append(frame.drop(columns=["y", "date"]))
                y_rows.append(frame["y"])
            if not X_rows:
                continue
            X = pd.concat(X_rows)
            y = pd.concat(y_rows)
            if X.shape[0] != y.shape[0]:
                # Defensive guard for any unexpected alignment issues.
                joined = X.join(y.rename("y")).dropna()
                X = joined.drop(columns=["y"])
                y = joined["y"]
            if X.empty or y.empty:
                continue

            model.fit(X.to_numpy(), y.to_numpy())

            # Score current cross-section
            x_now = pd.DataFrame(
                {
                    "mom1": _standardize_cross_section(feats["mom1"].loc[dt]),
                    "mom3": _standardize_cross_section(feats["mom3"].loc[dt]),
                    "mom12": _standardize_cross_section(feats["mom12"].loc[dt]),
                    "rev1": _standardize_cross_section(feats["rev1"].loc[dt]),
                    "vol": _standardize_cross_section(feats["vol"].loc[dt]),
                    "dd": _standardize_cross_section(feats["dd"].loc[dt]),
                    "beta_btc": _standardize_cross_section(feats["beta_btc"].loc[dt]),
                    "idio_vol": _standardize_cross_section(feats["idio_vol"].loc[dt]),
                }
            )
            if feats["vtrend"] is not None:
                x_now["vtrend"] = _standardize_cross_section(feats["vtrend"].loc[dt])
            x_now = x_now.dropna()
            if x_now.empty:
                continue

            # Enforce liquidity constraint at selection time (avoid picking illiquid names).
            if dv_m is not None and min_median_dollar_volume > 0 and dv_med is not None:
                dv_ok = dv_med.loc[dt].reindex(x_now.index).fillna(0.0) >= float(min_median_dollar_volume)
                if int(dv_ok.sum()) < max(5, top_n):
                    # If median-based filter is too strict, fall back to current month DV.
                    dv_now = dv_m.loc[dt].reindex(x_now.index).fillna(0.0)
                    dv_ok = dv_now >= float(min_median_dollar_volume)
                x_now = x_now.loc[dv_ok.values]
                if x_now.empty:
                    continue

            preds = pd.Series(model.predict(x_now.to_numpy()), index=x_now.index)

            # Long-only top N
            winners = preds.nlargest(top_n).index
            # Inverse vol weights within winners
            v = feats["vol"].loc[dt].reindex(winners).replace(0.0, np.nan)
            inv = (1.0 / v).replace([np.inf, -np.inf], np.nan).fillna(0.0)
            w = inv / inv.sum() if inv.sum() != 0 else pd.Series(1.0 / len(winners), index=winners)
            w = w.clip(upper=max_weight)
            w = w / w.sum() if w.sum() != 0 else w

            # Smooth to reduce churn (passive)
            w = 0.7 * w_prev.reindex(w.index).fillna(0.0) + 0.3 * w
            w = w / w.sum() if w.sum() != 0 else w

        # Apply BTC regime filter to exposure
        exposure = 1.0 if bool(btc_regime.loc[dt]) else 0.3

        # Convert weights into full vector
        w_full = pd.Series(0.0, index=cols)
        w_full.loc[w.index] = w.values
        w_full = w_full * exposure

        # Turnover cost on rebalance months only
        turnover = float((w_full - w_prev).abs().sum())
        cost = turnover * (cost_bps / 1e4)

        # Slippage cost: scales with participation (trade notional / dollar volume).
        if slippage_bps > 0 and dv_m is not None:
            dv = dv_m.loc[dt].reindex(cols).replace([np.inf, -np.inf], np.nan).fillna(0.0)
            trade = (w_full - w_prev).abs().reindex(cols).fillna(0.0)
            participation = (trade / dv.replace(0.0, np.nan)).fillna(0.0)
            ref = float(max(1e-9, slippage_ref_participation))
            slip_bps_i = float(slippage_bps) * np.sqrt(participation / ref)
            slip_bps_i = np.clip(slip_bps_i, 0.0, float(slippage_cap_bps))
            cost = float(cost + float((trade * (slip_bps_i / 1e4)).sum()))

        # Next month return realized
        next_ret = rets_m.shift(-1).loc[dt].reindex(cols).fillna(0.0)
        gross = float((w_full * next_ret).sum())
        net = gross - cost

        pnl.append(net)
        pnl_dates.append(dt)
        weights_hist.append((dt, w_full.copy()))
        w_prev = w_full

    pnl_s = pd.Series(pnl, index=pd.DatetimeIndex(pnl_dates)).sort_index()

    # Portfolio-level vol targeting (monthly)
    if target_vol > 0 and len(pnl_s) >= 12:
        roll = pnl_s.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
        scale = (target_vol / roll).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, 2.0)
        pnl_s = pnl_s * scale.shift(1).fillna(0.0)

    equity = (1.0 + pnl_s.fillna(0.0)).cumprod()

    # Drawdown throttle overlay (post-hoc, using only past equity)
    if dd_throttle > 0:
        peak = equity.cummax()
        dd = equity / peak - 1.0
        throttle = pd.Series(1.0, index=equity.index)
        throttle[dd <= -dd_throttle] = dd_floor_exposure
        throttle = throttle.ffill().clip(lower=dd_floor_exposure, upper=1.0)
        pnl_s = pnl_s * throttle.shift(1).fillna(1.0)
        equity = (1.0 + pnl_s.fillna(0.0)).cumprod()

    return {
        "pnl": pnl_s,
        "equity": equity,
        "weights": weights_hist,
        "perf": asdict(_perf(pnl_s)),
        "universe": cols,
    }


def make_benchmarks(
    prices_daily: pd.DataFrame,
    universe: List[str],
    *,
    target_vol: float = 0.0,
    dd_throttle: float = 0.0,
    dd_floor_exposure: float = 1.0,
    cost_bps: float = 0.0,
    slippage_bps: float = 0.0,
    slippage_cap_bps: float = 0.0,
    slippage_ref_participation: float = 0.001,
) -> Dict[str, pd.Series]:
    px_m = prices_daily[universe].resample("ME").last()
    rets_m = px_m.pct_change(fill_method=None).fillna(0.0)
    benches: Dict[str, pd.Series] = {}

    def apply_costs_fixed_weights(returns: pd.DataFrame, weights: pd.Series, cost_bps: float) -> pd.Series:
        r = returns.reindex(columns=weights.index).fillna(0.0)
        w_tgt = weights / weights.sum() if weights.sum() != 0 else weights
        w_prev = w_tgt.copy()
        out = []
        for dt in r.index:
            # Drift weights by realized returns, then rebalance back to target and pay turnover.
            drift = w_prev * (1.0 + r.loc[dt])
            drift = drift / drift.sum() if drift.sum() != 0 else drift
            turnover = float((w_tgt - drift).abs().sum())
            cost = turnover * (cost_bps / 1e4)
            # Benchmarks: keep slippage disabled by default (can be added later with a dedicated volume input).
            out.append(float((w_tgt * r.loc[dt]).sum()) - float(cost))
            w_prev = w_tgt
        return pd.Series(out, index=r.index)

    def apply_risk_overlays(pnl_m: pd.Series, target_vol: float, dd_throttle: float, dd_floor_exposure: float, max_leverage: float) -> pd.Series:
        pnl_s = pnl_m.copy().fillna(0.0)
        if target_vol > 0 and len(pnl_s) >= 12:
            roll = pnl_s.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
            scale = (target_vol / roll).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, max_leverage)
            pnl_s = pnl_s * scale.shift(1).fillna(0.0)

        if dd_throttle > 0:
            equity = (1.0 + pnl_s.fillna(0.0)).cumprod()
            peak = equity.cummax()
            dd = equity / peak - 1.0
            throttle = pd.Series(1.0, index=equity.index)
            throttle[dd <= -dd_throttle] = dd_floor_exposure
            throttle = throttle.ffill().clip(lower=dd_floor_exposure, upper=1.0)
            pnl_s = pnl_s * throttle.shift(1).fillna(1.0)
        return pnl_s

    benches["equal_weight"] = rets_m.mean(axis=1, skipna=True)

    if "BTC-USD" in universe:
        benches["btc"] = rets_m["BTC-USD"]

    if "BTC-USD" in universe and "ETH-USD" in universe:
        # Explicitly rebalance monthly and optionally apply turnover cost.
        w = pd.Series({"BTC-USD": 0.6, "ETH-USD": 0.4})
        benches["btc_eth_60_40"] = apply_costs_fixed_weights(rets_m[["BTC-USD", "ETH-USD"]], w, cost_bps=0.0)

    # Add versions with transaction costs for rebalance-heavy benchmarks.
    if cost_bps > 0:
        eq_w = pd.Series(1.0, index=universe)
        benches["equal_weight_costed"] = apply_costs_fixed_weights(rets_m[universe], eq_w, cost_bps=cost_bps)
        if "BTC-USD" in universe and "ETH-USD" in universe:
            w = pd.Series({"BTC-USD": 0.6, "ETH-USD": 0.4})
            benches["btc_eth_60_40_costed"] = apply_costs_fixed_weights(rets_m[["BTC-USD", "ETH-USD"]], w, cost_bps=cost_bps)

    max_lev = 2.0
    max_lev_nolev = 1.0
    for k in list(benches.keys()):
        benches[f"{k}_risk_managed"] = apply_risk_overlays(
            benches[k], target_vol=target_vol, dd_throttle=dd_throttle, dd_floor_exposure=dd_floor_exposure, max_leverage=max_lev
        )
        benches[f"{k}_risk_managed_nolev"] = apply_risk_overlays(
            benches[k],
            target_vol=target_vol,
            dd_throttle=dd_throttle,
            dd_floor_exposure=dd_floor_exposure,
            max_leverage=max_lev_nolev,
        )

    return benches


def sample_windows(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    samples: int,
    window_months: int,
    seed: int,
    **kwargs,
) -> Dict[str, object]:
    px_m = prices_daily.resample("ME").last()
    dates = px_m.index.dropna()
    train_months = int(kwargs.get("train_months", 36))
    if len(dates) < window_months + train_months + 2:
        return {"error": "not enough months for sampling"}

    rng = np.random.default_rng(seed)
    start_max = len(dates) - window_months
    starts = rng.integers(0, start_max, size=samples)

    # Adjust history requirement for windowed evaluation.
    if "min_history_months" in kwargs:
        kwargs["min_history_months"] = int(min(kwargs["min_history_months"], max(12, window_months - 6)))

    out = []
    for s in starts:
        start = dates[s]
        end = dates[s + window_months - 1]
        pdw = prices_daily[(prices_daily.index >= start) & (prices_daily.index <= end)]
        vdw = volumes_daily[(volumes_daily.index >= start) & (volumes_daily.index <= end)] if volumes_daily is not None else None
        res = backtest(pdw, vdw, seed=seed, **kwargs)
        if "error" in res:
            continue
        row = res["perf"]
        row["window_start"] = str(pd.Timestamp(start).date())
        row["window_end"] = str(pd.Timestamp(end).date())
        out.append(row)
    return {"samples": out}


def main() -> int:
    p = argparse.ArgumentParser(description="Passive crypto ML portfolio backtest.")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--train-months", type=int, default=36)
    p.add_argument("--top-n", type=int, default=5)
    p.add_argument("--max-weight", type=float, default=0.35)
    p.add_argument("--rebalance-months", type=int, default=1)
    p.add_argument("--cost-bps", type=float, default=20.0)
    p.add_argument("--slippage-bps", type=float, default=0.0, help="Base slippage in bps at reference participation")
    p.add_argument("--slippage-cap-bps", type=float, default=50.0, help="Max per-asset slippage in bps")
    p.add_argument("--slippage-ref-participation", type=float, default=0.001, help="Reference participation rate (e.g. 0.001=0.1%)")
    p.add_argument("--target-vol", type=float, default=0.20)
    p.add_argument("--dd-throttle", type=float, default=0.25)
    p.add_argument("--dd-floor-exposure", type=float, default=0.35)
    p.add_argument("--no-btc-filter", action="store_true")
    p.add_argument("--min-history-months", type=int, default=48, help="Minimum monthly observations required per asset")
    p.add_argument("--max-assets", type=int, default=20, help="Max assets to consider (by history length)")
    p.add_argument("--max-abs-monthly-return", type=float, default=3.0, help="Exclude assets with abs monthly return above this threshold (e.g. 3=300%)")
    p.add_argument("--min-median-dollar-volume", type=float, default=0.0, help="Liquidity filter: min trailing median monthly $ volume (0 disables)")
    p.add_argument("--dollar-volume-lookback-months", type=int, default=6, help="Lookback window for median $ volume filter")
    p.add_argument("--allow-numeric-tickers", action="store_true", help="Do not exclude tickers containing digits")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/crypto_passive_ml"))
    p.add_argument("--sample", action="store_true", help="Run window sampling robustness")
    p.add_argument("--samples", type=int, default=30)
    p.add_argument("--window-months", type=int, default=60)
    args = p.parse_args()

    prices_daily, vols_daily = load_prices(args.panel, universe="crypto")
    result = backtest(
        prices_daily=prices_daily,
        volumes_daily=vols_daily,
        train_months=args.train_months,
        top_n=args.top_n,
        max_weight=args.max_weight,
        rebalance_months=args.rebalance_months,
        cost_bps=args.cost_bps,
        slippage_bps=args.slippage_bps,
        slippage_cap_bps=args.slippage_cap_bps,
        slippage_ref_participation=args.slippage_ref_participation,
        target_vol=args.target_vol,
        dd_throttle=args.dd_throttle,
        dd_floor_exposure=args.dd_floor_exposure,
        btc_filter=not args.no_btc_filter,
        seed=args.seed,
        min_history_months=args.min_history_months,
        max_assets=args.max_assets,
        max_abs_monthly_return=args.max_abs_monthly_return,
        min_median_dollar_volume=args.min_median_dollar_volume,
        dollar_volume_lookback_months=args.dollar_volume_lookback_months,
        exclude_numeric_tickers=not args.allow_numeric_tickers,
    )
    if "error" in result:
        print(result["error"])
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    pnl = result["pnl"]
    equity = result["equity"]
    (args.out_dir / "portfolio_returns_monthly.csv").write_text(pnl.to_csv(header=["return"]))
    (args.out_dir / "portfolio_equity_monthly.csv").write_text(equity.to_csv(header=["equity"]))
    (args.out_dir / "summary.json").write_text(json.dumps(result["perf"], indent=2))

    # Save weights as a wide CSV
    weights_hist = result["weights"]
    w_df = pd.DataFrame({str(dt.date()): w for dt, w in weights_hist}).T.fillna(0.0)
    w_df.index.name = "date"
    w_df.to_csv(args.out_dir / "weights_monthly.csv")

    # Benchmarks
    benches = make_benchmarks(
        prices_daily,
        universe=result["universe"],
        target_vol=float(args.target_vol),
        dd_throttle=float(args.dd_throttle),
        dd_floor_exposure=float(args.dd_floor_exposure),
        cost_bps=float(args.cost_bps),
        slippage_bps=float(args.slippage_bps),
        slippage_cap_bps=float(args.slippage_cap_bps),
        slippage_ref_participation=float(args.slippage_ref_participation),
    )
    bench_rows = {}
    for name, series in benches.items():
        bench_rows[name] = asdict(_perf(series.dropna()))
        (args.out_dir / f"bench_{name}_equity_monthly.csv").write_text(((1.0 + series.fillna(0.0)).cumprod()).to_csv(header=["equity"]))
    (args.out_dir / "benchmarks.json").write_text(json.dumps(bench_rows, indent=2))

    print("Model:", json.dumps(result["perf"], indent=2))
    print("Benchmarks:", json.dumps(bench_rows, indent=2))

    if args.sample:
        samp = sample_windows(
            prices_daily=prices_daily,
            volumes_daily=vols_daily,
            samples=args.samples,
            window_months=args.window_months,
            seed=args.seed,
            train_months=args.train_months,
            top_n=args.top_n,
            max_weight=args.max_weight,
            rebalance_months=args.rebalance_months,
            cost_bps=args.cost_bps,
            slippage_bps=args.slippage_bps,
            slippage_cap_bps=args.slippage_cap_bps,
            slippage_ref_participation=args.slippage_ref_participation,
            target_vol=args.target_vol,
            dd_throttle=args.dd_throttle,
            dd_floor_exposure=args.dd_floor_exposure,
            btc_filter=not args.no_btc_filter,
            min_history_months=args.min_history_months,
            max_assets=args.max_assets,
            max_abs_monthly_return=args.max_abs_monthly_return,
            min_median_dollar_volume=args.min_median_dollar_volume,
            dollar_volume_lookback_months=args.dollar_volume_lookback_months,
            exclude_numeric_tickers=not args.allow_numeric_tickers,
        )
        (args.out_dir / "sampling.json").write_text(json.dumps(samp, indent=2))
        print(f"✅ Wrote sampling to {args.out_dir / 'sampling.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
