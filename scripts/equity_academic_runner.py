#!/usr/bin/env python3
"""
Equity Academic Allocation Model (Sharpe-Renaissance).

This script adapts the 'Sharpe-Renaissance' crypto logic for Equities,
integrating 'Cite-Finance' academic consensus where possible.

Key Differences from Crypto Version:
- Benchmark: SPY (S&P 500) instead of BTC.
- Regime: SPY 200-day MA.
- Factors: Standard academic factors (Momentum, Vol, Beta to SPY).
- Context: Loads 'research_context' JSONs to inform default parameters.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

# Allow local imports
_SR_ROOT = Path(__file__).resolve().parents[1]
if str(_SR_ROOT) not in sys.path:
    sys.path.insert(0, str(_SR_ROOT))

# Try to import CiteAgentClient if available (for future live fetching)
try:
    from research.cite_agent_client import CiteAgentClient
except ImportError:
    CiteAgentClient = None


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


def load_prices(panel_csv: Path) -> Tuple[pd.DataFrame, Optional[pd.DataFrame]]:
    """Loads a generic equity panel (Instrument, Date, Price_Close, Volume)."""
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    required = {"Instrument", "Date", "Price_Close"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV missing columns: {required - set(df.columns)}")

    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Instrument"] = df["Instrument"].astype(str)
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])

    prices = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index()
    
    vols = None
    if "Volume" in df.columns:
        df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")
        vols = df.pivot_table(index="Date", columns="Instrument", values="Volume", aggfunc="last").sort_index()
        vols = vols.reindex(prices.index)
        
    return prices, vols


def load_fundamentals(fund_csv: Path) -> Optional[Dict[str, pd.DataFrame]]:
    if not fund_csv or not fund_csv.exists():
        return None
    df = pd.read_csv(fund_csv, parse_dates=["Date"])
    metrics = {}
    for col in ["PE_Ratio", "Debt_To_Equity"]:
        if col in df.columns:
            metrics[col] = df.pivot_table(index="Date", columns="Instrument", values=col, aggfunc="last").sort_index()
    return metrics


def to_monthly(prices: pd.DataFrame, volumes: Optional[pd.DataFrame]) -> Tuple[pd.DataFrame, pd.DataFrame, Optional[pd.DataFrame]]:
    px_m = prices.resample("ME").last()
    rets_m = px_m.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)
    vol_m = prices.pct_change(fill_method=None).rolling(60, min_periods=20).std(ddof=0).resample("ME").last() * np.sqrt(252.0)
    vol_m = vol_m.replace([np.inf, -np.inf], np.nan)
    
    volu_m = None
    if volumes is not None:
        volu_m = volumes.resample("ME").sum().replace([np.inf, -np.inf], np.nan)
    return px_m, rets_m, volu_m


def _rolling_beta_to_market(rets_m: pd.DataFrame, window: int = 12, market_ticker: str = "SPY") -> pd.DataFrame:
    if market_ticker not in rets_m.columns:
        return pd.DataFrame(0.0, index=rets_m.index, columns=rets_m.columns)
    
    r_mkt = rets_m[market_ticker]
    var = r_mkt.rolling(window, min_periods=max(6, window // 2)).var(ddof=0)
    betas = {}
    for col in rets_m.columns:
        cov = rets_m[col].rolling(window, min_periods=max(6, window // 2)).cov(r_mkt)
        betas[col] = (cov / var).replace([np.inf, -np.inf], np.nan)
    return pd.DataFrame(betas)


def compute_features(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    px_m: pd.DataFrame,
    rets_m: pd.DataFrame,
    vol_m: pd.DataFrame,
    market_ticker: str,
    *,
    include_max: bool,
    include_amihud: bool,
    fundamentals: Optional[Dict[str, pd.DataFrame]] = None,
) -> Dict[str, pd.DataFrame]:
    mom1 = px_m / px_m.shift(1) - 1.0
    mom3 = px_m / px_m.shift(3) - 1.0
    mom12 = px_m / px_m.shift(12) - 1.0
    rev1 = -(px_m / px_m.shift(1) - 1.0)
    dd = px_m / px_m.cummax() - 1.0
    
    beta = _rolling_beta_to_market(rets_m, window=24, market_ticker=market_ticker)
    
    if market_ticker in rets_m.columns:
        mkt_vol = rets_m[market_ticker].rolling(24, min_periods=12).std(ddof=0) * np.sqrt(12.0)
        idio = (rets_m.rolling(24, min_periods=12).std(ddof=0) * np.sqrt(12.0)) - beta.abs().mul(mkt_vol, axis=0)
    else:
        idio = rets_m.rolling(24, min_periods=12).std(ddof=0) * np.sqrt(12.0)

    rets_d = prices_daily.pct_change(fill_method=None)
    max_d = None
    if include_max:
        max_d = rets_d.rolling(21, min_periods=15).max().resample("ME").last()

    amihud = None
    if include_amihud and volumes_daily is not None:
        dv_d = (prices_daily * volumes_daily).replace(0.0, np.nan)
        illiq_d = (rets_d.abs() / dv_d).replace([np.inf, -np.inf], np.nan)
        illiq_d = illiq_d * 1e6
        amihud = illiq_d.rolling(21, min_periods=15).mean().resample("ME").last()

    earnings_yield = None
    low_leverage = None
    if fundamentals:
        if "PE_Ratio" in fundamentals:
            pe = fundamentals["PE_Ratio"].reindex(px_m.index).ffill()
            ey = 1.0 / pe.replace(0.0, np.nan)
            earnings_yield = ey
        if "Debt_To_Equity" in fundamentals:
            de = fundamentals["Debt_To_Equity"].reindex(px_m.index).ffill()
            low_leverage = -1.0 * de

    return {
        "mom1": mom1,
        "mom3": mom3,
        "mom12": mom12,
        "rev1": rev1,
        "vol": vol_m,
        "dd": dd,
        "beta": beta,
        "idio_vol": idio,
        "max_ret": max_d,
        "amihud": amihud,
        "earnings_yield": earnings_yield,
        "low_leverage": low_leverage,
        "rets": rets_m,
    }


def _standardize_cross_section_keep_index(x: pd.Series) -> pd.Series:
    x = x.replace([np.inf, -np.inf], np.nan)
    valid = x.dropna()
    if valid.empty:
        return pd.Series(0.0, index=x.index)
    mu = float(valid.mean())
    sd = float(valid.std(ddof=0))
    if sd == 0:
        out = x * 0.0
    else:
        out = (x - mu) / sd
    return out.fillna(0.0)


def _market_regime(prices_daily: pd.DataFrame, market_ticker: str = "SPY", ma_days: int = 200) -> pd.Series:
    if market_ticker not in prices_daily.columns:
        return pd.Series(index=prices_daily.index, data=True)
    px = prices_daily[market_ticker].ffill()
    ma = px.rolling(ma_days, min_periods=max(50, ma_days // 2)).mean()
    regime = (px > ma).fillna(False)
    return regime


def load_academic_context(context_dir: Path) -> Dict[str, Any]:
    context = {}
    if not context_dir.exists():
        return context
    for f in context_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            context[f.stem] = data
        except Exception:
            continue
    return context


def run_equity_backtest(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    market_ticker: str,
    train_months: int,
    top_n: int,
    max_weight: float,
    rebalance_months: int,
    cost_bps: float,
    target_vol: float,
    dd_throttle: float,
    dd_floor_exposure: float,
    regime_filter: bool,
    regime_off_exposure: float,
    seed: int,
    min_history_months: int,
    max_assets: int,
    include_max: bool,
    include_amihud: bool,
    exclude: List[str],
    fundamentals: Optional[Dict[str, pd.DataFrame]] = None,
    factor_set: str = "parsimonious",
    side: str = "long_only",
    bottom_n: int = 0,
    max_leverage: float = 1.5,
    slippage_bps: float = 0.0,
    slippage_cap_bps: float = 25.0,
    slippage_ref_participation: float = 0.001,
    portfolio_usd: float = 0.0,
    min_median_dollar_volume: float = 0.0,
    dollar_volume_lookback_months: int = 6,
) -> Dict[str, object]:
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
    
    px_m, rets_m, volu_m = to_monthly(prices_daily, volumes_daily)
    vol_m = prices_daily.pct_change(fill_method=None).rolling(60, min_periods=20).std(ddof=0).resample("ME").last() * np.sqrt(252.0)
    dv_med = _median_monthly_dollar_volume(px_m, volu_m, lookback_months=int(dollar_volume_lookback_months))
    
    feats = compute_features(
        prices_daily,
        volumes_daily,
        px_m,
        rets_m,
        vol_m,
        market_ticker,
        include_max=include_max,
        include_amihud=include_amihud,
        fundamentals=fundamentals,
    )
    
    if factor_set == "parsimonious":
        feature_keys = ["mom1", "mom3", "mom12", "vol", "beta", "idio_vol"]
    elif factor_set == "quality":
        feature_keys = ["mom1", "mom3", "mom12", "vol", "beta", "earnings_yield", "low_leverage"]
    else:
        feature_keys = ["mom1", "mom3", "mom12", "vol", "beta", "idio_vol", "max_ret", "amihud"]

    cols = [c for c in rets_m.columns if rets_m[c].dropna().shape[0] >= min_history_months]
    exclude_set = {market_ticker, *exclude}
    cols = [c for c in cols if c not in exclude_set]
    cols = sorted(cols, key=lambda c: rets_m[c].dropna().shape[0], reverse=True)
    if max_assets > 0:
        cols = cols[:max_assets]

    if len(cols) < top_n:
        return {"error": f"Insufficient assets: {len(cols)}"}
    for k in list(feats.keys()):
        if feats[k] is None: continue
        feats[k] = feats[k][cols]

    dates = rets_m.index
    model = Ridge(alpha=1.0, random_state=seed)

    weights_hist = []
    pnl = []
    pnl_dates = []

    market_regime = _market_regime(prices_daily, market_ticker).resample("ME").last() if regime_filter else pd.Series(index=dates, data=True)
    w_prev = pd.Series(0.0, index=cols)

    for t in range(train_months, len(dates) - 1):
        dt = dates[t]
        if (t - train_months) % rebalance_months != 0 and weights_hist:
            w = weights_hist[-1][1]
        else:
            X_rows = []
            y_rows = []
            for j in range(t - train_months, t):
                d = dates[j]
                features_dict = {}
                for key in feature_keys:
                    if feats.get(key) is not None:
                         features_dict[key] = feats[key].loc[d]
                if not features_dict: continue
                x_df = pd.DataFrame({k: _standardize_cross_section_keep_index(v) for k, v in features_dict.items()})
                y = rets_m.shift(-1).loc[d]
                frame = x_df.join(y.rename("y"))
                frame = frame.replace([np.inf, -np.inf], np.nan).dropna(subset=["y"])
                if frame.empty: continue
                X_rows.append(frame.drop(columns=["y"]))
                y_rows.append(frame["y"])

            if not X_rows: continue
            X = pd.concat(X_rows)
            y = pd.concat(y_rows)
            model.fit(X.to_numpy(), y.to_numpy())
            
            features_now = {}
            for key in feature_keys:
                if feats.get(key) is not None:
                    features_now[key] = feats[key].loc[dt]
            if not features_now: continue
            x_now = pd.DataFrame({k: _standardize_cross_section_keep_index(v) for k, v in features_now.items()})
            x_now = x_now.replace([np.inf, -np.inf], np.nan).fillna(0.0)
            if x_now.empty: continue
            
            preds = pd.Series(model.predict(x_now.to_numpy()), index=x_now.index)
            winners = preds.nlargest(top_n).index.tolist()
            if dv_med is not None and float(min_median_dollar_volume) > 0:
                dv_t = dv_med.loc[dt, winners] if dt in dv_med.index else pd.Series(index=winners, dtype=float)
                winners = [a for a in winners if float(dv_t.get(a, 0.0)) >= float(min_median_dollar_volume)]
                if not winners:
                    winners = w_prev[w_prev > 0].index.tolist()
            if not winners:
                continue
            if str(side).lower() == "long_short":
                bn = int(bottom_n) if int(bottom_n) > 0 else int(top_n)
                losers = preds.nsmallest(bn).index.tolist()
                if dv_med is not None and float(min_median_dollar_volume) > 0:
                    dv_t = dv_med.loc[dt, losers] if dt in dv_med.index else pd.Series(index=losers, dtype=float)
                    losers = [a for a in losers if float(dv_t.get(a, 0.0)) >= float(min_median_dollar_volume)]
                if not losers:
                    losers = []

                w = pd.Series(0.0, index=cols, dtype=float)
                w.loc[winners] = 1.0 / float(len(winners))
                if losers:
                    w.loc[losers] = -1.0 / float(len(losers))

                gross = float(w.abs().sum())
                if gross > 0:
                    w = w / gross
                w = w.clip(lower=-float(max_weight), upper=float(max_weight))
                gross = float(w.abs().sum())
                if gross > 0:
                    w = w / gross

                # Smooth toward previous weights to reduce turnover.
                w = 0.8 * w_prev.reindex(cols).fillna(0.0) + 0.2 * w.reindex(cols).fillna(0.0)
                gross = float(w.abs().sum())
                if gross > 0:
                    w = w / gross
            else:
                w = pd.Series(1.0 / len(winners), index=winners)
                w = w.clip(upper=max_weight)
                w = w / w.sum() if w.sum() > 0 else w
                w = 0.8 * w_prev.reindex(w.index).fillna(0.0) + 0.2 * w
                w = w / w.sum() if w.sum() > 0 else w

        exposure = 1.0 if bool(market_regime.loc[dt]) else float(regime_off_exposure)
        if str(side).lower() == "long_short":
            w_full = w.reindex(cols).fillna(0.0) * float(exposure)
        else:
            w_full = pd.Series(0.0, index=cols)
            w_full.loc[w.index] = w.values
            w_full = w_full * exposure
        
        turnover = float((w_full - w_prev).abs().sum())
        cost = turnover * (cost_bps / 1e4)
        slip = _slippage_cost_monthly(
            turnover=turnover,
            portfolio_usd=float(portfolio_usd),
            dollar_volume=(dv_med.loc[dt, w_full[w_full != 0.0].index] if dv_med is not None and dt in dv_med.index else None),
            slippage_bps=float(slippage_bps),
            slippage_cap_bps=float(slippage_cap_bps),
            slippage_ref_participation=float(slippage_ref_participation),
        )
        next_ret = rets_m.shift(-1).loc[dt].reindex(cols).fillna(0.0)
        net = float((w_full * next_ret).sum()) - cost - slip
        pnl.append(net)
        pnl_dates.append(dt)
        weights_hist.append((dt, w_full.copy()))
        w_prev = w_full

    pnl_s = pd.Series(pnl, index=pd.DatetimeIndex(pnl_dates)).sort_index()
    if target_vol > 0 and len(pnl_s) >= 12:
        roll_vol = pnl_s.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
        scale = (target_vol / roll_vol).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, float(max_leverage))
        pnl_s = pnl_s * scale.shift(1).fillna(0.0)

    equity = (1.0 + pnl_s.fillna(0.0)).cumprod()
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
        "market_regime": market_regime,
    }


def make_benchmarks(
    prices_daily: pd.DataFrame,
    volumes_daily: Optional[pd.DataFrame],
    market_ticker: str,
    target_vol: float,
    dd_throttle: float,
    dd_floor_exposure: float,
    regime_filter: bool,
    regime_off_exposure: float,
    cost_bps: float = 0.0,
    slippage_bps: float = 0.0,
    slippage_cap_bps: float = 25.0,
    slippage_ref_participation: float = 0.001,
    portfolio_usd: float = 0.0,
    market_regime: Optional[pd.Series] = None,
) -> Dict[str, pd.Series]:
    def _median_monthly_dollar_volume(
        prices_m: pd.Series,
        volumes_m: Optional[pd.Series],
        *,
        lookback_months: int,
    ) -> Optional[pd.Series]:
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

    if market_ticker not in prices_daily.columns:
        return {}
    px = prices_daily[market_ticker]
    px_m = px.resample("ME").last()
    rets_m = px_m.pct_change(fill_method=None).fillna(0.0)
    benchmarks = {"raw": rets_m}
    dates = rets_m.index
    if market_regime is None:
        market_regime = _market_regime(prices_daily, market_ticker).resample("ME").last()
    exposure = market_regime.reindex(dates).fillna(True).astype(float)
    exposure[exposure == 0.0] = regime_off_exposure
    pos = exposure.shift(1).fillna(1.0).astype(float)
    pnl_s = rets_m * pos
    if target_vol > 0 and len(pnl_s) >= 12:
        roll_vol = pnl_s.rolling(12, min_periods=6).std(ddof=0) * np.sqrt(12.0)
        scale = (target_vol / roll_vol).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, 1.5)
        pos = pos * scale.shift(1).fillna(0.0)
        pnl_s = rets_m * pos
    equity = (1.0 + pnl_s.fillna(0.0)).cumprod()
    if dd_throttle > 0:
        peak = equity.cummax()
        dd = equity / peak - 1.0
        throttle = pd.Series(1.0, index=equity.index)
        throttle[dd <= -dd_throttle] = dd_floor_exposure
        throttle = throttle.ffill().clip(lower=dd_floor_exposure, upper=1.0)
        pos = pos * throttle.shift(1).fillna(1.0)
        pnl_s = rets_m * pos
    benchmarks["risk_managed"] = pnl_s

    if float(cost_bps) > 0 or float(slippage_bps) > 0:
        vol_m = None
        if volumes_daily is not None and market_ticker in volumes_daily.columns:
            vol_m = volumes_daily[market_ticker].resample("ME").sum(min_count=1)
        dv_med = _median_monthly_dollar_volume(px_m, vol_m, lookback_months=6)
        turn = pos.diff().abs().fillna(0.0)
        tc = (float(cost_bps) / 10000.0) * turn if float(cost_bps) > 0 else 0.0
        slip = []
        for t in pos.index:
            slip.append(
                _slippage_cost_monthly(
                    turnover=float(turn.loc[t]),
                    portfolio_usd=float(portfolio_usd),
                    dollar_volume=(dv_med.loc[[t]] if dv_med is not None and t in dv_med.index else None),
                    slippage_bps=float(slippage_bps),
                    slippage_cap_bps=float(slippage_cap_bps),
                    slippage_ref_participation=float(slippage_ref_participation),
                )
            )
        slip_s = pd.Series(slip, index=pos.index, dtype=float)
        benchmarks["risk_managed_costed"] = pnl_s - tc - slip_s
    return benchmarks


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
    start_max = len(dates) - window_months - train_months - 1
    if start_max < 1:
         return {"error": "history too short for window config"}
    starts = rng.integers(train_months, start_max + train_months, size=samples)
    out = []
    for s_idx in starts:
        m_start = dates[s_idx]
        m_end = dates[s_idx + window_months]
        start_date = dates[s_idx - train_months]
        end_date = m_end
        pdw = prices_daily[(prices_daily.index >= start_date) & (prices_daily.index <= end_date)]
        vdw = volumes_daily[(volumes_daily.index >= start_date) & (volumes_daily.index <= end_date)] if volumes_daily is not None else None
        if pdw.empty: continue
        res = run_equity_backtest(
            prices_daily=pdw,
            volumes_daily=vdw,
            seed=seed,
            **kwargs
        )
        if "error" in res: continue
        row = res["perf"]
        row["window_start"] = str(pd.Timestamp(start_date).date())
        row["trade_start"] = str(pd.Timestamp(m_start).date())
        row["window_end"] = str(pd.Timestamp(end_date).date())
        out.append(row)
    return {"samples": out}


def main():
    p = argparse.ArgumentParser(description="Equity Academic Runner (Sharpe-Renaissance)")
    p.add_argument("--panel", type=Path, required=True, help="Path to CSV with Date, Instrument, Price_Close")
    p.add_argument("--fundamentals-panel", type=Path, help="Optional Path to CSV with P/E, Debt/Equity (for Quality factor)")
    p.add_argument("--market-ticker", type=str, default="SPY", help="Benchmark ticker (e.g. SPY, QQQ)")
    p.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/equity_academic"))
    # Default is relative to repo root (where `data_lake/` lives).
    p.add_argument("--research-context-dir", type=Path, default=Path("data_lake/research_context"))
    p.add_argument("--universe", choices=["equities", "crypto", "all"], default="equities")
    p.add_argument("--exclude", nargs="*", default=[], help="Tickers to exclude from trading universe")
    
    p.add_argument("--train-months", type=int, default=36)
    p.add_argument("--target-vol", type=float, default=0.15)
    p.add_argument("--cost-bps", type=float, default=10.0)
    p.add_argument("--top-n", type=int, default=10)
    p.add_argument("--max-weight", type=float, default=0.20)
    p.add_argument("--rebalance-months", type=int, default=1)
    p.add_argument("--dd-throttle", type=float, default=0.20)
    p.add_argument("--dd-floor-exposure", type=float, default=0.50)
    p.add_argument("--regime-off-exposure", type=float, default=0.0)
    p.add_argument("--min-history-months", type=int, default=24)
    p.add_argument("--max-assets", type=int, default=50)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--factor-set", choices=["parsimonious", "zoo", "quality"], default="parsimonious")
    p.add_argument("--sample", action="store_true", help="Run robustness sampling")
    p.add_argument("--samples", type=int, default=30)
    p.add_argument("--window-months", type=int, default=60)
    
    args = p.parse_args()
    
    context = load_academic_context(args.research_context_dir)
    print(f"Loaded {len(context)} research topics from {args.research_context_dir}")
    
    if "Risk_Managed_Portfolios" in context:
        print(">> Incorporating 'Risk_Managed_Portfolios' context: clamping risk overlays to safe ranges.")
        args.target_vol = float(np.clip(args.target_vol, 0.10, 0.20))
        args.dd_throttle = float(np.clip(args.dd_throttle, 0.10, 0.35))
        args.dd_floor_exposure = float(np.clip(args.dd_floor_exposure, 0.10, 0.80))
        
    print(f"Loading panel from {args.panel}...")
    prices, vols = load_prices(args.panel)
    
    fundamentals = None
    if args.fundamentals_panel:
        print(f"Loading fundamentals from {args.fundamentals_panel}...")
        fundamentals = load_fundamentals(args.fundamentals_panel)

    if args.universe != "all":
        cols = list(prices.columns)
        if args.universe == "equities":
            keep = [c for c in cols if not str(c).endswith("-USD")]
        else:
            keep = [c for c in cols if str(c).endswith("-USD")]
        prices = prices[keep]
        if vols is not None:
            vols = vols[keep]
            
    if args.sample:
        print(f"Running {args.samples} random samples of {args.window_months} months...")
        samp = sample_windows(
            prices_daily=prices,
            volumes_daily=vols,
            samples=args.samples,
            window_months=args.window_months,
            seed=args.seed,
            market_ticker=args.market_ticker,
            train_months=args.train_months,
            top_n=args.top_n,
            max_weight=args.max_weight,
            rebalance_months=args.rebalance_months,
            cost_bps=args.cost_bps,
            target_vol=args.target_vol,
            dd_throttle=args.dd_throttle,
            dd_floor_exposure=args.dd_floor_exposure,
            regime_filter=True,
            regime_off_exposure=args.regime_off_exposure,
            min_history_months=args.min_history_months,
            max_assets=args.max_assets,
            include_max=(args.factor_set == "zoo"),
            include_amihud=(args.factor_set == "zoo"),
            exclude=list(args.exclude),
            fundamentals=fundamentals,
            factor_set=args.factor_set,
        )
        args.out_dir.mkdir(parents=True, exist_ok=True)
        (args.out_dir / "sampling.json").write_text(json.dumps(samp, indent=2))
        
        sharpes = [x["sharpe"] for x in samp["samples"]]
        cagrs = [x["cagr"] for x in samp["samples"]]
        print(f"\n=== Sampling Results ({len(sharpes)} runs) ===")
        print(f"Avg Sharpe: {np.mean(sharpes):.2f} (Min: {np.min(sharpes):.2f}, Max: {np.max(sharpes):.2f})")
        print(f"Avg CAGR:   {np.mean(cagrs)*100:.1f}%")
        print(f"Positive Runs: {sum(s > 0 for s in sharpes)}/{len(sharpes)}")
        return 0
    
    print(f"Running backtest (Benchmark: {args.market_ticker})...")
    res = run_equity_backtest(
        prices_daily=prices,
        volumes_daily=vols,
        market_ticker=args.market_ticker,
        train_months=args.train_months,
        top_n=args.top_n,
        max_weight=args.max_weight,
        rebalance_months=args.rebalance_months,
        cost_bps=args.cost_bps,
        target_vol=args.target_vol,
        dd_throttle=args.dd_throttle,
        dd_floor_exposure=args.dd_floor_exposure,
        regime_filter=True,
        regime_off_exposure=args.regime_off_exposure,
        seed=args.seed,
        min_history_months=args.min_history_months,
        max_assets=args.max_assets,
        include_max=(args.factor_set == "zoo"),
        include_amihud=(args.factor_set == "zoo"),
        exclude=list(args.exclude),
        fundamentals=fundamentals,
        factor_set=args.factor_set,
    )
    
    if "error" in res:
        print(f"Error: {res['error']}")
        return 1

    benches = make_benchmarks(
        prices,
        vols,
        market_ticker=args.market_ticker,
        target_vol=args.target_vol,
        dd_throttle=args.dd_throttle,
        dd_floor_exposure=args.dd_floor_exposure,
        regime_filter=True,
        regime_off_exposure=args.regime_off_exposure,
        market_regime=res.get("market_regime")
    )
    
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(res["perf"], indent=2))
    (args.out_dir / "equity_curve.csv").write_text(res["equity"].to_csv())
    
    if "risk_managed" in benches:
        strat_pnl = res["pnl"].fillna(0.0)
        bench_pnl = benches["risk_managed"].reindex(strat_pnl.index).fillna(0.0)
        excess = strat_pnl - bench_pnl
        excess_ann = float(excess.mean() * 12.0)
        tracking_error = float(excess.std(ddof=0) * np.sqrt(12.0))
        ir = excess_ann / tracking_error if tracking_error > 0 else 0.0
        bench_perf = asdict(_perf(bench_pnl))
        print("\n=== Comparative Performance ===")
        print(f"Strategy Sharpe:     {res['perf']['sharpe']:.2f}")
        print(f"Benchmark Sharpe:    {bench_perf['sharpe']:.2f} (Risk-Matched {args.market_ticker})")
        print(f"Excess Return:       {excess_ann*100:.1f}%")
        print(f"Information Ratio:   {ir:.2f}")
        print("===============================\n")
        
        for name, ser in benches.items():
            (args.out_dir / f"benchmark_{name}.csv").write_text(((1.0 + ser).cumprod()).to_csv())

    print(json.dumps(res["perf"], indent=2))
    print(f"Saved results to {args.out_dir}")

if __name__ == "__main__":
    main()
