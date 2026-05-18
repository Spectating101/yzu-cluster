#!/usr/bin/env python3
"""
Dynamic (regime-switching) meta-runner for the tactical engine.

Why this exists:
  A single static config tends to overfit. This runner:
    - learns a simple ML model online (logistic regression) to estimate P(risk-on)
    - combines it with hard risk rules (vol/crash) into a regime state
    - switches between multiple configs (risk_on / risk_off / crash)
    - optionally adds a protective-put overlay (binomial pricing)

Inputs:
  - A tidy daily panel (Instrument, Date, Price_Close)
  - Three config JSONs (same schema as spy_beater_leveraged_runner.py config-json)

Outputs:
  - summary.json
  - equity.csv / benchmark_equity.csv
  - regime_log.csv
  - weights.csv

Research only, not investment advice.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import sys

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from options_pricing import OptionSpec, crr_european_price  # noqa: E402
from spy_beater_leveraged_runner import load_prices  # noqa: E402


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
        cagr=float(cagr),
        sharpe=float(sharpe),
        mdd=float(dd),
        final_equity=float(eq.iloc[-1]) if not eq.empty else 1.0,
    )


def _features(px: pd.Series) -> pd.DataFrame:
    rets = px.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    eq = (1.0 + rets).cumprod()
    dd = (eq / eq.cummax() - 1.0).fillna(0.0)
    out = pd.DataFrame(
        {
            "ret_5": px / px.shift(5) - 1.0,
            "ret_21": px / px.shift(21) - 1.0,
            "ret_63": px / px.shift(63) - 1.0,
            "vol_20": rets.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0),
            "vol_60": rets.rolling(60, min_periods=30).std(ddof=0) * np.sqrt(252.0),
            "dd": dd,
        }
    ).replace([np.inf, -np.inf], np.nan)
    return out


def _train_model(x: pd.DataFrame, y: pd.Series) -> Pipeline:
    pipe = Pipeline(
        [
            ("scaler", StandardScaler(with_mean=True, with_std=True)),
            ("lr", LogisticRegression(max_iter=200, solver="lbfgs")),
        ]
    )
    pipe.fit(x.values, y.values)
    return pipe


def _config_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    # Fill missing keys to keep older configs compatible.
    d = dict(cfg)
    d.setdefault("allocate_residual_to_cash", False)
    d.setdefault("risk_off_vol_lookback", 20)
    d.setdefault("risk_off_vol_max", 0.0)
    d.setdefault("risk_off_crash_days", 5)
    d.setdefault("risk_off_crash_ret", 0.0)
    d.setdefault("risk_off_cooldown_days", 21)
    d.setdefault("cppi_floor_frac", 0.0)
    d.setdefault("cppi_multiplier", 0.0)
    d.setdefault("crypto_gate", False)
    d.setdefault("crypto_trend_sma_days", 200)
    d.setdefault("crypto_vol_lookback", 20)
    d.setdefault("crypto_vol_max", 0.0)
    d.setdefault("port_dd_stop", 0.0)
    d.setdefault("port_dd_cooldown_days", 21)
    d.setdefault("mom_floor", -1e9)
    d.setdefault("require_asset_trend", False)
    return d


def _as_weight_vector(cfg: Dict[str, Any], px: pd.DataFrame, dt: pd.Timestamp) -> pd.Series:
    # This mirrors the *basket selection* logic from spy_beater_leveraged_runner,
    # but allows params to switch every day. It does not attempt to replicate
    # each config's internal path-dependent state.
    benchmark = str(cfg["benchmark"])
    cash = str(cfg.get("cash", ""))
    tickers = sorted(set([benchmark, *cfg.get("risky", []), *cfg.get("defensive", []), *cfg.get("inverse", []), cash]))
    tickers = [t for t in tickers if t in px.columns]

    w = pd.Series(0.0, index=px.columns, dtype=float)
    if benchmark not in tickers:
        return w

    sma_days = int(cfg.get("sma_days", 200))
    mom_days = int(cfg.get("mom_days", 63))
    mom_floor = float(cfg.get("mom_floor", -1e9))
    require_asset_trend = bool(cfg.get("require_asset_trend", False))
    bear_mode = str(cfg.get("bear_mode", "defensive")).lower()
    top_k_risky = int(cfg.get("top_k_risky", 1))
    top_k_def = int(cfg.get("top_k_defensive", 1))
    core_weight = float(cfg.get("core_weight", 0.0))
    core_to_cash = bool(cfg.get("core_to_cash_when_bear", False))
    gross = float(cfg.get("max_gross", 1.0))

    bench = px[benchmark]
    bench_sma = bench.rolling(sma_days, min_periods=max(50, sma_days // 2)).mean()
    in_bull = bool((bench.loc[dt] > bench_sma.loc[dt]) if dt in bench_sma.index else False)

    def mom(series: pd.Series) -> float:
        if dt not in series.index:
            return 0.0
        prev = series.shift(mom_days).loc[dt]
        cur = series.loc[dt]
        if not np.isfinite(prev) or prev == 0 or not np.isfinite(cur):
            return 0.0
        return float(cur / prev - 1.0)

    def trend_ok(series: pd.Series) -> bool:
        if not require_asset_trend:
            return True
        sma = series.rolling(sma_days, min_periods=max(50, sma_days // 2)).mean()
        if dt not in sma.index:
            return False
        return bool(series.loc[dt] > sma.loc[dt])

    risky = [t for t in cfg.get("risky", []) if t in px.columns]
    defensive = [t for t in cfg.get("defensive", []) if t in px.columns]
    inverse = [t for t in cfg.get("inverse", []) if t in px.columns]

    if in_bull and risky:
        scores = {t: mom(px[t]) for t in risky if mom(px[t]) >= mom_floor and trend_ok(px[t])}
        basket = [t for t, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_k_risky]] if scores else []
    else:
        def_scores = {t: mom(px[t]) for t in defensive if mom(px[t]) >= mom_floor and trend_ok(px[t])}
        inv_scores = {t: mom(px[t]) for t in inverse if mom(px[t]) >= mom_floor and trend_ok(px[t])}
        if bear_mode == "inverse":
            src, k = inv_scores, top_k_def
        elif bear_mode == "best":
            src, k = {**def_scores, **inv_scores}, top_k_def
        else:
            src, k = def_scores, top_k_def
        basket = [t for t, _ in sorted(src.items(), key=lambda kv: kv[1], reverse=True)[:k]] if src else []

    core_weight = float(np.clip(core_weight, 0.0, 1.0))
    overlay_weight = float(1.0 - core_weight)
    if core_weight > 0:
        if in_bull or not core_to_cash:
            w.loc[benchmark] += core_weight
        elif cash and cash in px.columns:
            w.loc[cash] += core_weight
    if basket and overlay_weight > 0:
        w.loc[basket] += overlay_weight * (1.0 / len(basket))
    w = w * gross

    if bool(cfg.get("allocate_residual_to_cash", False)) and cash and cash in px.columns:
        resid = float(1.0 - w.sum())
        if resid > 0:
            w.loc[cash] += resid
    return w


def main() -> int:
    ap = argparse.ArgumentParser(description="Dynamic regime-switching runner (ML + risk rules + optional put hedge).")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--risk-on-config", type=Path, required=True)
    ap.add_argument("--risk-off-config", type=Path, required=True)
    ap.add_argument("--crash-config", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater/dynamic_regime_run1"))

    ap.add_argument("--train-days", type=int, default=756)
    ap.add_argument("--refit-every", type=int, default=21)
    ap.add_argument("--label-horizon", type=int, default=21, help="Predict benchmark direction over this many bars.")

    ap.add_argument("--hard-crash-days", type=int, default=5)
    ap.add_argument("--hard-crash-ret", type=float, default=-0.07)
    ap.add_argument("--hard-vol-lookback", type=int, default=20)
    ap.add_argument("--hard-vol-max", type=float, default=0.28)
    ap.add_argument("--hard-vol-requires-bear", action="store_true", help="Only apply hard-vol risk-off when benchmark is below its SMA.")
    ap.add_argument("--hard-vol-sma-days", type=int, default=200, help="SMA days for hard-vol bear filter (when enabled).")

    # Regime probability hysteresis: helps reduce flip-flops.
    ap.add_argument("--prob-risk-on-enter", type=float, default=0.55, help="Enter/keep risk-on when p>=this (unless exit threshold applies).")
    ap.add_argument("--prob-risk-on-exit", type=float, default=0.50, help="Exit risk-on when p falls below this (hysteresis).")

    # Weight update schedule: helps reduce turnover/TC.
    ap.add_argument(
        "--rebalance-every",
        type=int,
        default=1,
        help="Only recompute the target weights every N days (or immediately on regime change).",
    )
    ap.add_argument(
        "--turnover-cap",
        type=float,
        default=0.0,
        help="If >0, cap daily turnover (L1 weight change sum). Excess change is scaled down.",
    )
    ap.add_argument(
        "--turnover-cap-skip-on-regime-change",
        action="store_true",
        help="If set, do not apply turnover cap on base regime changes (lets the portfolio rotate quickly on big state shifts).",
    )

    # Portfolio-level meta risk controls (applied on top of whichever config is selected).
    ap.add_argument(
        "--meta-max-gross",
        type=float,
        default=1.0,
        help="Cap total non-cash exposure (0..1). Residual goes to cash if available.",
    )
    ap.add_argument(
        "--meta-cash",
        type=str,
        default="",
        help="Cash proxy ticker to use for residual allocation (defaults to config cash or BIL).",
    )
    ap.add_argument(
        "--meta-port-dd-stop",
        type=float,
        default=0.0,
        help="If >0, go all-cash when portfolio drawdown exceeds this (e.g. 0.25).",
    )
    ap.add_argument(
        "--meta-port-dd-cooldown-days",
        type=int,
        default=21,
        help="Days to remain in cash after port-dd-stop triggers.",
    )
    ap.add_argument(
        "--meta-cppi-floor-frac",
        type=float,
        default=0.0,
        help="If >0, apply CPPI floor as fraction of peak equity (e.g. 0.8).",
    )
    ap.add_argument(
        "--meta-cppi-multiplier",
        type=float,
        default=0.0,
        help="CPPI multiplier m (e.g. 3..6) for gross cap vs cushion.",
    )
    ap.add_argument("--meta-vol-target", type=float, default=0.0)
    ap.add_argument("--meta-vol-lookback", type=int, default=20)
    ap.add_argument("--blacklist", nargs="*", default=[], help="List of tickers to forcibly ban/exclude.")
    ap.add_argument("--dynamic-intelligence", type=Path, default=None, help="Path to CSV with Date,Risk_Score,Banned_Tickers for time-varying overrides.")
    
    ap.add_argument("--put-hedge", action="store_true")
    ap.add_argument("--put-maturity-days", type=int, default=21)
    ap.add_argument("--put-otm", type=float, default=0.05, help="Strike = spot*(1-otm).")
    ap.add_argument("--put-notional-frac", type=float, default=0.30, help="Fraction of portfolio to notionally hedge.")
    ap.add_argument("--iv-mult", type=float, default=1.25, help="Implied vol proxy = mult * realized vol.")
    ap.add_argument("--opt-rate", type=float, default=0.00)
    ap.add_argument("--opt-steps", type=int, default=200)
    args = ap.parse_args()

    # Important: align to benchmark trading calendar BEFORE forward-filling, otherwise
    # crypto weekend dates can get forward-filled into the benchmark series.
    px = load_prices(args.panel).sort_index()
    bm = str(args.benchmark)
    if bm not in px.columns:
        raise SystemExit(f"Benchmark {bm} not in panel.")
    # Align to benchmark dates (avoid crypto weekends).
    px = px.loc[px[bm].dropna().index].ffill()
    idx = px.index
    if len(idx) < int(args.train_days) + 50:
        raise SystemExit("Not enough history.")

    cfg_on = _config_defaults(json.loads(args.risk_on_config.read_text()))
    cfg_off = _config_defaults(json.loads(args.risk_off_config.read_text()))
    cfg_crash = _config_defaults(json.loads(args.crash_config.read_text()))

    bench = px[bm]
    bench_rets = bench.pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    feats = _features(bench).fillna(0.0)
    horizon = int(max(1, args.label_horizon))
    y = ((bench.shift(-horizon) / bench - 1.0) > 0).astype(int)

    pnl = []
    bench_pnl = []
    regimes = []
    weights_hist: List[pd.Series] = []
    w_prev = pd.Series(0.0, index=px.columns, dtype=float)
    base_regime_prev = ""
    eq = 1.0
    peak = 1.0
    cooldown_left = 0

    meta_max_gross = float(np.clip(float(args.meta_max_gross), 0.0, 1.0))
    meta_port_dd_stop = float(max(0.0, float(args.meta_port_dd_stop)))
    meta_port_dd_cooldown_days = int(max(0, int(args.meta_port_dd_cooldown_days)))
    meta_cppi_floor_frac = float(np.clip(float(args.meta_cppi_floor_frac), 0.0, 1.0))
    meta_cppi_multiplier = float(max(0.0, float(args.meta_cppi_multiplier)))
    meta_vol_target = float(max(0.0, float(args.meta_vol_target)))
    meta_vol_lookback = int(max(5, int(args.meta_vol_lookback)))

    meta_cash = str(args.meta_cash or "").strip()
    if not meta_cash:
        meta_cash = str(cfg_off.get("cash") or cfg_on.get("cash") or cfg_crash.get("cash") or "BIL")
    if meta_cash not in px.columns:
        meta_cash = ""

    # Put hedge state: hold to expiry.
    put_days_left = 0
    put_strike = 0.0
    put_premium = 0.0
    put_notional = 0.0

    model: Pipeline | None = None
    last_fit_i = -10**9

    hard_vol_requires_bear = bool(args.hard_vol_requires_bear)
    hard_vol_sma_days = int(max(10, int(args.hard_vol_sma_days)))
    hard_vol_sma = bench.rolling(hard_vol_sma_days, min_periods=max(50, hard_vol_sma_days // 2)).mean()

    prob_enter = float(np.clip(float(args.prob_risk_on_enter), 0.0, 1.0))
    prob_exit = float(np.clip(float(args.prob_risk_on_exit), 0.0, 1.0))
    if prob_exit > prob_enter:
        prob_exit = prob_enter

    rebalance_every = int(max(1, int(args.rebalance_every)))
    turnover_cap = float(max(0.0, float(args.turnover_cap)))
    turnover_cap_skip_on_regime_change = bool(args.turnover_cap_skip_on_regime_change)

    # Load Dynamic Intelligence (if provided)
    intel_df = None
    if args.dynamic_intelligence and args.dynamic_intelligence.exists():
        try:
            intel_df = pd.read_csv(args.dynamic_intelligence)
            intel_df["Date"] = pd.to_datetime(intel_df["Date"])
            intel_df = intel_df.set_index("Date").sort_index()
            # Forward fill so "2018-01-01" settings apply until the next entry.
            intel_df = intel_df.asfreq('D', method='ffill')
            print(f"Loaded dynamic intelligence history: {len(intel_df)} days covered.")
        except Exception as e:
            print(f"WARNING: Failed to load dynamic intelligence: {e}")

    for i, dt in enumerate(idx[:-1]):
        current_blacklist = set(args.blacklist)
        if i < int(args.train_days):
            # Warmup: stay in risk-off.
            base_regime = "warmup"
            cfg = cfg_off
            p_on = 0.0
        else:
            # Fit/refresh model.
            if (i - last_fit_i) >= int(args.refit_every) or model is None:
                tr_start = i - int(args.train_days)
                tr_end = i - horizon
                x_tr = feats.iloc[tr_start:tr_end].copy()
                y_tr = y.iloc[tr_start:tr_end].copy()
                # Remove NaNs and align.
                good = x_tr.notna().all(axis=1) & y_tr.notna()
                x_tr = x_tr.loc[good]
                y_tr = y_tr.loc[good]
                if len(x_tr) >= 200 and y_tr.nunique() > 1:
                    model = _train_model(x_tr, y_tr)
                    last_fit_i = i

            x_dt = feats.iloc[i : i + 1].fillna(0.0)
            p_on = float(model.predict_proba(x_dt.values)[0, 1]) if model is not None else 0.0

            # Hard overrides.
            crash_ret = float((bench.iloc[i] / bench.iloc[max(0, i - int(args.hard_crash_days))]) - 1.0) if i > 0 else 0.0
            vol_hist = bench_rets.iloc[max(0, i - int(args.hard_vol_lookback) + 1) : i + 1]
            est_vol = float(vol_hist.std(ddof=0) * np.sqrt(252.0)) if len(vol_hist) >= 5 else 0.0
            if crash_ret <= float(args.hard_crash_ret):
                base_regime = "crash"
                cfg = cfg_crash
            else:
                vol_triggers = float(args.hard_vol_max) > 0 and est_vol >= float(args.hard_vol_max)
                if vol_triggers and hard_vol_requires_bear:
                    in_bear = bool(bench.iloc[i] < hard_vol_sma.iloc[i]) if np.isfinite(hard_vol_sma.iloc[i]) else False
                    vol_triggers = vol_triggers and in_bear
                if vol_triggers:
                    base_regime = "risk_off"
                    cfg = cfg_off
                else:
                    # Hysteresis around the ML probability.
                    if base_regime_prev == "risk_on" and p_on >= prob_exit:
                        base_regime = "risk_on"
                        cfg = cfg_on
                    elif p_on >= prob_enter:
                        base_regime = "risk_on"
                        cfg = cfg_on
                    else:
                        base_regime = "risk_off"
                        cfg = cfg_off

        # Rebalance scheduling: update target weights only periodically, but always on base regime changes.
        do_rebalance = (rebalance_every == 1) or (i % rebalance_every == 0) or (base_regime != base_regime_prev)
        if do_rebalance:
            w_base = _as_weight_vector(cfg, px, dt)
            if current_blacklist:
                for bad_t in current_blacklist:
                    if bad_t in w_base:
                        w_base[bad_t] = 0.0
        else:
            w_base = w_prev.copy()

        # Portfolio-level meta risk controls.
        peak = max(peak, eq)
        port_dd = float(eq / max(1e-12, peak) - 1.0)
        if meta_port_dd_stop > 0 and port_dd <= -abs(meta_port_dd_stop):
            cooldown_left = max(cooldown_left, meta_port_dd_cooldown_days)
        if cooldown_left > 0:
            cooldown_left -= 1
            if meta_cash:
                w = pd.Series(0.0, index=px.columns, dtype=float)
                w.loc[meta_cash] = 1.0
            else:
                w = pd.Series(0.0, index=px.columns, dtype=float)
            regime = "meta_cash"
            base_regime = base_regime
        else:
            w = w_base
            regime = base_regime

        # Dynamic Intelligence Overrides (Time-Varying)
        current_blacklist = set(args.blacklist)
        # Reset to base max gross each step before applying dynamic penalty
        current_max_gross = float(meta_max_gross)

        if intel_df is not None:
            # Look for the settings effective on this date (thanks to ffill/asfreq, we can just lookup)
            # We use the index.asof(dt) to find the closest prior setting if exact match misses (though reindexing handles this)
            try:
                if dt in intel_df.index:
                    row = intel_df.loc[dt]
                    # Risk Score (0.0 to 1.0) -> Reduce Max Gross
                    # Risk Score 0.0 -> Multiplier 1.0
                    # Risk Score 1.0 -> Multiplier 0.0
                    risk_score = float(row.get("Risk_Score", 0.0))
                    risk_mult = max(0.0, 1.0 - risk_score)
                    current_max_gross = current_max_gross * risk_mult
                    
                    # Banned Tickers
                    bans_str = str(row.get("Banned_Tickers", ""))
                    if bans_str and bans_str.lower() != "nan":
                        # Support semicolon or comma
                        sep = ";" if ";" in bans_str else ","
                        for t in bans_str.split(sep):
                            t_clean = t.strip()
                            if t_clean:
                                current_blacklist.add(t_clean)
            except Exception:
                pass

        # Compute desired non-cash gross cap (min of meta max gross and CPPI cap).
        gross_cap = current_max_gross
        if meta_cppi_floor_frac > 0 and meta_cppi_multiplier > 0:
            floor = float(meta_cppi_floor_frac * peak)
            cushion = float(max(0.0, eq - floor) / max(1e-12, eq))
            gross_cap = float(min(gross_cap, np.clip(meta_cppi_multiplier * cushion, 0.0, 1.0)))
        if meta_vol_target > 0:
            vol_hist = bench_rets.iloc[max(0, i - meta_vol_lookback + 1) : i + 1]
            est_vol = float(vol_hist.std(ddof=0) * np.sqrt(252.0)) if len(vol_hist) >= 5 else 0.0
            if est_vol > 0:
                gross_cap = float(min(gross_cap, np.clip(meta_vol_target / est_vol, 0.0, 1.0)))

        if gross_cap < 1.0:
            if meta_cash:
                cash_w = float(w.get(meta_cash, 0.0))
                non_cash = w.drop(labels=[meta_cash]).clip(lower=0.0)
                non_cash_sum = float(non_cash.sum())
                if non_cash_sum > 0:
                    scale = float(min(1.0, gross_cap / non_cash_sum))
                    non_cash = non_cash * scale
                new_w = pd.Series(0.0, index=px.columns, dtype=float)
                new_w.loc[non_cash.index] = non_cash
                new_w.loc[meta_cash] = float(max(0.0, 1.0 - float(non_cash.sum())))
                w = new_w
            else:
                w = w * gross_cap

        # Optional turnover cap (applied after all other adjustments).
        turn = float((w - w_prev).abs().sum())
        turnover_capped = False
        if (
            turnover_cap > 0
            and turn > turnover_cap
            and turn > 0
            and not (turnover_cap_skip_on_regime_change and base_regime != base_regime_prev)
        ):
            scale = float(turnover_cap / turn)
            w = (w_prev + scale * (w - w_prev)).astype(float)
            turnover_capped = True

        weights_hist.append(w.astype(float).copy())
        turn = float((w - w_prev).abs().sum())
        cost = float(cfg.get("cost_bps", 0.0)) / 10000.0
        tc = cost * turn
        r_next = px.pct_change(fill_method=None).shift(-1).iloc[i].replace([np.inf, -np.inf], np.nan).fillna(0.0)
        r = float((w * r_next).sum()) - float(tc)
        b = float(bench_rets.shift(-1).iloc[i])

        # Put hedge overlay.
        hedge_r = 0.0
        if bool(args.put_hedge):
            spot = float(bench.iloc[i])
            realized_vol = float(feats["vol_20"].iloc[i]) if "vol_20" in feats.columns else 0.0
            iv = float(max(0.05, float(args.iv_mult) * realized_vol))

            if put_days_left <= 0 and regime in {"risk_off", "crash"}:
                t = float(int(args.put_maturity_days) / 252.0)
                k = float(spot * (1.0 - float(args.put_otm)))
                spec = OptionSpec(spot=spot, strike=k, t_years=t, rate=float(args.opt_rate), vol=iv, is_call=False)
                px_put = float(crr_european_price(spec, steps=int(args.opt_steps)))
                notional = float(max(0.0, float(args.put_notional_frac) * eq))
                qty = float(notional / max(1e-9, spot))
                premium = float(qty * px_put)
                # Pay premium today (reduces return).
                hedge_r -= premium / max(1e-9, eq)
                put_days_left = int(args.put_maturity_days)
                put_strike = k
                put_premium = premium
                put_notional = notional

            if put_days_left > 0:
                put_days_left -= 1
                # Settle at expiry on next close.
                if put_days_left == 0:
                    s_T = float(bench.iloc[i + 1])
                    payoff = max(0.0, put_strike - s_T)
                    qty = float(put_notional / max(1e-9, spot))
                    value = float(qty * payoff)
                    hedge_r += value / max(1e-9, eq)
                    put_strike = 0.0
                    put_premium = 0.0
                    put_notional = 0.0

        r_total = float(r + hedge_r)
        eq = float(eq * (1.0 + r_total))
        pnl.append(r_total)
        bench_pnl.append(b)
        regimes.append(
            {
                "Date": str(dt.date()),
                "EndDate": str(idx[i + 1].date()),
                "regime": regime,
                "base_regime": base_regime,
                "rebalance": bool(do_rebalance),
                "turnover_capped": bool(turnover_capped),
                "p_risk_on": float(p_on),
                "turnover": float(turn),
                "tc": float(tc),
                "meta_cash": str(meta_cash),
                "meta_gross_cap": float(gross_cap),
                "meta_vol_target": float(meta_vol_target),
                "meta_vol_lookback": int(meta_vol_lookback),
                "meta_port_dd": float(port_dd),
                "meta_cooldown_left": int(cooldown_left),
                "put_days_left": int(put_days_left),
                "put_strike": float(put_strike),
                "put_premium_paid": float(put_premium),
            }
        )
        w_prev = w
        base_regime_prev = base_regime

    pnl_s = pd.Series(pnl, index=idx[:-1], name="pnl").fillna(0.0)
    bench_s = pd.Series(bench_pnl, index=idx[:-1], name="benchmark_pnl").fillna(0.0)
    out = {
        "strategy": asdict(_perf(pnl_s)),
        "benchmark": asdict(_perf(bench_s)),
        "active_excess_final": float(((1.0 + pnl_s).cumprod().iloc[-1] / (1.0 + bench_s).cumprod().iloc[-1]) - 1.0),
        "settings": {
            "train_days": int(args.train_days),
            "refit_every": int(args.refit_every),
            "label_horizon": int(args.label_horizon),
            "hard_crash_days": int(args.hard_crash_days),
            "hard_crash_ret": float(args.hard_crash_ret),
            "hard_vol_lookback": int(args.hard_vol_lookback),
            "hard_vol_max": float(args.hard_vol_max),
            "hard_vol_requires_bear": bool(args.hard_vol_requires_bear),
            "hard_vol_sma_days": int(args.hard_vol_sma_days),
            "prob_risk_on_enter": float(prob_enter),
            "prob_risk_on_exit": float(prob_exit),
            "rebalance_every": int(rebalance_every),
            "turnover_cap": float(turnover_cap),
            "turnover_cap_skip_on_regime_change": bool(turnover_cap_skip_on_regime_change),
            "meta_max_gross": float(meta_max_gross),
            "meta_cash": str(meta_cash),
            "meta_port_dd_stop": float(meta_port_dd_stop),
            "meta_port_dd_cooldown_days": int(meta_port_dd_cooldown_days),
            "meta_cppi_floor_frac": float(meta_cppi_floor_frac),
            "meta_cppi_multiplier": float(meta_cppi_multiplier),
            "meta_vol_target": float(meta_vol_target),
            "meta_vol_lookback": int(meta_vol_lookback),
            "put_hedge": bool(args.put_hedge),
        },
        "configs": {
            "risk_on": str(args.risk_on_config),
            "risk_off": str(args.risk_off_config),
            "crash": str(args.crash_config),
        },
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "summary.json").write_text(json.dumps(out, indent=2) + "\n")
    (args.out_dir / "equity.csv").write_text(((1.0 + pnl_s).cumprod()).to_csv())
    (args.out_dir / "benchmark_equity.csv").write_text(((1.0 + bench_s).cumprod()).to_csv())
    pd.DataFrame(regimes).to_csv(args.out_dir / "regime_log.csv", index=False)
    pd.DataFrame(weights_hist, index=idx[:-1]).to_csv(args.out_dir / "weights.csv")
    sig = {
        "as_of": str(idx[-2].date()) if len(idx) >= 2 else "",
        "regime": regimes[-1]["regime"] if regimes else "",
        "weights": {k: float(v) for k, v in w_prev.items() if float(v) != 0.0},
    }
    (args.out_dir / "signal.json").write_text(json.dumps(sig, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
