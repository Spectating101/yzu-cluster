#!/usr/bin/env python3
"""
Academic-style robustness protocol for the passive crypto ML portfolio.

Key idea: do NOT tune on the final holdout.
1) Run a small parameter grid.
2) Pick best params on validation window only.
3) Report holdout (untouched) performance.

This is not a guarantee of future performance; it is a guardrail against
accidental overfitting to the full history.
"""

from __future__ import annotations

import argparse
import importlib.util
import itertools
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

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


def _load_crypto_ml_module(path: Path):
    spec = importlib.util.spec_from_file_location("crypto_passive_ml_portfolio", str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {path}")
    mod = importlib.util.module_from_spec(spec)
    # Some stdlib components (e.g. dataclasses) expect the module to be present in
    # sys.modules during execution.
    import sys

    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def _split_months(
    pnl: pd.Series, train_frac: float, val_frac: float
) -> Tuple[pd.DatetimeIndex, pd.DatetimeIndex, pd.DatetimeIndex]:
    idx = pd.DatetimeIndex(pnl.index).sort_values()
    n = len(idx)
    if n < 36:
        raise ValueError(f"Need at least 36 months of pnl to split, have {n}")
    n_train = max(12, int(round(n * train_frac)))
    n_val = max(6, int(round(n * val_frac)))
    n_train = min(n_train, n - 12)
    n_val = min(n_val, n - n_train - 6)
    train = idx[:n_train]
    val = idx[n_train : n_train + n_val]
    test = idx[n_train + n_val :]
    return train, val, test


def _objective(perf: Perf, max_dd_floor: float) -> Tuple[int, float, float]:
    """
    Higher is better.
    - First component is feasibility (1 ok, 0 reject).
    - Then Sharpe, then CAGR (tie-breaker).
    """

    feasible = int((perf.n_months > 6) and (perf.max_drawdown >= max_dd_floor))
    return (feasible, perf.sharpe, perf.cagr)


def _grid(params: Dict[str, List[Any]]) -> Iterable[Dict[str, Any]]:
    keys = list(params.keys())
    for values in itertools.product(*[params[k] for k in keys]):
        yield dict(zip(keys, values))


def run_protocol(
    panel: Path,
    script_path: Path,
    out_dir: Path,
    train_months: int,
    min_history_months: int,
    max_assets: int,
    grid_params: Dict[str, List[Any]],
    seed: int,
    train_frac: float,
    val_frac: float,
    max_dd_floor: float,
) -> Dict[str, Any]:
    mod = _load_crypto_ml_module(script_path)
    prices_daily, vols_daily = mod.load_prices(panel, universe="crypto")

    # Use defaults to obtain the full pnl index for splitting.
    base_res = mod.backtest(
        prices_daily=prices_daily,
        volumes_daily=vols_daily,
        train_months=train_months,
        top_n=int(grid_params.get("top_n", [5])[0]),
        max_weight=float(grid_params.get("max_weight", [0.35])[0]),
        rebalance_months=int(grid_params.get("rebalance_months", [1])[0]),
        cost_bps=float(grid_params.get("cost_bps", [20.0])[0]),
        slippage_bps=float(grid_params.get("slippage_bps", [0.0])[0]),
        slippage_cap_bps=float(grid_params.get("slippage_cap_bps", [50.0])[0]),
        slippage_ref_participation=float(grid_params.get("slippage_ref_participation", [0.001])[0]),
        target_vol=float(grid_params.get("target_vol", [0.20])[0]),
        dd_throttle=float(grid_params.get("dd_throttle", [0.25])[0]),
        dd_floor_exposure=float(grid_params.get("dd_floor_exposure", [0.35])[0]),
        btc_filter=bool(grid_params.get("btc_filter", [True])[0]),
        seed=seed,
        min_history_months=min_history_months,
        max_assets=max_assets,
        max_abs_monthly_return=float(grid_params.get("max_abs_monthly_return", [3.0])[0]),
        min_median_dollar_volume=float(grid_params.get("min_median_dollar_volume", [0.0])[0]),
        dollar_volume_lookback_months=int(grid_params.get("dollar_volume_lookback_months", [6])[0]),
        exclude_numeric_tickers=bool(grid_params.get("exclude_numeric_tickers", [True])[0]),
    )
    if "error" in base_res:
        raise RuntimeError(base_res["error"])
    pnl_full = base_res["pnl"].sort_index()

    train_idx, val_idx, test_idx = _split_months(pnl_full, train_frac=train_frac, val_frac=val_frac)
    val_start = val_idx.min()
    test_start = test_idx.min()

    rows: List[Dict[str, Any]] = []
    best: Optional[Dict[str, Any]] = None
    best_obj: Optional[Tuple[int, float, float]] = None

    for params in _grid(grid_params):
        res = mod.backtest(
            prices_daily=prices_daily,
            volumes_daily=vols_daily,
            train_months=train_months,
            top_n=int(params["top_n"]),
            max_weight=float(params["max_weight"]),
            rebalance_months=int(params["rebalance_months"]),
            cost_bps=float(params["cost_bps"]),
            slippage_bps=float(params.get("slippage_bps", 0.0)),
            slippage_cap_bps=float(params.get("slippage_cap_bps", 50.0)),
            slippage_ref_participation=float(params.get("slippage_ref_participation", 0.001)),
            target_vol=float(params["target_vol"]),
            dd_throttle=float(params["dd_throttle"]),
            dd_floor_exposure=float(params["dd_floor_exposure"]),
            btc_filter=bool(params["btc_filter"]),
            seed=seed,
            min_history_months=min_history_months,
            max_assets=max_assets,
            max_abs_monthly_return=float(params["max_abs_monthly_return"]),
            min_median_dollar_volume=float(params.get("min_median_dollar_volume", 0.0)),
            dollar_volume_lookback_months=int(params.get("dollar_volume_lookback_months", 6)),
            exclude_numeric_tickers=bool(params["exclude_numeric_tickers"]),
        )
        if "error" in res:
            continue
        pnl = res["pnl"].sort_index()
        val_pnl = pnl.loc[(pnl.index >= val_start) & (pnl.index < test_start)]
        test_pnl = pnl.loc[pnl.index >= test_start]

        val_perf = _perf(val_pnl)
        test_perf = _perf(test_pnl)
        row = {
            **params,
            "val": asdict(val_perf),
            "test": asdict(test_perf),
        }
        rows.append(row)

        obj = _objective(val_perf, max_dd_floor=max_dd_floor)
        if best_obj is None or obj > best_obj:
            best_obj = obj
            best = row

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "protocol_grid.json").write_text(json.dumps(rows, indent=2))
    if best is not None:
        (out_dir / "protocol_best.json").write_text(json.dumps(best, indent=2))

    summary = {
        "panel": str(panel),
        "split": {
            "val_start": str(val_start.date()),
            "test_start": str(test_start.date()),
            "n_months_total": int(len(pnl_full)),
            "n_months_val": int(len(val_idx)),
            "n_months_test": int(len(test_idx)),
        },
        "grid_size": int(len(list(_grid(grid_params)))),
        "best": best,
    }
    (out_dir / "protocol_summary.json").write_text(json.dumps(summary, indent=2))
    return summary


def main() -> int:
    p = argparse.ArgumentParser(description="Robustness protocol for the passive crypto ML portfolio.")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument(
        "--crypto-ml-script",
        type=Path,
        default=Path("Sharpe-Renaissance/scripts/crypto_passive_ml_portfolio.py"),
        help="Path to crypto_passive_ml_portfolio.py",
    )
    p.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/crypto_ml_protocol"))
    p.add_argument("--train-months", type=int, default=36)
    p.add_argument("--min-history-months", type=int, default=48)
    p.add_argument("--max-assets", type=int, default=20)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--train-frac", type=float, default=0.6)
    p.add_argument("--val-frac", type=float, default=0.2)
    p.add_argument("--max-dd-floor", type=float, default=-0.35, help="Reject configs with worse drawdown than this (validation)")

    # Small, pre-registered grid (keep tight to reduce data-snooping).
    p.add_argument("--top-n", type=int, nargs="+", default=[3, 5, 7])
    p.add_argument("--max-weight", type=float, nargs="+", default=[0.25, 0.35, 0.5])
    p.add_argument("--target-vol", type=float, nargs="+", default=[0.12, 0.16, 0.20])
    p.add_argument("--cost-bps", type=float, nargs="+", default=[10.0, 20.0])
    p.add_argument("--dd-throttle", type=float, nargs="+", default=[0.2, 0.25, 0.35])
    p.add_argument("--dd-floor-exposure", type=float, nargs="+", default=[0.25, 0.35, 0.5])
    p.add_argument("--rebalance-months", type=int, nargs="+", default=[1])
    p.add_argument("--btc-filter", type=int, nargs="+", default=[1], help="1=on, 0=off")
    p.add_argument("--max-abs-monthly-return", type=float, nargs="+", default=[3.0])
    p.add_argument("--exclude-numeric-tickers", type=int, nargs="+", default=[1])
    args = p.parse_args()

    grid_params = {
        "top_n": args.top_n,
        "max_weight": args.max_weight,
        "rebalance_months": args.rebalance_months,
        "cost_bps": args.cost_bps,
        "slippage_bps": [0.0],
        "slippage_cap_bps": [50.0],
        "slippage_ref_participation": [0.001],
        "target_vol": args.target_vol,
        "dd_throttle": args.dd_throttle,
        "dd_floor_exposure": args.dd_floor_exposure,
        "btc_filter": [bool(x) for x in args.btc_filter],
        "max_abs_monthly_return": args.max_abs_monthly_return,
        "min_median_dollar_volume": [0.0],
        "dollar_volume_lookback_months": [6],
        "exclude_numeric_tickers": [bool(x) for x in args.exclude_numeric_tickers],
    }

    summary = run_protocol(
        panel=args.panel,
        script_path=args.crypto_ml_script,
        out_dir=args.out_dir,
        train_months=args.train_months,
        min_history_months=args.min_history_months,
        max_assets=args.max_assets,
        grid_params=grid_params,
        seed=args.seed,
        train_frac=args.train_frac,
        val_frac=args.val_frac,
        max_dd_floor=args.max_dd_floor,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
