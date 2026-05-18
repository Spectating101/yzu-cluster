#!/usr/bin/env python3
"""
Forecasting workbench (offline).

This is designed for Upwork-style "time series forecasting" work:
- Rolling-origin evaluation (walk-forward)
- Multiple baselines
- Strict no-leakage splits
- Simple metrics + report artifacts

Input panel format:
  Instrument, Date, Price_Close, Volume(optional)
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
class Metrics:
    n_forecasts: int
    mae: float
    rmse: float
    mape: float
    direction_acc: float


def _safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.where(np.abs(y_true) < 1e-12, np.nan, np.abs(y_true))
    return float(np.nanmean(np.abs((y_true - y_pred) / denom)))


def _metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prev: np.ndarray) -> Metrics:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    y_prev = np.asarray(y_prev, dtype=float)
    err = y_true - y_pred
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err**2)))
    mape = _safe_mape(y_true, y_pred)
    # Direction accuracy uses sign of change vs previous actual.
    dir_true = np.sign(y_true - y_prev)
    dir_pred = np.sign(y_pred - y_prev)
    direction_acc = float(np.mean(dir_true == dir_pred))
    return Metrics(
        n_forecasts=int(len(y_true)),
        mae=mae,
        rmse=rmse,
        mape=mape,
        direction_acc=direction_acc,
    )


def load_series(panel_csv: Path, instrument: str) -> pd.Series:
    df = pd.read_csv(panel_csv)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise ValueError("Panel must have columns: Instrument, Date, Price_Close")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df = df[df["Instrument"].astype(str) == str(instrument)].copy()
    if df.empty:
        raise ValueError(f"No rows found for instrument={instrument}")
    s = (
        df.sort_values("Date")
        .drop_duplicates(subset=["Date"], keep="last")
        .set_index("Date")["Price_Close"]
    )
    s = pd.to_numeric(s, errors="coerce").dropna()
    return s


def load_exog_panel(panel_csv: Path, instruments: List[str]) -> pd.DataFrame:
    df = pd.read_csv(panel_csv)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise ValueError("Panel must have columns: Instrument, Date, Price_Close")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df = df[df["Instrument"].astype(str).isin([str(x) for x in instruments])].copy()
    if df.empty:
        raise ValueError(f"No rows found for exog instruments={instruments}")
    wide = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index()
    wide = wide.apply(pd.to_numeric, errors="coerce")
    return wide


def _fit_predict_baseline(
    y: np.ndarray,
    *,
    method: str,
    season: int,
) -> float:
    if method == "naive":
        return float(y[-1])
    if method == "seasonal_naive":
        if len(y) > season:
            return float(y[-season])
        return float(y[-1])
    if method == "moving_average":
        w = min(10, len(y))
        return float(np.mean(y[-w:]))
    raise ValueError(f"Unknown baseline method: {method}")


def _fit_predict_expsmooth(y: np.ndarray, season: int) -> float:
    # Statsmodels optional dependency (available in this environment).
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    series = pd.Series(y)
    # Keep it robust: use additive trend; optionally seasonal if enough points.
    seasonal = "add" if len(y) >= 2 * season else None
    model = ExponentialSmoothing(series, trend="add", seasonal=seasonal, seasonal_periods=season if seasonal else None)
    fit = model.fit(optimized=True)
    fc = fit.forecast(1)
    return float(fc.iloc[0])


def _fit_predict_arima(y: np.ndarray) -> float:
    # Minimal ARIMA via SARIMAX (stable in statsmodels).
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    series = pd.Series(y)
    model = SARIMAX(series, order=(1, 1, 1), enforce_stationarity=False, enforce_invertibility=False)
    fit = model.fit(disp=False)
    fc = fit.forecast(1)
    return float(fc.iloc[0])


def _ridge_arx_fit_predict(
    y: np.ndarray,
    exog: Optional[np.ndarray],
    *,
    lags: int,
    lam: float,
) -> Tuple[float, Optional[float]]:
    """
    Simple ARX with ridge regression (no external deps).

    Returns:
      (point_forecast, residual_sigma)
    """
    y = np.asarray(y, dtype=float)
    n = int(len(y))
    if n < max(10, lags + 5):
        return float(y[-1]), None

    if exog is not None:
        exog = np.asarray(exog, dtype=float)
        if exog.ndim == 1:
            exog = exog.reshape(-1, 1)
        if len(exog) != n:
            exog = None

    rows = []
    targets = []
    for t in range(lags, n):
        feats = [1.0]
        feats.extend(y[t - lags : t][::-1].tolist())
        if exog is not None:
            feats.extend(exog[t - lags : t].reshape(-1).tolist())
        rows.append(feats)
        targets.append(float(y[t]))

    X = np.asarray(rows, dtype=float)
    y_t = np.asarray(targets, dtype=float)

    # Standardize non-intercept features.
    Xn = X.copy()
    mu = np.nanmean(Xn[:, 1:], axis=0)
    sd = np.nanstd(Xn[:, 1:], axis=0)
    sd = np.where(sd < 1e-12, 1.0, sd)
    Xn[:, 1:] = (Xn[:, 1:] - mu) / sd

    XtX = Xn.T @ Xn
    Xty = Xn.T @ y_t
    k = XtX.shape[0]
    beta = np.linalg.solve(XtX + float(lam) * np.eye(k), Xty)

    # Forecast next point using the latest window.
    x_last = [1.0]
    x_last.extend(y[-lags:][::-1].tolist())
    if exog is not None:
        x_last.extend(exog[-lags:].reshape(-1).tolist())
    x_last = np.asarray(x_last, dtype=float)
    x_last[1:] = (x_last[1:] - mu) / sd
    pred = float(x_last @ beta)

    resid = y_t - (Xn @ beta)
    sigma = float(np.sqrt(np.mean(resid**2))) if len(resid) else None
    return pred, sigma


def rolling_origin_eval(
    series: pd.Series,
    *,
    freq: str,
    horizon: int,
    min_train: int,
    step: int,
    season: int,
    models: List[str],
    exog_wide: Optional[pd.DataFrame] = None,
    lags: int = 12,
    ridge_lam: float = 1.0,
) -> Tuple[pd.DataFrame, Dict[str, Metrics]]:
    """
    series: price series at daily frequency; we resample to freq (e.g., ME for monthly).
    horizon: number of steps ahead (in resampled units).
    step: how many steps between evaluation origins.
    """
    s = series.sort_index()
    if freq:
        s = s.resample(freq).last().dropna()
    y = s.to_numpy(dtype=float)
    dates = s.index
    if len(y) < min_train + horizon + 5:
        raise ValueError(f"Not enough history: have {len(y)}, need at least {min_train + horizon + 5}")

    x: Optional[np.ndarray]
    if exog_wide is not None and not exog_wide.empty:
        ex = exog_wide.sort_index()
        if freq:
            ex = ex.resample(freq).last()
        ex = ex.reindex(dates).astype(float)
        x = ex.to_numpy(dtype=float)
    else:
        x = None

    rows = []
    # For simplicity and robustness, support horizon=1 well; for horizon>1, do iterative 1-step.
    for origin in range(min_train, len(y) - horizon, step):
        train = y[:origin]
        y_prev = y[origin - 1]
        y_true = y[origin + horizon - 1]
        dt = dates[origin + horizon - 1]

        for m in models:
            pred = None
            sigma = None
            if m in {"naive", "seasonal_naive", "moving_average"}:
                pred = _fit_predict_baseline(train, method=m, season=season)
            elif m == "exp_smooth":
                pred = _fit_predict_expsmooth(train, season=season)
            elif m == "arima":
                pred = _fit_predict_arima(train)
            elif m == "ridge_arx":
                x_train = x[:origin] if x is not None else None
                pred, sigma = _ridge_arx_fit_predict(train, x_train, lags=int(lags), lam=float(ridge_lam))
            else:
                raise ValueError(f"Unknown model: {m}")

            row = {
                "date": dt,
                "model": m,
                "y_true": float(y_true),
                "y_pred": float(pred),
                "y_prev": float(y_prev),
                "origin_index": int(origin),
            }
            if m == "ridge_arx" and sigma is not None:
                # Very rough prediction intervals (normal assumption).
                row["y_pred_p10"] = float(pred - 1.2816 * sigma)
                row["y_pred_p90"] = float(pred + 1.2816 * sigma)
            rows.append(row)

    df = pd.DataFrame(rows).sort_values(["model", "date"]).reset_index(drop=True)
    metrics = {}
    for m in models:
        sub = df[df["model"] == m]
        metrics[m] = _metrics(
            sub["y_true"].to_numpy(),
            sub["y_pred"].to_numpy(),
            sub["y_prev"].to_numpy(),
        )
    return df, metrics


def main() -> int:
    p = argparse.ArgumentParser(description="Forecasting workbench (rolling-origin evaluation).")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--instrument", type=str, required=True)
    p.add_argument("--freq", type=str, default="ME", help="Resample frequency (e.g., ME for month-end, W for weekly)")
    p.add_argument("--horizon", type=int, default=1)
    p.add_argument("--min-train", type=int, default=36, help="Minimum training points in resampled units")
    p.add_argument("--step", type=int, default=1, help="Evaluation step in resampled units")
    p.add_argument("--season", type=int, default=12, help="Seasonal period in resampled units")
    p.add_argument("--models", nargs="+", default=["naive", "seasonal_naive", "moving_average", "exp_smooth", "arima", "ridge_arx"])
    p.add_argument("--exog", nargs="*", default=[], help="Optional exogenous instruments (Price_Close from panel). Used by ridge_arx.")
    p.add_argument("--lags", type=int, default=12, help="Lags used by ridge_arx.")
    p.add_argument("--ridge-lam", type=float, default=1.0, help="Ridge penalty used by ridge_arx.")
    p.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/forecasting_workbench"))
    args = p.parse_args()

    s = load_series(args.panel, args.instrument)
    exog_wide = load_exog_panel(args.panel, list(args.exog)) if args.exog else None
    preds, metrics = rolling_origin_eval(
        s,
        freq=str(args.freq),
        horizon=int(args.horizon),
        min_train=int(args.min_train),
        step=int(args.step),
        season=int(args.season),
        models=list(args.models),
        exog_wide=exog_wide,
        lags=int(args.lags),
        ridge_lam=float(args.ridge_lam),
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    preds.to_csv(args.out_dir / "predictions.csv", index=False)
    (args.out_dir / "metrics.json").write_text(json.dumps({k: asdict(v) for k, v in metrics.items()}, indent=2))

    # Simple markdown report.
    lines = []
    lines.append(f"# Forecasting Workbench Report\n\n")
    lines.append(f"- Panel: `{args.panel}`\n")
    lines.append(f"- Instrument: `{args.instrument}`\n")
    lines.append(f"- Resample: `{args.freq}` horizon={args.horizon}\n")
    lines.append(f"- Rolling origins: {preds['origin_index'].nunique()}\n\n")
    lines.append("## Metrics\n\n")
    lines.append("| model | n | MAE | RMSE | MAPE | direction_acc |\n")
    lines.append("|---|---:|---:|---:|---:|---:|\n")
    for m, met in metrics.items():
        lines.append(
            f"| `{m}` | {met.n_forecasts} | {met.mae:.6g} | {met.rmse:.6g} | {met.mape:.6g} | {met.direction_acc:.3f} |\n"
        )
    (args.out_dir / "report.md").write_text("".join(lines))

    print(json.dumps({k: asdict(v) for k, v in metrics.items()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
