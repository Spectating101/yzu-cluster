#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass
class StrategySnapshot:
    path: str
    strategy: Optional[str]
    as_of_month: Optional[str]
    n_weights: int
    cash_weight: float
    effective_n: Optional[float]
    top_weights: List[Dict[str, Any]]


@dataclass
class BacktestChampion:
    file: str
    score: float
    test_sharpe: Optional[float]
    test_cagr: Optional[float]
    test_max_drawdown: Optional[float]
    avg_turnover: Optional[float]
    params: Dict[str, Any]


@dataclass
class RunEvaluation:
    run_dir: str
    equity_file: str
    benchmark_file: str
    n_obs: int
    freq_per_year: int
    cagr: float
    sharpe: float
    sortino: Optional[float]
    max_drawdown: float
    benchmark_cagr: float
    benchmark_sharpe: float
    annualized_alpha: float
    active_mean: float
    active_t_stat: float
    active_bootstrap_p: float
    beta: float
    annualized_idio_vol: float
    r2: float


def _safe_float(x: Any) -> Optional[float]:
    try:
        v = float(x)
        if math.isfinite(v):
            return v
    except Exception:
        pass
    return None


def _round_or_none(x: Optional[float], ndigits: int = 4) -> Optional[float]:
    if x is None:
        return None
    try:
        v = float(x)
        if math.isfinite(v):
            return round(v, ndigits)
    except Exception:
        pass
    return None


def _discover_latest(paths: List[Path]) -> Optional[Path]:
    existing = [p for p in paths if p.exists()]
    if not existing:
        return None
    return max(existing, key=lambda p: p.stat().st_mtime)


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _portfolio_concentration(weights: Dict[str, float]) -> Tuple[float, float]:
    vals = np.array([max(0.0, float(v)) for v in weights.values()], dtype=float)
    s = vals.sum()
    if s <= 1e-12:
        return (float("nan"), float("nan"))
    p = vals / s
    hhi = float((p * p).sum())
    eff_n = float(1.0 / hhi) if hhi > 0 else float("nan")
    return hhi, eff_n


def _infer_freq_per_year(index: pd.Index) -> int:
    if len(index) < 3:
        return 252
    try:
        d = pd.to_datetime(index).to_series().sort_values().diff().dropna().dt.days
        if d.empty:
            return 252
        med = float(d.median())
        if med <= 3:
            return 252
        if med <= 10:
            return 52
        return 12
    except Exception:
        return 252


def _series_metrics(level: pd.Series) -> Dict[str, float]:
    s = level.dropna().astype(float)
    if len(s) < 3:
        return {}
    r = s.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    if r.empty:
        return {}
    freq = _infer_freq_per_year(s.index)
    n = len(r)
    years = max(n / float(freq), 1e-9)
    total = float(s.iloc[-1] / s.iloc[0] - 1.0)
    cagr = float((s.iloc[-1] / s.iloc[0]) ** (1.0 / years) - 1.0)
    vol = float(r.std(ddof=1) * np.sqrt(freq)) if n > 1 else float("nan")
    sharpe = float((r.mean() / r.std(ddof=1)) * np.sqrt(freq)) if n > 1 and float(r.std(ddof=1)) > 0 else float("nan")
    neg = r[r < 0]
    sortino = float((r.mean() / neg.std(ddof=1)) * np.sqrt(freq)) if len(neg) > 1 and float(neg.std(ddof=1)) > 0 else float("nan")
    dd = (s / s.cummax() - 1.0).min()
    return {
        "n_obs": int(n),
        "freq_per_year": int(freq),
        "total_return": total,
        "cagr": cagr,
        "ann_vol": vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": float(dd),
    }


def _read_equity_series(path: Path) -> Optional[pd.Series]:
    try:
        df = pd.read_csv(path)
    except Exception:
        return None
    if df.empty:
        return None

    date_col: Optional[str] = None
    for c in ["Date", "date", "Unnamed: 0", "index"]:
        if c in df.columns:
            date_col = c
            break
    if date_col is None:
        return None

    value_cols = [c for c in df.columns if c != date_col]
    if not value_cols:
        return None
    pref = ["pnl", "equity", "benchmark_pnl", "SPY", "0", "portfolio_equity", "value"]
    val_col = next((c for c in pref if c in value_cols), value_cols[0])

    idx = pd.to_datetime(df[date_col], errors="coerce")
    vals = pd.to_numeric(df[val_col], errors="coerce")
    s = pd.Series(vals.values, index=idx).dropna().sort_index()
    if s.empty:
        return None
    s = s.groupby(level=0).last()
    if float(s.iloc[0]) <= 0:
        return None
    return s.astype(float)


def _bootstrap_pvalue_mean_gt_zero(x: np.ndarray, n_boot: int = 2000) -> Optional[float]:
    if x.size < 20:
        return None
    mu = float(np.mean(x))
    # Two-sided test around 0 using sign-flip bootstrap.
    rng = np.random.default_rng(42)
    signs = rng.choice(np.array([-1.0, 1.0]), size=(n_boot, x.size), replace=True)
    boot = np.mean(signs * x[None, :], axis=1)
    p = float(np.mean(np.abs(boot) >= abs(mu)))
    return p


def _pair_metrics(strategy_level: pd.Series, benchmark_level: pd.Series) -> Optional[Dict[str, Any]]:
    joined = pd.concat(
        [strategy_level.rename("strategy"), benchmark_level.rename("benchmark")],
        axis=1,
    ).dropna(how="any")
    if joined.shape[0] < 30:
        return None
    sr = joined["strategy"].pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    br = joined["benchmark"].pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    rb = pd.concat([sr.rename("sr"), br.rename("br")], axis=1).dropna(how="any")
    if rb.shape[0] < 30:
        return None

    freq = _infer_freq_per_year(rb.index)
    active = (rb["sr"] - rb["br"]).astype(float)
    amean = float(active.mean())
    astd = float(active.std(ddof=1))
    t_stat = float((amean / (astd / np.sqrt(len(active))))) if astd > 0 and len(active) > 1 else float("nan")
    p_boot = _bootstrap_pvalue_mean_gt_zero(active.values)

    # CAPM-style attribution (daily frequency, no rf).
    cov = float(np.cov(rb["sr"], rb["br"], ddof=1)[0, 1]) if len(rb) > 1 else float("nan")
    var_b = float(np.var(rb["br"], ddof=1)) if len(rb) > 1 else float("nan")
    beta = float(cov / var_b) if var_b > 0 else float("nan")
    alpha_daily = float(rb["sr"].mean() - beta * rb["br"].mean()) if math.isfinite(beta) else float("nan")
    resid = rb["sr"] - (alpha_daily + beta * rb["br"]) if math.isfinite(beta) else rb["sr"] - rb["sr"].mean()
    idio_vol = float(resid.std(ddof=1) * np.sqrt(freq)) if len(resid) > 1 else float("nan")
    corr = float(rb["sr"].corr(rb["br"])) if len(rb) > 1 else float("nan")
    r2 = float(corr * corr) if math.isfinite(corr) else float("nan")

    return {
        "n_obs": int(len(rb)),
        "freq_per_year": int(freq),
        "active_mean": amean,
        "annualized_alpha": float(amean * freq),
        "active_t_stat": t_stat,
        "active_bootstrap_p": p_boot,
        "beta": beta,
        "annualized_idio_vol": idio_vol,
        "r2": r2,
    }


def _evaluate_equity_pairs(root: Path, top_n: int = 5) -> Dict[str, Any]:
    pairs: List[RunEvaluation] = []
    for eq in root.glob("backtests/outputs/**/equity*.csv"):
        d = eq.parent
        bmk = d / "benchmark_equity.csv"
        if not bmk.exists():
            continue
        s = _read_equity_series(eq)
        b = _read_equity_series(bmk)
        if s is None or b is None:
            continue
        sm = _series_metrics(s)
        bm = _series_metrics(b)
        pm = _pair_metrics(s, b)
        if not sm or not bm or not pm:
            continue
        if sm["n_obs"] < 60:
            continue
        pairs.append(
            RunEvaluation(
                run_dir=str(d),
                equity_file=str(eq),
                benchmark_file=str(bmk),
                n_obs=int(pm["n_obs"]),
                freq_per_year=int(pm["freq_per_year"]),
                cagr=float(sm["cagr"]),
                sharpe=float(sm["sharpe"]),
                sortino=_safe_float(sm["sortino"]),
                max_drawdown=float(sm["max_drawdown"]),
                benchmark_cagr=float(bm["cagr"]),
                benchmark_sharpe=float(bm["sharpe"]),
                annualized_alpha=float(pm["annualized_alpha"]),
                active_mean=float(pm["active_mean"]),
                active_t_stat=float(pm["active_t_stat"]),
                active_bootstrap_p=float(pm["active_bootstrap_p"]) if pm["active_bootstrap_p"] is not None else float("nan"),
                beta=float(pm["beta"]),
                annualized_idio_vol=float(pm["annualized_idio_vol"]),
                r2=float(pm["r2"]),
            )
        )

    if not pairs:
        return {}

    def _score(r: RunEvaluation) -> float:
        # Quality score for showcase selection.
        s = 0.0
        s += 1.5 * (r.sharpe if math.isfinite(r.sharpe) else -2.0)
        s += 1.2 * (r.annualized_alpha if math.isfinite(r.annualized_alpha) else -1.0)
        s += 0.5 * (r.cagr if math.isfinite(r.cagr) else -1.0)
        s -= 0.7 * abs(r.max_drawdown)
        if math.isfinite(r.active_t_stat):
            s += 0.2 * min(r.active_t_stat, 4.0)
        if math.isfinite(r.active_bootstrap_p):
            s -= 0.4 * r.active_bootstrap_p
        return float(s)

    ranked = sorted(pairs, key=_score, reverse=True)
    best = ranked[0]
    return {
        "n_runs_evaluated": len(ranked),
        "best_run": asdict(best),
        "top_runs": [asdict(x) for x in ranked[:top_n]],
        "all_runs": [
            {
                "run_dir": x.run_dir,
                "active_t_stat": x.active_t_stat,
                "active_bootstrap_p": x.active_bootstrap_p,
                "sharpe": x.sharpe,
                "cagr": x.cagr,
                "max_drawdown": x.max_drawdown,
                "annualized_alpha": x.annualized_alpha,
            }
            for x in ranked
        ],
    }


def _execution_realism(root: Path, best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not best_run:
        return {}
    eq_path = Path(best_run.get("equity_file", ""))
    if not eq_path.exists():
        return {}
    s = _read_equity_series(eq_path)
    if s is None:
        return {}
    r = s.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    if len(r) < 30:
        return {}
    freq = _infer_freq_per_year(r.index)

    def _rebuild(level0: float, rets: pd.Series) -> pd.Series:
        return level0 * (1.0 + rets).cumprod()

    base = _series_metrics(s)
    stress: Dict[str, Any] = {
        "base": {
            "cagr": base.get("cagr"),
            "sharpe": base.get("sharpe"),
            "max_drawdown": base.get("max_drawdown"),
        },
        "slippage_scenarios": {},
    }
    for bps in [5, 10, 25]:
        drag = float(bps / 10000.0)
        sr = r - drag
        lvl = _rebuild(float(s.iloc[0]), sr)
        m = _series_metrics(lvl)
        stress["slippage_scenarios"][f"{bps}bps_per_period"] = {
            "cagr": m.get("cagr"),
            "sharpe": m.get("sharpe"),
            "max_drawdown": m.get("max_drawdown"),
        }

    risk_m = eq_path.parent / "benchmark_risk_matched_equity.csv"
    if risk_m.exists():
        b = _read_equity_series(risk_m)
        if b is not None:
            pm = _pair_metrics(s, b)
            if pm:
                stress["risk_matched_benchmark"] = {
                    "benchmark_file": str(risk_m),
                    "annualized_alpha": pm.get("annualized_alpha"),
                    "active_t_stat": pm.get("active_t_stat"),
                    "active_bootstrap_p": pm.get("active_bootstrap_p"),
                    "beta": pm.get("beta"),
                    "r2": pm.get("r2"),
                }
    stress["freq_per_year"] = int(freq)
    return stress


def _benchmark_gates(
    best_run: Optional[Dict[str, Any]],
    exec_diag: Dict[str, Any],
    walkforward_diag: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not best_run:
        return {}
    tests = {
        "sample_depth": bool(best_run.get("n_obs", 0) >= 252),
        "sharpe_floor": bool(_safe_float(best_run.get("sharpe")) is not None and float(best_run.get("sharpe")) >= 0.7),
        "drawdown_ceiling": bool(_safe_float(best_run.get("max_drawdown")) is not None and float(best_run.get("max_drawdown")) >= -0.30),
        "alpha_significance_t": bool(_safe_float(best_run.get("active_t_stat")) is not None and float(best_run.get("active_t_stat")) >= 1.5),
        "bootstrap_pvalue": bool(_safe_float(best_run.get("active_bootstrap_p")) is not None and float(best_run.get("active_bootstrap_p")) <= 0.10),
        "beta_reasonable": bool(_safe_float(best_run.get("beta")) is not None and abs(float(best_run.get("beta"))) <= 2.0),
    }
    slip25 = exec_diag.get("slippage_scenarios", {}).get("25bps_per_period", {})
    cagr25 = _safe_float(slip25.get("cagr"))
    tests["slippage_robustness_25bps"] = bool(cagr25 is not None and cagr25 > -0.20)
    if walkforward_diag:
        ps = _safe_float(walkforward_diag.get("pct_positive_test_sharpe"))
        pa = _safe_float(walkforward_diag.get("pct_positive_test_alpha"))
        tests["walkforward_consistency"] = bool(
            ps is not None and pa is not None and ps >= 0.50 and pa >= 0.50
        )
    passed = sum(1 for v in tests.values() if v)
    total = len(tests)
    return {
        "tests": tests,
        "passed": passed,
        "total": total,
        "pass_rate": float(passed / total) if total > 0 else None,
        "verdict": "PASS" if passed >= 6 else ("REVIEW" if passed >= 4 else "FAIL"),
    }


def _purged_walkforward_diagnostics(best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not best_run:
        return {}
    eq = Path(best_run.get("equity_file", ""))
    bm = Path(best_run.get("benchmark_file", ""))
    if not eq.exists() or not bm.exists():
        return {}
    s = _read_equity_series(eq)
    b = _read_equity_series(bm)
    if s is None or b is None:
        return {}

    rb = pd.concat(
        [
            s.pct_change().replace([np.inf, -np.inf], np.nan).rename("sr"),
            b.pct_change().replace([np.inf, -np.inf], np.nan).rename("br"),
        ],
        axis=1,
    ).dropna(how="any")
    if rb.shape[0] < 400:
        return {}
    rb["active"] = rb["sr"] - rb["br"]
    freq = _infer_freq_per_year(rb.index)
    train_len = 252 if freq >= 200 else (104 if freq >= 52 else 36)
    test_len = 63 if freq >= 200 else (26 if freq >= 52 else 12)
    embargo = 21 if freq >= 200 else (8 if freq >= 52 else 3)
    if rb.shape[0] < (train_len + test_len + embargo):
        return {}

    folds: List[Dict[str, Any]] = []
    start = train_len
    while start + embargo + test_len <= len(rb):
        train = rb.iloc[start - train_len : start]
        test = rb.iloc[start + embargo : start + embargo + test_len]
        start += test_len
        if len(train) < train_len or len(test) < test_len:
            continue

        train_std = float(train["sr"].std(ddof=1))
        test_std = float(test["sr"].std(ddof=1))
        train_sharpe = (
            float(train["sr"].mean() / train_std * np.sqrt(freq))
            if train_std > 0
            else float("nan")
        )
        test_sharpe = (
            float(test["sr"].mean() / test_std * np.sqrt(freq))
            if test_std > 0
            else float("nan")
        )
        a = test["active"]
        astd = float(a.std(ddof=1))
        alpha_ann = float(a.mean() * freq)
        alpha_t = (
            float(a.mean() / (astd / np.sqrt(len(a)))) if astd > 0 else float("nan")
        )
        folds.append(
            {
                "train_start": str(train.index.min().date()),
                "train_end": str(train.index.max().date()),
                "test_start": str(test.index.min().date()),
                "test_end": str(test.index.max().date()),
                "train_sharpe": train_sharpe,
                "test_sharpe": test_sharpe,
                "test_alpha_ann": alpha_ann,
                "test_alpha_t_stat": alpha_t,
            }
        )

    if not folds:
        return {}
    fdf = pd.DataFrame(folds)
    ps = float((fdf["test_sharpe"] > 0).mean())
    pa = float((fdf["test_alpha_ann"] > 0).mean())
    return {
        "frequency_per_year": int(freq),
        "train_len": int(train_len),
        "test_len": int(test_len),
        "embargo_len": int(embargo),
        "n_folds": int(len(fdf)),
        "mean_test_sharpe": float(fdf["test_sharpe"].mean()),
        "median_test_sharpe": float(fdf["test_sharpe"].median()),
        "mean_test_alpha_ann": float(fdf["test_alpha_ann"].mean()),
        "median_test_alpha_ann": float(fdf["test_alpha_ann"].median()),
        "pct_positive_test_sharpe": ps,
        "pct_positive_test_alpha": pa,
        "worst_fold_test_sharpe": float(fdf["test_sharpe"].min()),
        "worst_fold_test_alpha_ann": float(fdf["test_alpha_ann"].min()),
        "folds": folds,
    }


def _causal_alpha_diagnostics(root: Path, best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not best_run:
        return {}
    eq = Path(best_run.get("equity_file", ""))
    bmk = Path(best_run.get("benchmark_file", ""))
    if not eq.exists() or not bmk.exists():
        return {}
    s = _read_equity_series(eq)
    b = _read_equity_series(bmk)
    if s is None or b is None:
        return {}

    sr = s.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    br = b.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    rb = pd.concat([sr.rename("strategy_r"), br.rename("benchmark_r")], axis=1).dropna(how="any")
    if rb.shape[0] < 60:
        return {}
    rb["active_r"] = rb["strategy_r"] - rb["benchmark_r"]

    secf = root / "data_lake/sec/filing_events_nasdaq100.csv"
    riskf = root / "data_lake/intelligence_history_sec.csv"
    if not secf.exists() or not riskf.exists():
        return {}

    events = pd.read_csv(secf, usecols=["Date", "Ticker"]).copy()
    events["Date"] = pd.to_datetime(events["Date"], errors="coerce")
    events = events.dropna(subset=["Date"])
    daily_evt = events.groupby("Date")["Ticker"].nunique().rename("event_count")

    risk = pd.read_csv(riskf, usecols=["Date", "Risk_Score"]).copy()
    risk["Date"] = pd.to_datetime(risk["Date"], errors="coerce")
    risk = risk.dropna(subset=["Date"])
    daily_risk = risk.groupby("Date")["Risk_Score"].mean().rename("risk_score")

    df = rb.join(daily_evt, how="left").join(daily_risk, how="left")
    df["event_count"] = df["event_count"].fillna(0.0)
    df["event_day"] = (df["event_count"] > 0).astype(float)
    df["risk_score"] = df["risk_score"].ffill().fillna(0.0)
    if df.shape[0] < 60:
        return {}

    evt = df[df["event_day"] > 0]["active_r"]
    non = df[df["event_day"] == 0]["active_r"]
    uplift_mode = "event_vs_nonevent"
    if len(evt) >= 10 and len(non) >= 10:
        uplift = float(evt.mean() - non.mean())
        se = float(np.sqrt(evt.var(ddof=1) / len(evt) + non.var(ddof=1) / len(non))) if len(evt) > 1 and len(non) > 1 else float("nan")
        uplift_t = float(uplift / se) if se > 0 else float("nan")
        case_mask = (df["event_day"] > 0).values.astype(float)
    else:
        # SEC datasets can have filings almost every day. Fall back to high-intensity vs low-intensity days.
        q = float(df["event_count"].quantile(0.5))
        case = df[df["event_count"] > q]["active_r"]
        ctrl = df[df["event_count"] <= q]["active_r"]
        if len(case) < 10 or len(ctrl) < 10:
            return {}
        uplift_mode = "high_intensity_vs_low_intensity"
        uplift = float(case.mean() - ctrl.mean())
        se = float(np.sqrt(case.var(ddof=1) / len(case) + ctrl.var(ddof=1) / len(ctrl))) if len(case) > 1 and len(ctrl) > 1 else float("nan")
        uplift_t = float(uplift / se) if se > 0 else float("nan")
        case_mask = (df["event_count"] > q).astype(float).values

    # Placebo via permutation of event labels.
    rng = np.random.default_rng(42)
    event_flags = case_mask
    active_vals = df["active_r"].values.astype(float)
    n_evt = int(event_flags.sum())
    if n_evt > 0 and n_evt < len(event_flags):
        placebo = []
        for _ in range(1000):
            perm = np.zeros_like(event_flags)
            idx = rng.choice(len(event_flags), size=n_evt, replace=False)
            perm[idx] = 1.0
            a = active_vals[perm > 0]
            c = active_vals[perm == 0]
            placebo.append(float(a.mean() - c.mean()))
        placebo = np.array(placebo, dtype=float)
        placebo_p = float(np.mean(np.abs(placebo) >= abs(uplift)))
    else:
        placebo_p = float("nan")

    # Simple linear model: active ~ 1 + event_count + risk_score + benchmark_r.
    X = np.column_stack(
        [
            np.ones(len(df), dtype=float),
            df["event_count"].values.astype(float),
            df["risk_score"].values.astype(float),
            df["benchmark_r"].values.astype(float),
        ]
    )
    y = df["active_r"].values.astype(float)
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        fitted = X @ beta
        resid = y - fitted
        sigma2 = float(np.sum(resid ** 2) / max(len(y) - X.shape[1], 1))
        xtx_inv = np.linalg.pinv(X.T @ X)
        se_beta = np.sqrt(np.diag(sigma2 * xtx_inv))
        t_beta = beta / np.where(se_beta > 0, se_beta, np.nan)
        coef = {
            "intercept": float(beta[0]),
            "event_count": float(beta[1]),
            "risk_score": float(beta[2]),
            "benchmark_r": float(beta[3]),
        }
        tstat = {
            "intercept": _safe_float(t_beta[0]),
            "event_count": _safe_float(t_beta[1]),
            "risk_score": _safe_float(t_beta[2]),
            "benchmark_r": _safe_float(t_beta[3]),
        }
    except Exception:
        coef = {}
        tstat = {}

    return {
        "n_obs": int(len(df)),
        "uplift_mode": uplift_mode,
        "event_days": int((df["event_day"] > 0).sum()),
        "non_event_days": int((df["event_day"] == 0).sum()),
        "event_day_active_uplift": uplift,
        "event_day_uplift_t_stat": uplift_t,
        "event_day_placebo_pvalue": placebo_p,
        "ols_coefficients": coef,
        "ols_t_stats": tstat,
    }


def _estimate_turnover_from_weights(run_dir: Path) -> Optional[float]:
    candidates = [
        run_dir / "weights.csv",
        run_dir / "strategy/weights.csv",
        run_dir / "weights_monthly.csv",
        run_dir / "positions.csv",
    ]
    for p in candidates:
        if not p.exists():
            continue
        try:
            df = pd.read_csv(p)
        except Exception:
            continue
        if df.empty:
            continue
        date_col = next((c for c in ["Date", "date", "Unnamed: 0", "index", "as_of"] if c in df.columns), None)
        if date_col is None:
            continue
        val_cols = [c for c in df.columns if c != date_col]
        if len(val_cols) < 2:
            continue
        mat = df[val_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
        if mat.shape[0] < 2:
            continue
        # Normalize row-wise absolute weights, then compute half L1 turnover.
        row_sum = mat.abs().sum(axis=1).replace(0, np.nan)
        w = mat.div(row_sum, axis=0).fillna(0.0)
        dw = w.diff().abs().sum(axis=1).dropna()
        if dw.empty:
            continue
        turnover = float(0.5 * dw.mean())
        if math.isfinite(turnover):
            return max(0.0, min(turnover, 2.0))
    return None


def _capacity_diagnostics(root: Path, snap: Optional[Dict[str, Any]], best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not snap or not isinstance(snap.get("top_weights"), list):
        return {}
    panel = root / "data_lake/daily_alpha_panel.csv"
    if not panel.exists():
        return {}
    df = pd.read_csv(panel, usecols=["Instrument", "Date", "Price_Close", "Volume"])
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument"])
    if df.empty:
        return {}

    weights = {
        str(x.get("ticker")): abs(float(x.get("weight", 0.0)))
        for x in snap.get("top_weights", [])
        if x.get("ticker") is not None
    }
    weights = {k: v for k, v in weights.items() if v > 1e-8}
    if not weights:
        return {}

    end_date = df["Date"].max()
    start_date = end_date - pd.Timedelta(days=90)
    sub = df[(df["Date"] >= start_date) & (df["Date"] <= end_date)].copy()
    sub["dollar_volume"] = pd.to_numeric(sub["Price_Close"], errors="coerce") * pd.to_numeric(sub["Volume"], errors="coerce")
    sub = sub.dropna(subset=["dollar_volume"])

    adv_by_ticker: Dict[str, float] = {}
    for t in weights:
        s = sub[sub["Instrument"].astype(str) == t]["dollar_volume"]
        if len(s) >= 20:
            adv_by_ticker[t] = float(s.median())
    if not adv_by_ticker:
        return {}

    participation_caps = [0.005, 0.01, 0.02]
    cap_out: Dict[str, Any] = {}
    for part in participation_caps:
        per_ticker = {}
        portfolio_caps = []
        for t, w in weights.items():
            if t not in adv_by_ticker or w <= 0:
                continue
            c = (part * adv_by_ticker[t]) / w
            per_ticker[t] = float(c)
            portfolio_caps.append(c)
        if portfolio_caps:
            cap_out[f"{int(part*10000)}bps_adv_participation"] = {
                "portfolio_capacity_usd": float(min(portfolio_caps)),
                "ticker_capacity_usd": per_ticker,
            }

    avg_turnover = 0.20
    if best_run is not None and best_run.get("run_dir"):
        est = _estimate_turnover_from_weights(Path(str(best_run.get("run_dir"))))
        if est is not None:
            avg_turnover = est

    def _is_crypto(ticker: str) -> bool:
        t = str(ticker).upper()
        return t.endswith("-USD") or t in {"BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"}

    noncrypto_weights = {k: v for k, v in weights.items() if not _is_crypto(k)}
    noncrypto_adv = {k: v for k, v in adv_by_ticker.items() if k in noncrypto_weights}

    impact_scenarios = {}
    # Square-root impact proxy: impact_bps ~= 15 * sqrt(order/ADV)
    for capital in [50_000.0, 250_000.0, 1_000_000.0]:
        bps = []
        for t, w in weights.items():
            adv = adv_by_ticker.get(t)
            if not adv or adv <= 0:
                continue
            daily_turn = avg_turnover if avg_turnover is not None else 0.20
            order_usd = capital * w * daily_turn
            ratio = max(order_usd / adv, 0.0)
            bps.append(15.0 * np.sqrt(ratio))
        if bps:
            impact_scenarios[f"capital_{int(capital)}"] = {
                "avg_impact_bps": float(np.mean(bps)),
                "max_impact_bps": float(np.max(bps)),
            }

    impact_scenarios_noncrypto = {}
    if noncrypto_weights and noncrypto_adv:
        for capital in [50_000.0, 250_000.0, 1_000_000.0]:
            bps = []
            for t, w in noncrypto_weights.items():
                adv = noncrypto_adv.get(t)
                if not adv or adv <= 0:
                    continue
                order_usd = capital * w * avg_turnover
                ratio = max(order_usd / adv, 0.0)
                bps.append(15.0 * np.sqrt(ratio))
            if bps:
                impact_scenarios_noncrypto[f"capital_{int(capital)}"] = {
                    "avg_impact_bps": float(np.mean(bps)),
                    "max_impact_bps": float(np.max(bps)),
                }

    cap_out_noncrypto: Dict[str, Any] = {}
    if noncrypto_weights and noncrypto_adv:
        for part in participation_caps:
            per_ticker = {}
            portfolio_caps = []
            for t, w in noncrypto_weights.items():
                if t not in noncrypto_adv or w <= 0:
                    continue
                c = (part * noncrypto_adv[t]) / w
                per_ticker[t] = float(c)
                portfolio_caps.append(c)
            if portfolio_caps:
                cap_out_noncrypto[f"{int(part*10000)}bps_adv_participation"] = {
                    "portfolio_capacity_usd": float(min(portfolio_caps)),
                    "ticker_capacity_usd": per_ticker,
                }

    return {
        "lookback_days": 90,
        "avg_turnover_used": float(avg_turnover),
        "adv_tickers_used": len(adv_by_ticker),
        "adv_usd_median_by_ticker": adv_by_ticker,
        "capacity_by_participation": cap_out,
        "impact_proxy_scenarios": impact_scenarios,
        "adv_noncrypto_tickers_used": len(noncrypto_adv),
        "capacity_by_participation_noncrypto": cap_out_noncrypto,
        "impact_proxy_scenarios_noncrypto": impact_scenarios_noncrypto,
    }


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _multiple_testing_diagnostics(run_eval: Dict[str, Any]) -> Dict[str, Any]:
    all_runs = run_eval.get("all_runs", []) if isinstance(run_eval, dict) else []
    if not all_runs:
        return {}
    rows: List[Dict[str, Any]] = []
    for r in all_runs:
        t = _safe_float(r.get("active_t_stat"))
        if t is None:
            continue
        p = float(2.0 * (1.0 - _normal_cdf(abs(t))))
        rows.append({"run_dir": r.get("run_dir"), "active_t_stat": t, "p_value": p})
    if not rows:
        return {}
    rows = sorted(rows, key=lambda x: x["p_value"])
    m = len(rows)
    # Benjamini-Hochberg q-values
    qvals = [0.0] * m
    prev = 1.0
    for i in range(m - 1, -1, -1):
        rank = i + 1
        q = min(prev, rows[i]["p_value"] * m / rank)
        qvals[i] = q
        prev = q
    for i in range(m):
        rows[i]["q_value_bh"] = float(qvals[i])
    discoveries_10 = int(sum(1 for x in rows if x["q_value_bh"] <= 0.10))
    discoveries_05 = int(sum(1 for x in rows if x["q_value_bh"] <= 0.05))
    return {
        "n_hypotheses": m,
        "discoveries_q10": discoveries_10,
        "discoveries_q05": discoveries_05,
        "top_tests": rows[:8],
    }


def _rolling_stability_diagnostics(best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not best_run:
        return {}
    eq = Path(best_run.get("equity_file", ""))
    bm = Path(best_run.get("benchmark_file", ""))
    if not eq.exists() or not bm.exists():
        return {}
    s = _read_equity_series(eq)
    b = _read_equity_series(bm)
    if s is None or b is None:
        return {}
    rb = pd.concat(
        [
            s.pct_change().replace([np.inf, -np.inf], np.nan).rename("sr"),
            b.pct_change().replace([np.inf, -np.inf], np.nan).rename("br"),
        ],
        axis=1,
    ).dropna(how="any")
    if rb.shape[0] < 252:
        return {}
    freq = _infer_freq_per_year(rb.index)
    win = 63 if freq >= 200 else (26 if freq >= 52 else 12)
    if rb.shape[0] < (win * 2):
        return {}
    rolling_sharpe = rb["sr"].rolling(win).mean() / rb["sr"].rolling(win).std(ddof=1) * np.sqrt(freq)
    rolling_beta = rb["sr"].rolling(win).cov(rb["br"]) / rb["br"].rolling(win).var(ddof=1)
    rolling_active = (rb["sr"] - rb["br"]).rolling(win).mean() * freq

    def _summary(x: pd.Series) -> Dict[str, Any]:
        x = x.dropna()
        if x.empty:
            return {}
        mid = len(x) // 2
        first = x.iloc[:mid]
        second = x.iloc[mid:]
        return {
            "mean": float(x.mean()),
            "p10": float(x.quantile(0.10)),
            "p50": float(x.quantile(0.50)),
            "p90": float(x.quantile(0.90)),
            "first_half_mean": float(first.mean()) if len(first) else None,
            "second_half_mean": float(second.mean()) if len(second) else None,
            "drift_second_minus_first": float(second.mean() - first.mean()) if len(first) and len(second) else None,
        }

    return {
        "window_periods": int(win),
        "n_obs": int(rb.shape[0]),
        "rolling_sharpe": _summary(rolling_sharpe),
        "rolling_beta": _summary(rolling_beta),
        "rolling_active_alpha": _summary(rolling_active),
    }


def _regime_decomposition(best_run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not best_run:
        return {}
    eq = Path(best_run.get("equity_file", ""))
    bm = Path(best_run.get("benchmark_file", ""))
    if not eq.exists() or not bm.exists():
        return {}
    s = _read_equity_series(eq)
    b = _read_equity_series(bm)
    if s is None or b is None:
        return {}
    rb = pd.concat(
        [
            s.pct_change().replace([np.inf, -np.inf], np.nan).rename("sr"),
            b.pct_change().replace([np.inf, -np.inf], np.nan).rename("br"),
        ],
        axis=1,
    ).dropna(how="any")
    if rb.shape[0] < 252:
        return {}
    freq = _infer_freq_per_year(rb.index)
    vol_win = 21 if freq >= 200 else (8 if freq >= 52 else 3)
    trend_win = 63 if freq >= 200 else (26 if freq >= 52 else 6)
    rb["bmk_vol"] = rb["br"].rolling(vol_win).std(ddof=1) * np.sqrt(freq)
    rb["bmk_trend"] = rb["br"].rolling(trend_win).mean() * freq
    rb = rb.dropna(how="any")
    if rb.empty:
        return {}
    vol_med = float(rb["bmk_vol"].median())
    rb["regime"] = np.where(
        (rb["bmk_trend"] >= 0) & (rb["bmk_vol"] <= vol_med),
        "calm_up",
        np.where((rb["bmk_trend"] >= 0) & (rb["bmk_vol"] > vol_med), "volatile_up",
                 np.where((rb["bmk_trend"] < 0) & (rb["bmk_vol"] <= vol_med), "calm_down", "volatile_down")),
    )
    out: Dict[str, Any] = {}
    for rg, g in rb.groupby("regime"):
        if len(g) < 20:
            continue
        active = g["sr"] - g["br"]
        out[str(rg)] = {
            "n_obs": int(len(g)),
            "strategy_mean_ann": float(g["sr"].mean() * freq),
            "benchmark_mean_ann": float(g["br"].mean() * freq),
            "active_alpha_ann": float(active.mean() * freq),
            "active_t_stat": float(active.mean() / (active.std(ddof=1) / np.sqrt(len(active)))) if active.std(ddof=1) > 0 else None,
        }
    return {"frequency_per_year": int(freq), "regimes": out}


def _collect_latest_strategy_signal(root: Path) -> Optional[StrategySnapshot]:
    candidates = list(root.glob("backtests/outputs/**/strategy/signal.json"))
    candidates += list(root.glob("backtests/outputs/signals/*.json"))
    latest = _discover_latest(candidates)
    if latest is None:
        return None
    d = _load_json(latest)
    w = d.get("weights", {}) if isinstance(d.get("weights", {}), dict) else {}
    hhi, eff_n = _portfolio_concentration(w)
    cash_weight = float(sum(float(v) for k, v in w.items() if str(k).upper() in {"CASH", "BIL", "SGOV", "SHV", "SHY"}))
    top = sorted(w.items(), key=lambda kv: float(kv[1]), reverse=True)[:10]
    return StrategySnapshot(
        path=str(latest),
        strategy=d.get("strategy"),
        as_of_month=d.get("as_of_month"),
        n_weights=len(w),
        cash_weight=cash_weight,
        effective_n=eff_n if math.isfinite(eff_n) else None,
        top_weights=[{"ticker": k, "weight": float(v)} for k, v in top],
    )


def _champions_from_grid(root: Path, top_n: int = 8) -> List[BacktestChampion]:
    champs: List[BacktestChampion] = []
    seen = set()
    for gf in root.glob("backtests/outputs/**/grid_results.json"):
        try:
            blob = _load_json(gf)
            if not isinstance(blob, list):
                continue
            for row in blob:
                if not isinstance(row, dict):
                    continue
                score = _safe_float(row.get("score"))
                test = row.get("test", {}) if isinstance(row.get("test"), dict) else {}
                champs.append(
                    BacktestChampion(
                        file=str(gf),
                        score=score if score is not None else -1e9,
                        test_sharpe=_safe_float(test.get("sharpe")),
                        test_cagr=_safe_float(test.get("cagr")),
                        test_max_drawdown=_safe_float(test.get("max_drawdown")),
                        avg_turnover=_safe_float(row.get("avg_turnover")),
                        params=row.get("params", {}) if isinstance(row.get("params"), dict) else {},
                    )
                )
        except Exception:
            continue
    deduped: List[BacktestChampion] = []
    for c in champs:
        # Keep one representative config per realized performance profile,
        # so the pack does not repeat nearly-identical champion rows.
        sig = (
            c.file,
            _round_or_none(c.score),
            _round_or_none(c.test_sharpe),
            _round_or_none(c.test_cagr),
            _round_or_none(c.test_max_drawdown),
            _round_or_none(c.avg_turnover),
        )
        if sig in seen:
            continue
        seen.add(sig)
        deduped.append(c)
    champs = sorted(deduped, key=lambda c: c.score, reverse=True)
    return champs[:top_n]


def _pick_market_proxy(df: pd.DataFrame, stem: str) -> Optional[str]:
    instruments = [str(x) for x in df["Instrument"].dropna().astype(str)]
    if not instruments:
        return None
    unique = set(instruments)
    preferred_by_market = {
        "indonesia_10y": ["EIDO", "^JKSE", "JKSE", "IDX"],
        "taiwan_10y": ["EWT", "^TWII", "TWII", "TSM"],
    }
    preferred = preferred_by_market.get(stem, [])
    for p in preferred:
        if p in unique:
            return p
    # Fallback: choose most common non-crypto proxy to avoid BTC=BTC comparisons.
    banned = {"BTC-USD", "ETH-USD", "USDT-USD", "USDC-USD"}
    vc = df["Instrument"].astype(str).value_counts()
    for inst in vc.index:
        if str(inst) not in banned:
            return str(inst)
    return str(vc.index[0])


def _market_diag(root: Path) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    mkts = [
        root / "data_lake/markets/indonesia_10y.csv",
        root / "data_lake/markets/taiwan_10y.csv",
    ]
    returns = {}
    instrument_used: Dict[str, str] = {}
    for p in mkts:
        if not p.exists():
            continue
        df = pd.read_csv(p)
        if "Date" not in df.columns or "Price_Close" not in df.columns or "Instrument" not in df.columns:
            continue
        proxy = _pick_market_proxy(df, p.stem)
        if proxy is None:
            continue
        instrument_used[p.stem] = proxy
        df = df[df["Instrument"].astype(str) == proxy].copy()
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        s_raw = pd.Series(df["Price_Close"].astype(float).values, index=df["Date"]).dropna().sort_index()
        # Some feeds include duplicate date rows; collapse deterministically.
        s_raw = s_raw.groupby(level=0).last()
        s = s_raw.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
        # Guardrail: remove impossible daily jumps from broken raw prints.
        s = s[s.abs() <= 0.8]
        returns[p.stem] = s
    if returns:
        keys = list(returns.keys())
        aligned = pd.concat([returns[k].rename(k) for k in keys], axis=1).dropna(how="any")
        if not aligned.empty:
            out["annualized_vol"] = {k: float(aligned[k].std(ddof=1) * np.sqrt(252)) for k in aligned.columns}
            out["correlation"] = aligned.corr().to_dict()
            out["sample_days"] = int(len(aligned))
            out["instrument_used"] = instrument_used
    return out


def _sentiment_diag(root: Path) -> Dict[str, Any]:
    p = root / "data_lake/reddit_sentiment_panel.csv"
    if not p.exists():
        return {}
    df = pd.read_csv(p)
    if not {"Ticker", "Mentions", "Sentiment"}.issubset(df.columns):
        return {}
    g = df.groupby("Ticker", dropna=True).agg(
        mentions=("Mentions", "sum"),
        avg_sentiment=("Sentiment", "mean"),
    ).sort_values("mentions", ascending=False)
    top = g.head(10).reset_index().to_dict(orient="records")
    return {
        "n_rows": int(len(df)),
        "n_tickers": int(g.shape[0]),
        "top_tickers": top,
    }


def _latest_scorecard(root: Path) -> Optional[Dict[str, Any]]:
    cands = list(root.glob("backtests/outputs/**/scorecard_latest.json"))
    latest = _discover_latest(cands)
    if latest is None:
        return None
    d = _load_json(latest)
    d["_source"] = str(latest)
    return d


def _write_md(out_md: Path, payload: Dict[str, Any]) -> None:
    lines: List[str] = []
    lines.append("# Finance Mastery Pack")
    lines.append("")
    lines.append(f"- generated_at: `{payload['generated_at']}`")
    lines.append(f"- repo: `Sharpe-Renaissance`")
    lines.append("")

    if payload.get("scorecard"):
        sc = payload["scorecard"]
        p = sc.get("performance", {})
        pos = sc.get("positioning", {})
        lines.append("## Live Strategy Risk/Performance")
        lines.append("")
        lines.append(f"- source: `{sc.get('_source','')}`")
        lines.append(f"- sharpe_daily_252: `{p.get('sharpe_daily_252', 'n/a')}`")
        lines.append(f"- cagr_since_start: `{p.get('cagr_since_start', 'n/a')}`")
        lines.append(f"- max_drawdown: `{p.get('max_drawdown_from_ledger', 'n/a')}`")
        lines.append(f"- return_30d: `{p.get('return_30d', 'n/a')}`")
        lines.append(f"- strategy: `{pos.get('strategy', 'n/a')}`")
        lines.append(f"- cash_weight: `{pos.get('cash_weight', 'n/a')}`")
        lines.append("")

    snap = payload.get("strategy_snapshot")
    if snap:
        lines.append("## Portfolio Construction Snapshot")
        lines.append("")
        lines.append(f"- source: `{snap['path']}`")
        lines.append(f"- as_of_month: `{snap.get('as_of_month')}`")
        lines.append(f"- n_weights: `{snap.get('n_weights')}`")
        lines.append(f"- effective_n: `{snap.get('effective_n')}`")
        lines.append(f"- cash_weight: `{snap.get('cash_weight')}`")
        lines.append("")

    champs = payload.get("backtest_champions", [])
    if champs:
        lines.append("## Robustness / Best Backtest Candidates")
        lines.append("")
        df = pd.DataFrame(champs)[["score", "test_sharpe", "test_cagr", "test_max_drawdown", "avg_turnover", "file"]]
        lines.append(df.to_markdown(index=False))
        lines.append("")

    if payload.get("run_evaluation"):
        reval = payload["run_evaluation"]
        best = reval.get("best_run")
        if best:
            lines.append("## Statistical Validation (Best Run)")
            lines.append("")
            lines.append(f"- runs_evaluated: `{reval.get('n_runs_evaluated')}`")
            lines.append(f"- run_dir: `{best.get('run_dir')}`")
            lines.append(f"- n_obs: `{best.get('n_obs')}`")
            lines.append(f"- sharpe: `{best.get('sharpe')}`")
            lines.append(f"- cagr: `{best.get('cagr')}`")
            lines.append(f"- max_drawdown: `{best.get('max_drawdown')}`")
            lines.append(f"- annualized_alpha_vs_benchmark: `{best.get('annualized_alpha')}`")
            lines.append(f"- active_t_stat: `{best.get('active_t_stat')}`")
            lines.append(f"- bootstrap_pvalue: `{best.get('active_bootstrap_p')}`")
            lines.append(f"- beta: `{best.get('beta')}`")
            lines.append(f"- r2: `{best.get('r2')}`")
            lines.append("")

    if payload.get("execution_realism"):
        ex = payload["execution_realism"]
        lines.append("## Execution Realism Stress")
        lines.append("")
        base = ex.get("base", {})
        lines.append(f"- base_cagr: `{base.get('cagr')}`")
        lines.append(f"- base_sharpe: `{base.get('sharpe')}`")
        lines.append(f"- base_max_drawdown: `{base.get('max_drawdown')}`")
        for k, v in ex.get("slippage_scenarios", {}).items():
            lines.append(f"- {k}_cagr: `{v.get('cagr')}`")
            lines.append(f"- {k}_sharpe: `{v.get('sharpe')}`")
            lines.append(f"- {k}_max_drawdown: `{v.get('max_drawdown')}`")
        lines.append("")

    if payload.get("benchmark_gates"):
        bg = payload["benchmark_gates"]
        lines.append("## Benchmark Gates")
        lines.append("")
        lines.append(f"- passed: `{bg.get('passed')}/{bg.get('total')}`")
        lines.append(f"- pass_rate: `{bg.get('pass_rate')}`")
        lines.append(f"- verdict: `{bg.get('verdict')}`")
        lines.append("")

    if payload.get("purged_walkforward_diagnostics"):
        wf = payload["purged_walkforward_diagnostics"]
        lines.append("## Purged Walk-Forward Diagnostics")
        lines.append("")
        lines.append(f"- n_folds: `{wf.get('n_folds')}`")
        lines.append(f"- train_len: `{wf.get('train_len')}`")
        lines.append(f"- embargo_len: `{wf.get('embargo_len')}`")
        lines.append(f"- test_len: `{wf.get('test_len')}`")
        lines.append(f"- mean_test_sharpe: `{wf.get('mean_test_sharpe')}`")
        lines.append(f"- mean_test_alpha_ann: `{wf.get('mean_test_alpha_ann')}`")
        lines.append(f"- pct_positive_test_sharpe: `{wf.get('pct_positive_test_sharpe')}`")
        lines.append(f"- pct_positive_test_alpha: `{wf.get('pct_positive_test_alpha')}`")
        lines.append(f"- worst_fold_test_sharpe: `{wf.get('worst_fold_test_sharpe')}`")
        lines.append(f"- worst_fold_test_alpha_ann: `{wf.get('worst_fold_test_alpha_ann')}`")
        lines.append("")

    if payload.get("causal_alpha_diagnostics"):
        cd = payload["causal_alpha_diagnostics"]
        lines.append("## Causal Alpha Diagnostics")
        lines.append("")
        lines.append(f"- n_obs: `{cd.get('n_obs')}`")
        lines.append(f"- event_days: `{cd.get('event_days')}`")
        lines.append(f"- non_event_days: `{cd.get('non_event_days')}`")
        lines.append(f"- event_day_active_uplift: `{cd.get('event_day_active_uplift')}`")
        lines.append(f"- event_day_uplift_t_stat: `{cd.get('event_day_uplift_t_stat')}`")
        lines.append(f"- event_day_placebo_pvalue: `{cd.get('event_day_placebo_pvalue')}`")
        lines.append(f"- ols_event_count_coef: `{cd.get('ols_coefficients', {}).get('event_count')}`")
        lines.append(f"- ols_event_count_t_stat: `{cd.get('ols_t_stats', {}).get('event_count')}`")
        lines.append("")

    if payload.get("capacity_diagnostics"):
        cap = payload["capacity_diagnostics"]
        lines.append("## Capacity Diagnostics")
        lines.append("")
        lines.append(f"- lookback_days: `{cap.get('lookback_days')}`")
        lines.append(f"- avg_turnover_used: `{cap.get('avg_turnover_used')}`")
        lines.append(f"- adv_tickers_used: `{cap.get('adv_tickers_used')}`")
        lines.append(f"- adv_noncrypto_tickers_used: `{cap.get('adv_noncrypto_tickers_used')}`")
        part = cap.get("capacity_by_participation", {})
        for k, v in part.items():
            lines.append(f"- {k}_portfolio_capacity_usd: `{v.get('portfolio_capacity_usd')}`")
        part_nc = cap.get("capacity_by_participation_noncrypto", {})
        for k, v in part_nc.items():
            lines.append(f"- {k}_portfolio_capacity_usd_noncrypto: `{v.get('portfolio_capacity_usd')}`")
        for k, v in cap.get("impact_proxy_scenarios", {}).items():
            lines.append(f"- {k}_avg_impact_bps: `{v.get('avg_impact_bps')}`")
            lines.append(f"- {k}_max_impact_bps: `{v.get('max_impact_bps')}`")
        for k, v in cap.get("impact_proxy_scenarios_noncrypto", {}).items():
            lines.append(f"- {k}_avg_impact_bps_noncrypto: `{v.get('avg_impact_bps')}`")
            lines.append(f"- {k}_max_impact_bps_noncrypto: `{v.get('max_impact_bps')}`")
        lines.append("")

    if payload.get("multiple_testing_diagnostics"):
        mt = payload["multiple_testing_diagnostics"]
        lines.append("## Multiple Testing Control")
        lines.append("")
        lines.append(f"- n_hypotheses: `{mt.get('n_hypotheses')}`")
        lines.append(f"- discoveries_q10: `{mt.get('discoveries_q10')}`")
        lines.append(f"- discoveries_q05: `{mt.get('discoveries_q05')}`")
        lines.append("")

    if payload.get("rolling_stability_diagnostics"):
        rs = payload["rolling_stability_diagnostics"]
        lines.append("## Rolling Stability Diagnostics")
        lines.append("")
        lines.append(f"- window_periods: `{rs.get('window_periods')}`")
        lines.append(f"- n_obs: `{rs.get('n_obs')}`")
        lines.append(f"- rolling_sharpe_drift: `{rs.get('rolling_sharpe', {}).get('drift_second_minus_first')}`")
        lines.append(f"- rolling_beta_drift: `{rs.get('rolling_beta', {}).get('drift_second_minus_first')}`")
        lines.append(f"- rolling_active_alpha_drift: `{rs.get('rolling_active_alpha', {}).get('drift_second_minus_first')}`")
        lines.append("")

    if payload.get("regime_decomposition"):
        rg = payload["regime_decomposition"]
        lines.append("## Regime Decomposition")
        lines.append("")
        for name, vals in rg.get("regimes", {}).items():
            lines.append(f"- {name}_n_obs: `{vals.get('n_obs')}`")
            lines.append(f"- {name}_active_alpha_ann: `{vals.get('active_alpha_ann')}`")
            lines.append(f"- {name}_active_t_stat: `{vals.get('active_t_stat')}`")
        lines.append("")

    if payload.get("market_diagnostics"):
        lines.append("## Market Diagnostics")
        lines.append("")
        md = payload["market_diagnostics"]
        lines.append(f"- sample_days: `{md.get('sample_days', 'n/a')}`")
        lines.append(f"- annualized_vol: `{md.get('annualized_vol', {})}`")
        lines.append("")

    if payload.get("sentiment_diagnostics"):
        lines.append("## Sentiment Overlay Diagnostics")
        lines.append("")
        sd = payload["sentiment_diagnostics"]
        lines.append(f"- n_rows: `{sd.get('n_rows')}`")
        lines.append(f"- n_tickers: `{sd.get('n_tickers')}`")
        lines.append("")

    lines.append("## Limitations")
    lines.append("")
    lines.append("- This pack aggregates available run artifacts; it does not imply live execution performance.")
    lines.append("- Results depend on source data quality, transaction cost assumptions, and regime shifts.")
    lines.append("- Use alongside compliance checks before any capital deployment.")

    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a unified finance mastery pack from Sharpe-Renaissance artifacts.")
    ap.add_argument("--out-dir", default="reports/finance_mastery")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    out_dir = root / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    payload: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scorecard": _latest_scorecard(root),
        "strategy_snapshot": asdict(_collect_latest_strategy_signal(root)) if _collect_latest_strategy_signal(root) else None,
        "backtest_champions": [asdict(x) for x in _champions_from_grid(root, top_n=10)],
        "market_diagnostics": _market_diag(root),
        "sentiment_diagnostics": _sentiment_diag(root),
    }
    run_eval = _evaluate_equity_pairs(root, top_n=8)
    payload["run_evaluation"] = run_eval
    payload["execution_realism"] = _execution_realism(root, run_eval.get("best_run") if run_eval else None)
    payload["purged_walkforward_diagnostics"] = _purged_walkforward_diagnostics(
        run_eval.get("best_run") if run_eval else None
    )
    payload["benchmark_gates"] = _benchmark_gates(
        run_eval.get("best_run") if run_eval else None,
        payload["execution_realism"],
        payload["purged_walkforward_diagnostics"],
    )
    payload["causal_alpha_diagnostics"] = _causal_alpha_diagnostics(root, run_eval.get("best_run") if run_eval else None)
    payload["capacity_diagnostics"] = _capacity_diagnostics(
        root,
        payload.get("strategy_snapshot"),
        run_eval.get("best_run") if run_eval else None,
    )
    payload["multiple_testing_diagnostics"] = _multiple_testing_diagnostics(run_eval)
    payload["rolling_stability_diagnostics"] = _rolling_stability_diagnostics(run_eval.get("best_run") if run_eval else None)
    payload["regime_decomposition"] = _regime_decomposition(run_eval.get("best_run") if run_eval else None)

    out_json = out_dir / "finance_mastery_pack.json"
    out_md = out_dir / "finance_mastery_pack.md"
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    _write_md(out_md, payload)

    print(f"wrote: {out_json}")
    print(f"wrote: {out_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
