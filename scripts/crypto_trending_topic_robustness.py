#!/usr/bin/env python3
"""Robustness suite for the trending crypto topic research."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy.stats import norm
import statsmodels.api as sm
from statsmodels.stats.sandwich_covariance import cov_cluster_2groups

ROOT = Path(__file__).resolve().parents[1]
EVENT_PANEL = ROOT / "data_lake/crypto_pipeline/news_context/event_research/news_social_factor_panel.csv"
PRICE_LONG = ROOT / "data_lake/crypto_pipeline/exports/price_panel_long.csv"
OUT_DIR = ROOT / "data_lake/crypto_pipeline/reports/trending_crypto_robustness"
REPORT = ROOT / "data_lake/crypto_pipeline/reports/CRYPTO_TRENDING_ROBUSTNESS.md"

HORIZONS = [1, 3, 7, 14, 30]
RET_COLS = [f"fwd_{h}d_ret" for h in HORIZONS]
DEFAULT_CAPS = [1.0, 2.0, 5.0]
DEFAULT_PERMUTATIONS = 200
STABLE_TOKENS = ("usdt", "usdc", "dai", "busd", "usdp", "usdd", "tusd", "ust", "fei", "frax", "lusd")
FE_CLUSTER_MODES = ["date", "coin", "date+coin"]


@dataclass(frozen=True)
class RobustStats:
    signal: str
    horizon: str
    context: str
    n_event: int
    n_base: int
    event_mean: float
    base_mean: float
    spread: float
    event_t: float
    base_t: float
    date_neutral_spread: float | float | float


def _numeric(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _safe_t(x: pd.Series) -> float:
    x = _numeric(x).dropna()
    if len(x) < 3:
        return np.nan
    s = float(x.std(ddof=1))
    if not np.isfinite(s) or s == 0:
        return np.nan
    return float(x.mean() / (s / np.sqrt(len(x))))


def _demean_by_coin_date(df: pd.DataFrame, x: pd.Series) -> pd.Series:
    x = _numeric(x)
    if x.empty:
        return x
    grand = float(x.mean())
    out = x - x.groupby(df["cg_id"]).transform("mean")
    out = out - out.groupby(df["date"]).transform("mean") + grand
    return out


def _cluster_pvalue(t_stat: float) -> float:
    if not np.isfinite(t_stat):
        return np.nan
    return float(2.0 * (1.0 - norm.cdf(abs(t_stat))))


def _read_panel(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"], low_memory=False)
    if df.empty:
        raise SystemExit(f"Empty panel: {path}")
    df["date"] = pd.to_datetime(df["date"])
    df["cg_id"] = df["cg_id"].astype(str).str.lower().str.strip()
    return df


def _load_btc_mom(price_long: Path, chunksize: int = 500_000) -> pd.Series:
    rows: List[pd.DataFrame] = []
    for ch in pd.read_csv(price_long, usecols=["cg_id", "date", "price_usd"], chunksize=chunksize):
        sub = ch[ch["cg_id"].astype(str).str.lower() == "bitcoin"].copy()
        if sub.empty:
            continue
        rows.append(sub)
    if not rows:
        return pd.Series(dtype=float)
    px = pd.concat(rows, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"])
    px["price_usd"] = _numeric(px["price_usd"])
    px = px.dropna(subset=["date", "price_usd"]).sort_values("date")
    return px.set_index("date")["price_usd"].pct_change(30).rename("btc_mom_30d")


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for h in HORIZONS:
        col = f"fwd_{h}d_ret"
        if col in out.columns:
            out[col] = _numeric(out[col])
        else:
            out[col] = np.nan

    out["news_records"] = _numeric(out["news_records"]).fillna(0.0)
    out["log_news"] = np.log1p(np.clip(out["news_records"], 0.0, None))
    out["sentiment_balance"] = _numeric(out.get("sentiment_balance", 0.0)).fillna(0.0)
    out["volume_usd"] = _numeric(out.get("volume_usd", np.nan))
    out["publisher_count"] = _numeric(out.get("publisher_count", 0)).fillna(0.0)
    out["source_family_count"] = _numeric(out.get("source_family_count", 0)).fillna(0.0)
    out["has_news"] = _numeric(out.get("has_news", 0)).fillna(0.0)
    out["has_reddit"] = _numeric(out.get("has_reddit", 0)).fillna(0.0)

    q90 = float(out["news_records"].quantile(0.90))
    q95 = float(out["news_records"].quantile(0.95))
    q99 = float(out["news_records"].quantile(0.99))
    out["news_q90"] = (out["news_records"] >= q90).astype(int)
    out["news_q95"] = (out["news_records"] >= q95).astype(int)
    out["news_q99"] = (out["news_records"] >= q99).astype(int)

    coin_stats = out.groupby("cg_id")["log_news"].agg(["mean", "std"]).rename(
        columns={"mean": "coin_news_mean", "std": "coin_news_std"}
    )
    out = out.merge(coin_stats, on="cg_id", how="left")
    out["coin_news_std"] = out["coin_news_std"].replace(0.0, np.nan)
    out["news_z"] = (out["log_news"] - out["coin_news_mean"]) / out["coin_news_std"]
    out["news_z"] = out["news_z"].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    out["news_z2"] = (out["news_z"] >= 2.0).astype(int)
    out["news_top1_coin"] = out.groupby("cg_id")["news_records"].transform(
        lambda s: (s >= s.quantile(0.80)).astype(int)
    )
    out["high_news_pos"] = ((out["news_z2"] == 1) & (out["sentiment_balance"] >= 0.05)).astype(int)
    out["high_news_neg"] = ((out["news_z2"] == 1) & (out["sentiment_balance"] <= -0.05)).astype(int)
    out["news_only"] = ((out["has_news"] > 0) & (out["has_reddit"] == 0)).astype(int)
    out["reddit_only"] = ((out["has_reddit"] > 0) & (out["has_news"] == 0)).astype(int)
    out["news_and_reddit"] = ((out["has_news"] > 0) & (out["has_reddit"] > 0)).astype(int)
    reddit_raw = _numeric(out.get("reddit_raw_posts", 0.0)).fillna(0.0)
    out["high_reddit_attention"] = 0
    reddit_nz = reddit_raw[reddit_raw > 0]
    if len(reddit_nz) >= 5:
        q95 = float(reddit_nz.quantile(0.95))
        out["high_reddit_attention"] = (reddit_raw >= q95).astype(int)

    out["is_stable_like"] = out["cg_id"].str.contains("|".join(STABLE_TOKENS), na=False).astype(int)
    out["ret_1d"] = _numeric(out.get("ret_1d"))
    return out


def _event_vs_base(df: pd.DataFrame, signal: pd.Series, ret_col: str, cap: float) -> Dict[str, float]:
    signal = signal.astype(int)
    r = _numeric(df[ret_col])
    valid = r.notna() & (r.abs() <= cap)
    if not valid.any():
        return {
            "n_event": 0,
            "n_base": 0,
            "event_mean": np.nan,
            "base_mean": np.nan,
            "spread": np.nan,
            "event_t": np.nan,
            "base_t": np.nan,
        }
    r = r[valid]
    s = signal.loc[valid]
    evt = r[s == 1]
    base = r[s == 0]
    if len(evt) == 0 or len(base) == 0:
        return {
            "n_event": int(len(evt)),
            "n_base": int(len(base)),
            "event_mean": float(evt.mean()) if not evt.empty else np.nan,
            "base_mean": float(base.mean()) if not base.empty else np.nan,
            "spread": float(evt.mean() - base.mean()) if not evt.empty and not base.empty else np.nan,
            "event_t": float(_safe_t(evt)),
            "base_t": float(_safe_t(base)),
        }
    return {
        "n_event": int(len(evt)),
        "n_base": int(len(base)),
        "event_mean": float(evt.mean()),
        "base_mean": float(base.mean()),
        "spread": float(evt.mean() - base.mean()),
        "event_t": float(_safe_t(evt)),
        "base_t": float(_safe_t(base)),
    }


def _date_neutral_spread(df: pd.DataFrame, signal: pd.Series, ret_col: str, cap: float) -> float:
    signal = signal.fillna(0).astype(int)
    x = df[["date", ret_col]].copy()
    x[ret_col] = _numeric(x[ret_col])
    x = x.replace([np.inf, -np.inf], np.nan).dropna(subset=[ret_col])
    x = x[np.abs(x[ret_col]) <= cap]
    if x.empty:
        return np.nan
    x["sig"] = signal.loc[x.index].values
    event_means = x[x["sig"] == 1].groupby("date")[ret_col].mean()
    base_means = x[x["sig"] == 0].groupby("date")[ret_col].mean()
    both = pd.concat({"event": event_means, "base": base_means}, axis=1, sort=False).dropna()
    if both.empty:
        return np.nan
    spread = both["event"] - both["base"]
    return float(spread.mean())


def _date_neutral_t(df: pd.DataFrame, signal: pd.Series, ret_col: str, cap: float) -> float:
    signal = signal.fillna(0).astype(int)
    x = df[["date", ret_col]].copy()
    x[ret_col] = _numeric(x[ret_col])
    x = x.replace([np.inf, -np.inf], np.nan).dropna(subset=[ret_col])
    x = x[np.abs(x[ret_col]) <= cap]
    if x.empty:
        return np.nan
    x["sig"] = signal.loc[x.index].values
    event_means = x[x["sig"] == 1].groupby("date")[ret_col].mean()
    base_means = x[x["sig"] == 0].groupby("date")[ret_col].mean()
    both = pd.concat({"event": event_means, "base": base_means}, axis=1, sort=False).dropna()
    if both.empty:
        return np.nan
    spread = both["event"] - both["base"]
    return float(_safe_t(spread))


def _add_regime(df: pd.DataFrame, btc_mom: pd.Series) -> pd.DataFrame:
    out = df.merge(btc_mom.rename("btc_mom_30d"), left_on="date", right_index=True, how="left")
    mom = out["btc_mom_30d"].dropna()
    if mom.empty:
        out["regime"] = "all"
        return out
    q05 = float(mom.quantile(0.2))
    q95 = float(mom.quantile(0.8))
    out["regime"] = "neutral"
    out.loc[out["btc_mom_30d"] >= q95, "regime"] = "risk_on"
    out.loc[out["btc_mom_30d"] <= q05, "regime"] = "risk_off"
    return out


def _liquidity_groups(df: pd.DataFrame) -> Dict[str, pd.Series]:
    coin_vol = df.groupby("cg_id")["volume_usd"].median().replace([np.inf, -np.inf], np.nan).dropna()
    if coin_vol.empty:
        return {"high_liq": pd.Series(True, index=df.index), "low_liq": pd.Series(False, index=df.index)}
    median = coin_vol.median()
    high = coin_vol[coin_vol >= median].index
    low = coin_vol[coin_vol < median].index
    return {
        "all": pd.Series(True, index=df.index),
        "high_liq": df["cg_id"].isin(high),
        "low_liq": df["cg_id"].isin(low),
        "non_stable": ~df["is_stable_like"].astype(bool),
    }


def _run_main_matrix(
    df: pd.DataFrame,
    signals: Dict[str, pd.Series],
    cap: float,
    context: str,
    row_filter: pd.Series | None = None,
    regime: str = "all",
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    sample = df if row_filter is None else df[row_filter]
    for name, sig in signals.items():
        for h in HORIZONS:
            ret_col = f"fwd_{h}d_ret"
            sig_s = sig.astype(int) if len(sig) == len(sample) else sig.loc[sample.index].astype(int)
            metrics = _event_vs_base(sample, sig_s, ret_col, cap)
            rows.append(
                {
                    "signal": name,
                    "horizon": f"{h}d",
                    "context": context,
                    "regime": regime,
                    "cap": cap,
                    "n_event": metrics["n_event"],
                    "n_base": metrics["n_base"],
                    "event_mean": metrics["event_mean"],
                    "base_mean": metrics["base_mean"],
                    "spread": metrics["spread"],
                    "event_t": metrics["event_t"],
                    "base_t": metrics["base_t"],
                    "date_neutral_spread": _date_neutral_spread(sample, sig_s, ret_col, cap),
                    "date_neutral_t": _date_neutral_t(sample, sig_s, ret_col, cap),
                }
            )
    return rows


def _fe_cluster_stats(
    df: pd.DataFrame,
    signal: pd.Series,
    ret_col: str,
    cap: float,
    mode: str,
) -> Dict[str, Any]:
    raw = _event_vs_base(df, signal, ret_col, cap=cap)
    if not np.isfinite(raw["spread"]) and (raw["n_event"] == 0 or raw["n_base"] == 0):
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": 0,
            "n_event": int(raw["n_event"]),
            "n_base": int(raw["n_base"]),
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": np.nan,
            "fe_se": np.nan,
            "fe_t": np.nan,
            "fe_p": np.nan,
        }

    sig = signal.astype(int)
    x = sig
    r = _numeric(df[ret_col])
    valid = r.notna() & (r.abs() <= cap)
    if valid.sum() == 0 or len(x) != len(r):
        valid = valid & x.notna()
    x = _numeric(x.loc[valid]).fillna(0.0)
    y = r.loc[valid]
    if len(y) == 0:
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": 0,
            "n_event": int(raw["n_event"]),
            "n_base": int(raw["n_base"]),
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": np.nan,
            "fe_se": np.nan,
            "fe_t": np.nan,
            "fe_p": np.nan,
        }

    sub = df.loc[valid].copy()
    sub = sub[["cg_id", "date"]].copy()
    sub["signal"] = x.values
    sub["return"] = y.values

    n_event = int((sub["signal"] > 0).sum())
    n_base = int((sub["signal"] <= 0).sum())
    if n_event < 5 or n_base < 5:
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": int(len(sub)),
            "n_event": n_event,
            "n_base": n_base,
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": np.nan,
            "fe_se": np.nan,
            "fe_t": np.nan,
            "fe_p": np.nan,
        }

    y_tilde = _demean_by_coin_date(sub, sub["return"])
    x_tilde = _demean_by_coin_date(sub, sub["signal"])
    if not np.isfinite(x_tilde.std(ddof=0)) or x_tilde.std(ddof=0) == 0:
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": int(len(sub)),
            "n_event": n_event,
            "n_base": n_base,
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": np.nan,
            "fe_se": np.nan,
            "fe_t": np.nan,
            "fe_p": np.nan,
        }

    X = sm.add_constant(x_tilde.to_numpy())
    y_design = y_tilde.to_numpy()
    if mode == "date":
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        res = sm.OLS(y_design, X).fit(cov_type="cluster", cov_kwds={"groups": sub["date"]}, use_t=True)
        fe_beta = float(res.params[1])
        fe_se = float(res.bse[1])
        fe_t = float(res.tvalues[1])
        fe_p = float(res.pvalues[1])
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": int(len(sub)),
            "n_event": n_event,
            "n_base": n_base,
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": fe_beta,
            "fe_se": fe_se,
            "fe_t": fe_t,
            "fe_p": fe_p,
        }
    if mode == "coin":
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        res = sm.OLS(y_design, X).fit(cov_type="cluster", cov_kwds={"groups": sub["cg_id"]}, use_t=True)
        fe_beta = float(res.params[1])
        fe_se = float(res.bse[1])
        fe_t = float(res.tvalues[1])
        fe_p = float(res.pvalues[1])
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": int(len(sub)),
            "n_event": n_event,
            "n_base": n_base,
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": fe_beta,
            "fe_se": fe_se,
            "fe_t": fe_t,
            "fe_p": fe_p,
        }

    if mode == "date+coin":
        horizon = ret_col.replace("fwd_", "").replace("_ret", "")
        res = sm.OLS(y_design, X).fit()
        c1 = pd.factorize(sub["date"])[0]
        c2 = pd.factorize(sub["cg_id"])[0]
        cov_both, _, _ = cov_cluster_2groups(res, c1, c2)
        diag = np.diag(cov_both)
        diag = pd.Series(diag).where(diag > 0).to_numpy()
        se = np.sqrt(diag)
        if len(se) < 2:
            return {
                "signal": signal.name if signal.name else "signal",
                "horizon": horizon,
                "cluster_mode": mode,
                "cap": cap,
                "n_obs": int(len(sub)),
                "n_event": n_event,
                "n_base": n_base,
                "raw_event_mean": raw["event_mean"],
                "raw_base_mean": raw["base_mean"],
                "raw_spread": raw["spread"],
                "fe_beta": float(res.params[1]),
                "fe_se": np.nan,
                "fe_t": np.nan,
                "fe_p": np.nan,
            }
        fe_beta = float(res.params[1])
        fe_se = float(se[1])
        fe_t = fe_beta / fe_se if fe_se != 0 else np.nan
        fe_p = _cluster_pvalue(fe_t)
        return {
            "signal": signal.name if signal.name else "signal",
            "horizon": horizon,
            "cluster_mode": mode,
            "cap": cap,
            "n_obs": int(len(sub)),
            "n_event": n_event,
            "n_base": n_base,
            "raw_event_mean": raw["event_mean"],
            "raw_base_mean": raw["base_mean"],
            "raw_spread": raw["spread"],
            "fe_beta": fe_beta,
            "fe_se": fe_se,
            "fe_t": fe_t,
            "fe_p": fe_p,
        }

    raise ValueError(f"Unknown cluster mode: {mode}")


def _date_groups(df: pd.DataFrame) -> Dict[str, pd.Series]:
    years = df["date"].dt.year
    return {
        "all": pd.Series(True, index=df.index),
        "2020_2021": years.isin([2020, 2021]),
        "2022": years == 2022,
        "2023": years == 2023,
        "2024": years == 2024,
        "2025_2026": years.isin([2025, 2026]),
    }


def _permute_placebo(
    df: pd.DataFrame,
    signal: pd.Series,
    ret_col: str,
    cap: float,
    n_iter: int = 200,
    seed: int = 42,
) -> Dict[str, float]:
    rng = np.random.default_rng(seed)
    x = df[[ret_col, "date"]].copy()
    x[ret_col] = _numeric(x[ret_col])
    x = x.replace([np.inf, -np.inf], np.nan).dropna(subset=[ret_col])
    x = x[np.abs(x[ret_col]) <= cap]
    if x.empty or len(signal) < len(x):
        return {"observed": np.nan, "p_two_sided": np.nan, "p_left": np.nan, "p_right": np.nan}

    x = x.reset_index()
    x = x.rename(columns={"index": "orig_idx"})
    sig = signal.reindex(x["orig_idx"]).fillna(0).astype(int).to_numpy()
    observed = _date_neutral_spread(x, pd.Series(sig, index=x.index), ret_col, cap)
    if not np.isfinite(observed):
        return {"observed": observed, "p_two_sided": np.nan, "p_left": np.nan, "p_right": np.nan}

    idx_by_date: Dict[pd.Timestamp, np.ndarray] = {}
    for _, group in x.groupby("date").groups.items():
        idx_by_date[_] = np.array(group, dtype=int) if np.iterable(group) else np.array([], dtype=int)

    null_vals = []
    for _ in range(n_iter):
        x_perm = x.copy()
        shuffled = np.zeros(len(x_perm), dtype=int)
        # preserve event count per date
        for idx in idx_by_date.values():
            vals = sig[idx]
            shuffled_piece = rng.permutation(vals)
            shuffled[idx] = shuffled_piece
        x_perm["sig"] = shuffled
        event_means = x_perm[x_perm["sig"] == 1].groupby("date")[ret_col].mean()
        base_means = x_perm[x_perm["sig"] == 0].groupby("date")[ret_col].mean()
        both = pd.concat({"event": event_means, "base": base_means}, axis=1, sort=False).dropna()
        if both.empty:
            continue
        spread = both["event"] - both["base"]
        null_vals.append(float(spread.mean()))

    if len(null_vals) < 5:
        return {"observed": observed, "p_two_sided": np.nan, "p_left": np.nan, "p_right": np.nan}
    null_vals = np.array(null_vals)
    p_right = float((null_vals >= observed).mean())
    p_left = float((null_vals <= observed).mean())
    p_two = float(2 * min(p_left, p_right))
    p_two = min(1.0, p_two)
    return {
        "observed": float(observed),
        "p_two_sided": p_two,
        "p_left": p_left,
        "p_right": p_right,
        "null_mean": float(null_vals.mean()),
        "null_std": float(null_vals.std(ddof=1)) if len(null_vals) > 1 else np.nan,
    }


def _coin_robustness(df: pd.DataFrame, signals: Dict[str, pd.Series], cap: float) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    groups = _liquidity_groups(df)
    for group_name, mask in groups.items():
        rows.extend(_run_main_matrix(df, signals, cap=cap, context=f"liquidity:{group_name}", row_filter=mask))
    return rows


def _regime_robustness(df: pd.DataFrame, signals: Dict[str, pd.Series], cap: float) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for regime_name, regime_df in df.groupby("regime"):
        rows.extend(_run_main_matrix(regime_df, signals, cap=cap, context="regime_split", regime=str(regime_name)))
    return rows


def _time_robustness(df: pd.DataFrame, signals: Dict[str, pd.Series], cap: float) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    groups = _date_groups(df)
    for name, mask in groups.items():
        rows.extend(_run_main_matrix(df, signals, cap=cap, context=f"time:{name}", row_filter=mask))
    return rows


def _build_report(
    results: pd.DataFrame,
    perm: pd.DataFrame,
    cap_summary: pd.DataFrame,
    fe_df: pd.DataFrame,
    out_dir: Path,
    report: Path,
) -> None:
    lines = [
        "# Robustness Audit: Trending Crypto News Attention Research",
        "",
        f"Generated: {datetime.now(UTC).date()}",
        "",
        "## Setup",
        "- Panel: news/social event panel merged with return targets",
        "- Main robustness checks: alternative thresholds, return cap sensitivity, regime/period splits, "
        "liquidity/coins subsets, and permutation placebos.",
        "- Added fixed-effect + clustered inference (date/coin/date+coin) to test robustness to cross-sectional and temporal confounding.",
        "",
        "## Summary snapshots",
    ]
    if not cap_summary.empty:
        for _, row in cap_summary.sort_values(["signal", "horizon", "cap"]).iterrows():
            lines.append(
                f"- {row['signal']} | {row['horizon']} | cap={row['cap']}: spread={row['spread']:.6f}, date-neutral={row['date_neutral_spread']:.6f}, t={row['event_t']:.3f}"
            )

    lines += [
        "",
        "## Significance from placebo by-date permutation tests",
        "",
    ]
    if not perm.empty:
        perm_sorted = perm.sort_values(["p_two_sided", "observed"], ascending=[True, False], na_position="last")
        lines += [*(line for line in perm_sorted.to_string(index=False).split("\n")[:16]), ""]

    lines += [
        "## Key robustness blocks",
        "",
        "### 1) Caps and alternative signal thresholds",
        "",
        *(
            line
            for line in results[
                results["context"].str.startswith("all_")
            ]
            .sort_values(["signal", "horizon"])
            .to_string(index=False)
            .split("\\n")
        ),
    ]
    lines += [
        "",
        "### 2) Subsample checks",
        "",
        *(
            line
            for line in results[
                ~results["context"].str.startswith("all_")
                & results["context"].str.startswith(("liquidity", "regime", "time"))
            ].sort_values(["context", "signal", "horizon"]).to_string(index=False).split("\\n")
        ),
        "",
        "### 3) Fixed-effect clustered inference",
    ]

    if not fe_df.empty:
        finite_fe = fe_df.dropna(subset=["fe_p"])
        if not finite_fe.empty:
            fe_counts = finite_fe.groupby("cluster_mode").size().rename("n_inferable").reset_index()
            lines.append("")
            lines.append("#### Feasible observations by clustering mode")
            lines.extend(line for line in fe_counts.to_string(index=False).split("\\n"))

            lines.append("")
            lines.append("#### Significant at p < 0.10")
            sig_fe = (
                finite_fe[finite_fe["fe_p"] < 0.10]
                .sort_values(["cluster_mode", "horizon", "fe_p"])
                .copy()
            )
            if sig_fe.empty:
                lines.append("- None passed p < 0.10 in the FE-clustered inference table.")
            else:
                sig_cols = [
                    "signal",
                    "horizon",
                    "cluster_mode",
                    "fe_beta",
                    "fe_se",
                    "fe_t",
                    "fe_p",
                ]
                lines.extend(line for line in sig_fe[sig_cols].to_string(index=False).split("\\n"))

            lines.append("")
            lines.append("#### Top FE effects by absolute t-stat (date+coin if available)")
            top_fe = finite_fe.sort_values("fe_t", key=lambda s: s.abs(), ascending=False).head(80)
            top_cols = [
                "signal",
                "horizon",
                "cluster_mode",
                "fe_beta",
                "fe_se",
                "fe_t",
                "fe_p",
                "raw_spread",
                "n_event",
                "n_base",
            ]
            lines.extend(
                line
                for line in (
                    top_fe.assign(fe_beta=top_fe["fe_beta"].round(5))
                    .assign(fe_se=top_fe["fe_se"].round(5))
                    .assign(fe_t=top_fe["fe_t"].round(3))
                    .assign(fe_p=top_fe["fe_p"].round(4))
                    .assign(raw_spread=top_fe["raw_spread"].round(6))[top_cols]
                    .to_string(index=False)
                    .split("\\n")
                )
            )
        else:
            lines.append("- No finite FE p-values were computed for the clustered runs.")
    else:
        lines.append("- FE-clustered table is empty.")

    lines += [
        "",
        "### 4) Interpretation",
        "",
        "- The strongest claim remains conditional: signal effects are larger in raw cross-section and can weaken under strict controls.",
        "- Date-level placebo tests help separate true signal from global date effects; weak/unstable p-values imply caution on out-of-sample claims.",
        "",
        "## Outputs",
    ]
    for file in sorted(out_dir.glob("*.csv"), key=lambda p: p.name):
        lines.append(f"- {file.relative_to(ROOT)}")

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    out_dir = OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    df = _read_panel(EVENT_PANEL)
    btc_mom = _load_btc_mom(PRICE_LONG)
    df = _add_regime(df, btc_mom)
    feat = _build_features(df)

    # Primary signal pack used for all checks.
    signals = {
        "news_q90": feat["news_q90"].astype(int),
        "news_q95": feat["news_q95"].astype(int),
        "news_q99": feat["news_q99"].astype(int),
        "news_z2": feat["news_z2"].astype(int),
        "high_news_pos": feat["high_news_pos"].astype(int),
        "high_news_neg": feat["high_news_neg"].astype(int),
        "top20_coin": feat["news_top1_coin"].astype(int),
        "publisher_count>0": (feat["publisher_count"] > 0).astype(int),
        "source_family>0": (feat["source_family_count"] > 0).astype(int),
        "has_news": feat["has_news"].astype(int),
        "has_reddit": feat["has_reddit"].astype(int),
        "news_only": feat["news_only"].astype(int),
        "reddit_only": feat["reddit_only"].astype(int),
        "news_and_reddit": feat["news_and_reddit"].astype(int),
        "high_reddit_attention": feat["high_reddit_attention"].astype(int),
    }

    # Cap sensitivity.
    cap_rows: List[Dict[str, Any]] = []
    for cap in DEFAULT_CAPS:
        for name, sig in signals.items():
            for h in HORIZONS:
                ret_col = f"fwd_{h}d_ret"
                metrics = _event_vs_base(feat, sig, ret_col, cap=cap)
                cap_rows.append(
                    {
                        "signal": name,
                        "horizon": f"{h}d",
                        "cap": cap,
                        "n_event": metrics["n_event"],
                        "n_base": metrics["n_base"],
                        "event_mean": metrics["event_mean"],
                        "base_mean": metrics["base_mean"],
                        "spread": metrics["spread"],
                        "event_t": metrics["event_t"],
                        "base_t": metrics["base_t"],
                        "date_neutral_spread": _date_neutral_spread(feat, sig, ret_col, cap),
                        "date_neutral_t": _date_neutral_t(feat, sig, ret_col, cap),
                    }
                )
    cap_df = pd.DataFrame(cap_rows)

    # Core matrix by splits (using default cap 5.0)
    rows: List[Dict[str, Any]] = []
    base_cap = DEFAULT_CAPS[-1]
    for name, sig in signals.items():
        rows.extend(_run_main_matrix(feat, {name: sig}, cap=base_cap, context=f"all_{name}", row_filter=None))

    rows.extend(_coin_robustness(feat, signals, cap=base_cap))
    rows.extend(_regime_robustness(feat, signals, cap=base_cap))
    rows.extend(_time_robustness(feat, signals, cap=base_cap))

    results = pd.DataFrame(rows)

    # Permutation placebos for a few signal-horizon combinations.
    perm_rows = []
    if not feat.empty:
        for sig_name, sig in signals.items():
            for h in HORIZONS:
                ret_col = f"fwd_{h}d_ret"
                perm_rows.append(
                    {
                        "horizon": f"{h}d",
                        "signal": sig_name,
                        **_permute_placebo(feat, sig, ret_col, cap=base_cap, n_iter=DEFAULT_PERMUTATIONS),
                    }
                )

    perm_df = pd.DataFrame(perm_rows)

    # Fixed-effect + clustered inference for main model.
    fe_rows: List[Dict[str, Any]] = []
    for mode in FE_CLUSTER_MODES:
        for name, sig in signals.items():
            for h in HORIZONS:
                ret_col = f"fwd_{h}d_ret"
                s = sig.astype(int).copy()
                s.name = name
                fe_rows.append(
                    _fe_cluster_stats(
                        feat,
                        s,
                        ret_col,
                        cap=base_cap,
                        mode=mode,
                    )
                )
    fe_df = pd.DataFrame(fe_rows)
    fe_df["signal"] = fe_df["signal"].fillna("")

    # Persist outputs.
    cap_df.to_csv(out_dir / "robust_cap_sensitivity.csv", index=False)
    fe_df.to_csv(out_dir / "robustness_fe_clustered.csv", index=False)
    results.to_csv(out_dir / "robustness_all.csv", index=False)
    perm_df.to_csv(out_dir / "placebo_permutation.csv", index=False)
    feat[["cg_id", "date", "news_records", "news_q90", "news_q95", "news_q99", "news_z2", "high_news_pos", "high_news_neg", "is_stable_like"] + RET_COLS].to_csv(
        out_dir / "feature_subset_for_repro.csv", index=False
    )

    summary = {
        "generated_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "event_rows": int(len(feat)),
        "event_coins": int(feat["cg_id"].nunique()),
        "date_min": str(feat["date"].min().date()),
        "date_max": str(feat["date"].max().date()),
        "cap_grid": DEFAULT_CAPS,
        "permutations": DEFAULT_PERMUTATIONS,
    }
    (out_dir / "robustness_summary.json").write_text(pd.Series(summary).to_json(orient="index", indent=2) + "\n", encoding="utf-8")

    _build_report(
        results,
        perm_df,
        cap_df[cap_df["cap"] == base_cap].sort_values(["signal", "horizon"]),
        fe_df,
        out_dir,
        REPORT,
    )

    print(
        (
            f"\nREPORT: {REPORT}\n"
            f"RESULTS: {out_dir}/robustness_all.csv\n"
            f"FE_CLUSTER: {out_dir}/robustness_fe_clustered.csv\n"
            f"CAP: {out_dir}/robust_cap_sensitivity.csv\n"
            f"PERM: {out_dir}/placebo_permutation.csv\n"
            f"SUMMARY: {out_dir}/robustness_summary.json\n"
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
