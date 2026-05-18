#!/usr/bin/env python3
"""
Regime detection module (offline).

Implements a 2-state Markov switching model (statsmodels) as an HMM-like regime detector,
with a robust fallback to volatility-based regimes when model fit is unstable.

Outputs:
- `regimes.csv`: date, return, p_regime0, p_regime1, regime
- `summary.json`: fit summary and basic regime stats
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class RegimeSummary:
    method: str
    n: int
    start: str
    end: str
    high_vol_regime: int
    avg_return_reg0: float
    avg_return_reg1: float


def load_returns(panel_csv: Path, instrument: str, *, freq: str) -> pd.Series:
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
    if freq:
        s = s.resample(freq).last().dropna()
    r = s.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    return r


def _fallback_vol_regime(r: pd.Series, *, vol_window: int) -> pd.DataFrame:
    vol = r.rolling(vol_window, min_periods=max(6, vol_window // 2)).std(ddof=0)
    thr = float(vol.median())
    regime = (vol > thr).astype(int).fillna(0).astype(int)
    out = pd.DataFrame(
        {
            "return": r,
            "p_regime0": 1.0 - regime.astype(float),
            "p_regime1": regime.astype(float),
            "regime": regime,
        }
    )
    return out


def markov_switching_regime(r: pd.Series) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    2-state Markov switching in mean and variance (robust baseline).
    """
    from statsmodels.tsa.regime_switching.markov_regression import MarkovRegression

    y = r.astype(float).to_numpy()
    model = MarkovRegression(y, k_regimes=2, trend="c", switching_variance=True)
    res = model.fit(disp=False)
    probs = res.smoothed_marginal_probabilities
    # probs is (n_obs, k_regimes) ndarray in statsmodels.
    p0 = probs[:, 0]
    p1 = probs[:, 1]
    regime = (p1 > 0.5).astype(int)
    out = pd.DataFrame({"return": r.values, "p_regime0": p0, "p_regime1": p1, "regime": regime}, index=r.index)
    info = {
        "aic": float(res.aic),
        "bic": float(res.bic),
        "llf": float(res.llf),
        "params": [float(x) for x in np.asarray(res.params).ravel().tolist()],
    }
    return out, info


def main() -> int:
    p = argparse.ArgumentParser(description="Regime detection via Markov switching (HMM-like).")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--instrument", type=str, required=True)
    p.add_argument("--freq", type=str, default="ME")
    p.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/regime_switching"))
    p.add_argument("--fallback-vol-window", type=int, default=12)
    args = p.parse_args()

    r = load_returns(args.panel, args.instrument, freq=str(args.freq))
    method = "markov_switching"
    fit_info: Optional[Dict[str, Any]] = None
    try:
        reg, fit_info = markov_switching_regime(r)
    except Exception as e:
        method = "volatility_fallback"
        reg = _fallback_vol_regime(r, vol_window=int(args.fallback_vol_window))
        fit_info = {"error": f"{type(e).__name__}: {str(e)[:200]}"}

    # Determine which regime is "high vol".
    vol0 = float(reg.loc[reg["regime"] == 0, "return"].std(ddof=0)) if (reg["regime"] == 0).any() else 0.0
    vol1 = float(reg.loc[reg["regime"] == 1, "return"].std(ddof=0)) if (reg["regime"] == 1).any() else 0.0
    high_vol_regime = int(0 if vol0 >= vol1 else 1)

    summ = RegimeSummary(
        method=method,
        n=int(len(reg)),
        start=str(reg.index.min().date()) if len(reg) else "",
        end=str(reg.index.max().date()) if len(reg) else "",
        high_vol_regime=high_vol_regime,
        avg_return_reg0=float(reg.loc[reg["regime"] == 0, "return"].mean()) if (reg["regime"] == 0).any() else 0.0,
        avg_return_reg1=float(reg.loc[reg["regime"] == 1, "return"].mean()) if (reg["regime"] == 1).any() else 0.0,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    reg_out = reg.copy()
    reg_out.insert(0, "date", reg_out.index)
    reg_out.to_csv(args.out_dir / "regimes.csv", index=False)
    (args.out_dir / "summary.json").write_text(json.dumps({"summary": asdict(summ), "fit": fit_info}, indent=2))
    print(json.dumps({"summary": asdict(summ), "fit": fit_info}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
