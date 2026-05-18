#!/usr/bin/env python3
"""
Cross-sectional benchmark strategies (walk-forward, out-of-sample).

Rationale:
Single-asset timing signals are often weak. Cross-sectional strategies
(long winners, short losers) are a more realistic path to alpha.

This script:
  - loads a tidy panel (Instrument, Date, Price_Close, Volume)
  - builds a price matrix
  - computes features (momentum, reversal, vol, drawdown, volume trend)
  - runs rolling walk-forward backtests:
      * momentum LS (long top N, short bottom N)
      * low-vol momentum (rank by momentum, weight by inverse vol)
      * ML cross-sectional score (logistic regression) [optional]
  - reports OOS metrics and saves equity curves
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Metrics:
    cagr: float
    sharpe: float
    max_drawdown: float
    annual_vol: float
    final_equity: float


def _returns(prices: pd.DataFrame) -> pd.DataFrame:
    return prices.pct_change(fill_method=None).fillna(0.0)


def _max_drawdown(equity: pd.Series) -> float:
    dd = equity / equity.cummax() - 1.0
    return float(dd.min()) if not dd.empty else 0.0


def _metrics(pnl: pd.Series) -> Metrics:
    pnl = pnl.fillna(0.0)
    equity = (1.0 + pnl).cumprod()
    n = len(pnl)
    vol = float(pnl.std(ddof=0) * np.sqrt(252.0)) if n > 2 else 0.0
    sharpe = float((pnl.mean() * 252.0) / vol) if vol > 0 else 0.0
    cagr = float(equity.iloc[-1] ** (252.0 / n) - 1.0) if n > 1 else 0.0
    return Metrics(cagr=cagr, sharpe=sharpe, max_drawdown=_max_drawdown(equity), annual_vol=vol, final_equity=float(equity.iloc[-1]) if n else 1.0)


def load_panel(panel_csv: Path) -> Tuple[pd.DataFrame, Optional[pd.DataFrame]]:
    panel = pd.read_csv(panel_csv, parse_dates=["Date"])
    if not {"Instrument", "Date", "Price_Close"}.issubset(set(panel.columns)):
        raise ValueError("Panel must include Instrument, Date, Price_Close")

    panel = panel.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    panel["Instrument"] = panel["Instrument"].astype(str)
    panel["Price_Close"] = pd.to_numeric(panel["Price_Close"], errors="coerce")
    panel = panel.dropna(subset=["Price_Close"])

    prices = panel.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index()
    volumes = None
    if "Volume" in panel.columns:
        panel["Volume"] = pd.to_numeric(panel["Volume"], errors="coerce")
        volumes = panel.pivot_table(index="Date", columns="Instrument", values="Volume", aggfunc="last").sort_index()

    prices = prices.ffill().dropna(how="all")
    if volumes is not None:
        volumes = volumes.reindex(prices.index).ffill()
    return prices, volumes


def compute_features(prices: pd.DataFrame, volumes: Optional[pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    rets = _returns(prices)
    mom_60 = prices / prices.shift(60) - 1.0
    mom_20 = prices / prices.shift(20) - 1.0
    mom_252 = prices / prices.shift(252) - 1.0
    rev_5 = -(prices / prices.shift(5) - 1.0)
    vol_20 = rets.rolling(20, min_periods=10).std(ddof=0) * np.sqrt(252.0)
    dd = prices / prices.cummax() - 1.0
    vtrend = None
    if volumes is not None:
        vtrend = volumes.rolling(20, min_periods=10).mean() / volumes.rolling(60, min_periods=20).mean() - 1.0
    return {
        "rets": rets,
        "mom_60": mom_60,
        "mom_20": mom_20,
        "mom_252": mom_252,
        "rev_5": rev_5,
        "vol_20": vol_20,
        "drawdown": dd,
        "vtrend": vtrend,
    }


def _rank_to_weights(rank: pd.Series, top_n: int, bottom_n: int, vol: Optional[pd.Series] = None) -> pd.Series:
    rank = rank.dropna()
    if len(rank) < top_n + bottom_n:
        return pd.Series(dtype=float)

    longs = rank.nlargest(top_n).index
    shorts = rank.nsmallest(bottom_n).index

    if vol is not None:
        v = vol.reindex(rank.index).replace(0.0, np.nan)
        inv = (1.0 / v).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        wl = inv.reindex(longs)
        ws = inv.reindex(shorts)
        wl = wl / wl.sum() if wl.sum() != 0 else wl
        ws = ws / ws.sum() if ws.sum() != 0 else ws
    else:
        wl = pd.Series(1.0 / max(len(longs), 1), index=longs)
        ws = pd.Series(1.0 / max(len(shorts), 1), index=shorts)

    wl = wl * 0.5
    ws = ws * -0.5
    return pd.concat([wl, ws]).fillna(0.0)


def walk_forward_cross_sectional(
    prices: pd.DataFrame,
    volumes: Optional[pd.DataFrame],
    train_days: int,
    test_days: int,
    top_n: int,
    bottom_n: int,
    cost_bps: float,
    method: str,
    use_ml: bool,
    rebalance_days: int,
    target_vol: float,
) -> Tuple[pd.Series, Metrics]:
    feats = compute_features(prices, volumes)
    rets = feats["rets"]
    rets_next = rets.shift(-1)
    vol_20 = feats["vol_20"]
    if method in ("mom252", "mom252_invvol"):
        mom = feats["mom_252"]
    elif method in ("mom60", "mom60_invvol"):
        mom = feats["mom_60"]
    else:
        mom = feats["mom_20"]

    if method == "reversal":
        score_mat = feats["rev_5"]
    else:
        score_mat = mom

    pnl_parts: list[float] = []
    pnl_dates: list[pd.Timestamp] = []
    weight_prev: Optional[pd.Series] = None

    # Optional: ML cross-sectional scorer (simple logistic regression per day, trained on trailing window).
    ml_model = None
    if use_ml:
        from sklearn.linear_model import LogisticRegression

        ml_model = LogisticRegression(max_iter=200, n_jobs=1)

    idx = prices.index
    start = 0
    while start + train_days + test_days + 1 <= len(idx):
        train_idx = idx[start : start + train_days]
        test_idx = idx[start + train_days : start + train_days + test_days]

        if use_ml and ml_model is not None:
            # Build training set from cross-sectional rows.
            X_rows = []
            y_rows = []
            for dt in train_idx[:-1]:
                x1 = feats["mom_20"].loc[dt]
                x2 = feats["mom_60"].loc[dt]
                x3 = feats["vol_20"].loc[dt]
                x4 = feats["drawdown"].loc[dt]
                # next-day return sign as label
                y = (rets.shift(-1).loc[dt] > 0).astype(int)
                frame = pd.DataFrame({"mom20": x1, "mom60": x2, "vol": x3, "dd": x4, "y": y}).dropna()
                if frame.empty:
                    continue
                X_rows.append(frame[["mom20", "mom60", "vol", "dd"]])
                y_rows.append(frame["y"])
            if X_rows:
                X = pd.concat(X_rows).to_numpy()
                y = pd.concat(y_rows).to_numpy()
                # guard against degenerate labels
                if len(np.unique(y)) > 1:
                    ml_model.fit(X, y)

            # Create daily ML score in the test window and trade next-day.
            for dt in test_idx:
                x1 = feats["mom_20"].loc[dt]
                x2 = feats["mom_60"].loc[dt]
                x3 = feats["vol_20"].loc[dt]
                x4 = feats["drawdown"].loc[dt]
                frame = pd.DataFrame({"mom20": x1, "mom60": x2, "vol": x3, "dd": x4}).dropna()
                if frame.empty:
                    pnl_parts.append(0.0)
                    continue
                proba = None
                if hasattr(ml_model, "coef_") and getattr(ml_model, "classes_", None) is not None:
                    try:
                        proba = ml_model.predict_proba(frame.to_numpy())[:, 1]
                    except Exception:
                        proba = None
                score = pd.Series(proba, index=frame.index) if proba is not None else score_mat.loc[dt].reindex(frame.index)
                cost = 0.0
                # rebalance only every N days; hold weights between rebalances
                if weight_prev is None or (rebalance_days > 0 and (len(pnl_parts) % rebalance_days == 0)):
                    w = _rank_to_weights(score, top_n=top_n, bottom_n=bottom_n, vol=vol_20.loc[dt] if method.endswith("invvol") else None)
                    if w.empty:
                        weight_prev = pd.Series(dtype=float)
                    else:
                        prior = weight_prev.reindex(w.index).fillna(0.0) if weight_prev is not None else 0.0
                        turnover = float((w - prior).abs().sum())
                        cost = turnover * (cost_bps / 1e4)
                        weight_prev = w

                w_eff = weight_prev if weight_prev is not None else pd.Series(dtype=float)
                day_ret = rets_next.loc[dt].reindex(w_eff.index).fillna(0.0)
                pnl_parts.append(float((w_eff * day_ret).sum()) - cost)
                pnl_dates.append(dt)
        else:
            for dt in test_idx:
                score = score_mat.loc[dt]
                cost = 0.0
                if weight_prev is None or (rebalance_days > 0 and (len(pnl_parts) % rebalance_days == 0)):
                    w = _rank_to_weights(score, top_n=top_n, bottom_n=bottom_n, vol=vol_20.loc[dt] if method.endswith("invvol") else None)
                    if w.empty:
                        weight_prev = pd.Series(dtype=float)
                    else:
                        prior = weight_prev.reindex(w.index).fillna(0.0) if weight_prev is not None else 0.0
                        turnover = float((w - prior).abs().sum())
                        cost = turnover * (cost_bps / 1e4)
                        weight_prev = w

                w_eff = weight_prev if weight_prev is not None else pd.Series(dtype=float)
                day_ret = rets_next.loc[dt].reindex(w_eff.index).fillna(0.0)
                pnl_parts.append(float((w_eff * day_ret).sum()) - cost)
                pnl_dates.append(dt)

        start += test_days

    pnl = pd.Series(pnl_parts, index=pd.DatetimeIndex(pnl_dates)).sort_index()
    if target_vol > 0 and len(pnl) > 60:
        # Rolling vol-targeting using only past realized pnl (no lookahead).
        roll = pnl.rolling(60, min_periods=30).std(ddof=0) * np.sqrt(252.0)
        scale = (target_vol / roll).replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(0.0, 3.0)
        pnl = pnl * scale.shift(1).fillna(0.0)
    return pnl, _metrics(pnl)


def main() -> int:
    parser = argparse.ArgumentParser(description="Cross-sectional benchmark (OOS).")
    parser.add_argument("--panel", type=Path, required=True)
    parser.add_argument("--min-cols", type=int, default=30, help="Minimum instruments required")
    parser.add_argument("--universe", choices=["all", "equities", "crypto"], default="equities")
    parser.add_argument("--exclude", nargs="*", default=[], help="Tickers to exclude (e.g. ETFs)")
    parser.add_argument("--train-days", type=int, default=252)
    parser.add_argument("--test-days", type=int, default=21)
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--bottom-n", type=int, default=10)
    parser.add_argument("--cost-bps", type=float, default=10.0)
    parser.add_argument("--rebalance-days", type=int, default=5, help="Rebalance frequency in trading days")
    parser.add_argument("--target-vol", type=float, default=0.0, help="Annualized vol target (e.g. 0.10); 0 disables")
    parser.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/cross_sectional"))
    parser.add_argument("--use-ml", action="store_true")
    args = parser.parse_args()

    prices, volumes = load_panel(args.panel)
    if args.universe == "crypto":
        keep = [c for c in prices.columns if c.endswith("-USD")]
        prices = prices[keep]
        if volumes is not None:
            volumes = volumes[keep]
    elif args.universe == "equities":
        keep = [c for c in prices.columns if not c.endswith("-USD")]
        prices = prices[keep]
        if volumes is not None:
            volumes = volumes[keep]

    if args.universe == "equities" and not args.exclude:
        # Default ETF exclusions for equity cross-sectional tests.
        args.exclude = ["SPY", "QQQ", "IWM", "GLD", "TLT"]
    if args.exclude:
        drop = [c for c in prices.columns if c in set(args.exclude)]
        if drop:
            prices = prices.drop(columns=drop)
            if volumes is not None:
                volumes = volumes.drop(columns=drop, errors="ignore")
    # drop instruments with too much missing history
    good = prices.notna().sum().sort_values(ascending=False)
    prices = prices[good.index]
    if prices.shape[1] < args.min_cols:
        print(f"Not enough instruments in panel after cleaning: {prices.shape[1]} < {args.min_cols}")
        return 1

    methods = ["mom252", "mom252_invvol", "mom60", "mom60_invvol", "mom20", "reversal"]
    results = []
    eq_curves = {}
    for m in methods:
        pnl, met = walk_forward_cross_sectional(
            prices=prices,
            volumes=volumes,
            train_days=args.train_days,
            test_days=args.test_days,
            top_n=args.top_n,
            bottom_n=args.bottom_n,
            cost_bps=args.cost_bps,
            method=m,
            use_ml=args.use_ml and m in ("mom60_invvol", "mom60"),
            rebalance_days=args.rebalance_days,
            target_vol=args.target_vol,
        )
        results.append({"method": m, **asdict(met)})
        eq_curves[m] = (1.0 + pnl.fillna(0.0)).cumprod()

    out = pd.DataFrame(results).sort_values(["sharpe", "cagr"], ascending=False)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out_dir / "summary.csv", index=False)
    (args.out_dir / "summary.json").write_text(json.dumps(results, indent=2))
    for name, eq in eq_curves.items():
        eq.to_csv(args.out_dir / f"equity_{name}.csv", header=["equity"])

    print(out.to_string(index=False))
    print(f"✅ Wrote cross-sectional outputs to {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
