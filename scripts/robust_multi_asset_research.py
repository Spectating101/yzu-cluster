#!/usr/bin/env python3
"""
Robust multi-asset research sweep (offline once panel is present).

Purpose
  Find the best "stable, ETF-beating" configuration under explicit constraints,
  using walk-forward evaluation and multiple benchmarks.

Benchmarks (all monthly, aligned to strategy pnl index)
  - raw SPY
  - 60/40 (SPY+IEF) approx rebalanced monthly
  - costed risk-managed SPY (vol target + dd throttle + costs/slippage)

Output
  - grid_results.csv / grid_results.json
  - best.json
  - report.md
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def _split_folds(
    idx: pd.DatetimeIndex, *, train_months: int, val_months: int, test_months: int, folds: int
) -> List[Tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]]:
    idx = pd.DatetimeIndex(idx).sort_values()
    n = len(idx)
    if n < train_months + val_months + test_months + 6:
        return []
    max_folds = int((n - val_months - train_months) // test_months)
    folds = max(1, min(int(folds), max_folds))
    boundaries = []
    for k in range(folds):
        test_end_i = n - 1 - k * test_months
        test_start_i = n - (k + 1) * test_months
        val_end_i = test_start_i - 1
        val_start_i = val_end_i - val_months + 1
        if val_start_i < train_months:
            break
        boundaries.append((idx[val_start_i], idx[test_start_i], idx[test_end_i]))
    return list(reversed(boundaries))


def _info_ratio(excess: pd.Series) -> float:
    excess = excess.dropna()
    if len(excess) < 12:
        return 0.0
    ann = float(excess.mean() * 12.0)
    vol = float(excess.std(ddof=0) * np.sqrt(12.0))
    return float(ann / vol) if vol > 0 else 0.0


def _perf(pnl_m: pd.Series) -> Dict[str, float]:
    pnl_m = pnl_m.fillna(0.0)
    eq = (1.0 + pnl_m).cumprod()
    n = len(pnl_m)
    vol = float(pnl_m.std(ddof=0) * np.sqrt(12.0)) if n > 2 else 0.0
    sharpe = float((pnl_m.mean() * 12.0) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (12.0 / n) - 1.0) if n > 1 else 0.0
    dd = float((eq / eq.cummax() - 1.0).min()) if n else 0.0
    worst_12m = (
        float(((1.0 + pnl_m).rolling(12).apply(np.prod, raw=True) - 1.0).min())
        if n >= 12
        else float("nan")
    )
    return {"cagr": cagr, "sharpe": sharpe, "max_dd": dd, "ann_vol": vol, "worst_12m": worst_12m}


def _score(
    *,
    excess_ann_vs_spy: float,
    excess_ann_vs_60_40: float,
    worst_fold_excess_vs_spy: float,
    max_dd: float,
    worst_12m: float,
    prefer: str,
) -> float:
    """
    Prefer is what "ETF" means for selection:
      - spy: maximize excess vs SPY
      - 60_40: maximize excess vs 60/40
      - blended: both
    """
    base = excess_ann_vs_spy if prefer == "spy" else excess_ann_vs_60_40 if prefer == "60_40" else 0.6 * excess_ann_vs_spy + 0.4 * excess_ann_vs_60_40
    # Reward positive overall excess but punish "blow-up" years.
    stability_penalty = 0.8 * min(0.0, worst_fold_excess_vs_spy)
    # Encourage good risk-adjusted behavior.
    risk_penalty = 0.2 * abs(min(0.0, max_dd)) + 0.2 * abs(min(0.0, worst_12m)) if not np.isnan(worst_12m) else 0.2 * abs(min(0.0, max_dd))
    return float(base + stability_penalty - risk_penalty)


def main() -> int:
    p = argparse.ArgumentParser(description="Robust multi-asset research sweep.")
    sr_root = Path(__file__).resolve().parents[1]
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--assets-file", type=Path, default=sr_root / "config/tickers_multi_asset_core.txt")
    p.add_argument("--benchmark", type=str, default="SPY")
    p.add_argument("--bond-benchmark", type=str, default="IEF")
    p.add_argument("--cash-proxy", type=str, default="BIL")
    p.add_argument("--out-dir", type=Path, default=sr_root / "backtests/outputs/multi_asset_research")
    p.add_argument("--prefer", choices=["spy", "60_40", "blended"], default="blended")

    # Walk-forward folds
    p.add_argument("--train-months", type=int, default=36)
    p.add_argument("--val-months", type=int, default=12)
    p.add_argument("--test-months", type=int, default=12)
    p.add_argument("--folds", type=int, default=4)

    # Stability constraints (hard)
    p.add_argument("--max-dd-cap", type=float, default=0.25)
    p.add_argument("--worst12-cap", type=float, default=0.20)
    p.add_argument("--min-excess-ann-vs-spy", type=float, default=-1e9, help="Hard constraint: minimum annualized excess return vs SPY (raw).")
    p.add_argument("--min-worst-fold-excess-ann-vs-spy", type=float, default=-1e9, help="Hard constraint: minimum worst-fold annualized excess vs SPY (raw).")

    # Frictions
    p.add_argument("--portfolio-usd", type=float, default=250000.0)
    p.add_argument("--min-median-dollar-volume", type=float, default=10_000_000.0)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    p.add_argument("--slippage-cap-bps", type=float, default=25.0)
    p.add_argument("--slippage-ref-participation", type=float, default=0.10)

    # Search space (kept moderate)
    p.add_argument("--side", choices=["long_only", "long_short"], default="long_only")
    p.add_argument("--signal-combine", choices=["sum", "prod"], default="sum")
    p.add_argument("--lookbacks", type=int, nargs="+", default=[3, 6, 12])
    p.add_argument("--mas", type=int, nargs="+", default=[8, 10, 12])
    p.add_argument("--signal-thresholds", type=float, nargs="+", default=[0.0, 0.25])
    p.add_argument("--signal-smooth-months", type=int, nargs="+", default=[1, 3])
    p.add_argument("--vol-months", type=int, nargs="+", default=[6, 12])
    p.add_argument("--target-vols", type=float, nargs="+", default=[0.10, 0.12, 0.15])
    p.add_argument("--dd-throttles", type=float, nargs="+", default=[0.15, 0.20])
    p.add_argument("--dd-floors", type=float, nargs="+", default=[0.25, 0.50])
    p.add_argument("--cost-bps", type=float, nargs="+", default=[2.5, 5.0])
    p.add_argument("--max-weight", type=float, default=0.35)
    p.add_argument("--max-evals", type=int, default=0, help="If >0, randomly subsample configs to this many.")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--log-every", type=int, default=20)
    args = p.parse_args()

    trend_mod = _load_module(sr_root / "scripts/multi_asset_trend_runner.py", "multi_asset_trend_runner")
    alpha_mod = _load_module(sr_root / "scripts/alpha_regression.py", "alpha_regression")

    prices, vols = trend_mod.load_prices(args.panel)
    assets = [
        l.strip()
        for l in args.assets_file.read_text().splitlines()
        if l.strip() and not l.strip().startswith("#")
    ]
    assets = sorted(dict.fromkeys(assets))

    # Base run to establish the month index.
    base = trend_mod.run_trend_backtest(
        prices_daily=prices,
        volumes_daily=vols,
        assets=assets,
        cash_proxy=args.cash_proxy,
        lookback_months=[int(args.lookbacks[0])],
        ma_months=[int(args.mas[0])],
        vol_months=int(args.vol_months[0]),
        min_history_months=24,
        max_weight=float(args.max_weight),
        rebalance_months=1,
        side=str(args.side),
        signal_combine=str(args.signal_combine),
        signal_threshold=float(args.signal_thresholds[0]),
        signal_smooth_months=int(args.signal_smooth_months[0]),
        cost_bps=float(args.cost_bps[0]),
        slippage_bps=float(args.slippage_bps),
        slippage_cap_bps=float(args.slippage_cap_bps),
        slippage_ref_participation=float(args.slippage_ref_participation),
        portfolio_usd=float(args.portfolio_usd),
        min_median_dollar_volume=float(args.min_median_dollar_volume),
        dollar_volume_lookback_months=12,
        target_vol=float(args.target_vols[0]),
        vol_target_lookback_months=12,
        max_leverage=1.5,
        dd_throttle=float(args.dd_throttles[0]),
        dd_floor_exposure=float(args.dd_floors[0]),
    )
    if "error" in base:
        print(base["error"])
        return 2

    idx = pd.DatetimeIndex(base["pnl"].index).sort_values()
    folds = _split_folds(idx, train_months=int(args.train_months), val_months=int(args.val_months), test_months=int(args.test_months), folds=int(args.folds))
    if not folds:
        print("Not enough history for requested folds.")
        return 2

    # Construct config grid.
    configs: List[Dict[str, Any]] = []
    for lb in args.lookbacks:
        for ma in args.mas:
            for v in args.vol_months:
                for tv in args.target_vols:
                    for ddt in args.dd_throttles:
                        for ddf in args.dd_floors:
                            for cb in args.cost_bps:
                                for thr in args.signal_thresholds:
                                    for sm in args.signal_smooth_months:
                                        configs.append(
                                            {
                                                "lookback_months": [int(lb)],
                                                "ma_months": [int(ma)],
                                                "vol_months": int(v),
                                                "target_vol": float(tv),
                                                "dd_throttle": float(ddt),
                                                "dd_floor_exposure": float(ddf),
                                                "cost_bps": float(cb),
                                                "signal_threshold": float(thr),
                                                "signal_smooth_months": int(sm),
                                            }
                                        )

    rng = np.random.default_rng(int(args.seed))
    if int(args.max_evals) > 0 and len(configs) > int(args.max_evals):
        pick = rng.choice(len(configs), size=int(args.max_evals), replace=False)
        configs = [configs[int(i)] for i in pick]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    best = None
    best_score = -1e18

    for i, cfg in enumerate(configs, 1):
        res = trend_mod.run_trend_backtest(
            prices_daily=prices,
            volumes_daily=vols,
            assets=assets,
            cash_proxy=args.cash_proxy,
            lookback_months=list(cfg["lookback_months"]),
            ma_months=list(cfg["ma_months"]),
            vol_months=int(cfg["vol_months"]),
            min_history_months=24,
            max_weight=float(args.max_weight),
            rebalance_months=1,
            side=str(args.side),
            signal_combine=str(args.signal_combine),
            signal_threshold=float(cfg["signal_threshold"]),
            signal_smooth_months=int(cfg["signal_smooth_months"]),
            cost_bps=float(cfg["cost_bps"]),
            slippage_bps=float(args.slippage_bps),
            slippage_cap_bps=float(args.slippage_cap_bps),
            slippage_ref_participation=float(args.slippage_ref_participation),
            portfolio_usd=float(args.portfolio_usd),
            min_median_dollar_volume=float(args.min_median_dollar_volume),
            dollar_volume_lookback_months=12,
            target_vol=float(cfg["target_vol"]),
            vol_target_lookback_months=12,
            max_leverage=1.5,
            dd_throttle=float(cfg["dd_throttle"]),
            dd_floor_exposure=float(cfg["dd_floor_exposure"]),
        )
        if "error" in res:
            continue

        pnl = res["pnl"].sort_index()
        pstats = _perf(pnl)
        if abs(float(pstats["max_dd"])) > float(args.max_dd_cap):
            continue
        if not np.isnan(pstats["worst_12m"]) and float(pstats["worst_12m"]) < -float(args.worst12_cap):
            continue

        benches = trend_mod.make_benchmarks(
            prices,
            vols,
            benchmark_ticker=str(args.benchmark),
            bond_ticker=str(args.bond_benchmark),
            target_vol=float(cfg["target_vol"]),
            vol_target_lookback_months=12,
            max_leverage=1.5,
            dd_throttle=float(cfg["dd_throttle"]),
            dd_floor_exposure=float(cfg["dd_floor_exposure"]),
            cost_bps=float(cfg["cost_bps"]),
            slippage_bps=float(args.slippage_bps),
            slippage_cap_bps=float(args.slippage_cap_bps),
            slippage_ref_participation=float(args.slippage_ref_participation),
            portfolio_usd=float(args.portfolio_usd),
            dollar_volume_lookback_months=12,
        )
        spy_raw = benches.get("raw")
        sixty_forty = benches.get("sixty_forty_costed")
        if sixty_forty is None:
            sixty_forty = benches.get("sixty_forty_raw")
        if spy_raw is None or sixty_forty is None:
            continue
        spy_raw = spy_raw.reindex(pnl.index).fillna(0.0)
        sixty_forty = sixty_forty.reindex(pnl.index).fillna(0.0)

        excess_spy = pnl - spy_raw
        excess_60 = pnl - sixty_forty
        excess_spy_ann = float(excess_spy.mean() * 12.0)
        excess_60_ann = float(excess_60.mean() * 12.0)

        # Worst fold stability vs SPY (raw).
        fold_excess = []
        for v_start, t_start, t_end in folds:
            t_p = pnl[(pnl.index >= t_start) & (pnl.index <= t_end)]
            t_b = spy_raw[(spy_raw.index >= t_start) & (spy_raw.index <= t_end)]
            fold_excess.append(float((t_p - t_b).mean() * 12.0) if len(t_p) else 0.0)
        worst_fold_excess = float(np.min(fold_excess)) if fold_excess else 0.0
        if float(excess_spy_ann) < float(args.min_excess_ann_vs_spy):
            continue
        if float(worst_fold_excess) < float(args.min_worst_fold_excess_ann_vs_spy):
            continue

        # Alpha diagnostic (proxy factors).
        X = pd.DataFrame(index=excess_spy.index)
        for c in ["SPY", "IEF", "TLT", "GLD", "DBC", "BTC-USD"]:
            if c in prices.columns:
                X[c] = prices[[c]].resample("ME").last().pct_change().reindex(excess_spy.index).fillna(0.0).iloc[:, 0]
        alpha = alpha_mod.alpha_report_dict(alpha_mod.alpha_regression(excess_spy, X, lags=3))

        score = _score(
            excess_ann_vs_spy=excess_spy_ann,
            excess_ann_vs_60_40=excess_60_ann,
            worst_fold_excess_vs_spy=worst_fold_excess,
            max_dd=float(pstats["max_dd"]),
            worst_12m=float(pstats["worst_12m"]) if not np.isnan(pstats["worst_12m"]) else float("nan"),
            prefer=str(args.prefer),
        )

        row = {
            **cfg,
            "strategy_cagr": float(pstats["cagr"]),
            "strategy_sharpe": float(pstats["sharpe"]),
            "strategy_max_dd": float(pstats["max_dd"]),
            "strategy_worst_12m": float(pstats["worst_12m"]) if not np.isnan(pstats["worst_12m"]) else None,
            "excess_ann_vs_spy_raw": float(excess_spy_ann),
            "ir_vs_spy_raw": float(_info_ratio(excess_spy)),
            "excess_ann_vs_60_40": float(excess_60_ann),
            "ir_vs_60_40": float(_info_ratio(excess_60)),
            "worst_fold_excess_vs_spy_raw": float(worst_fold_excess),
            "alpha_proxy": alpha,
            "score": float(score),
        }
        rows.append(row)
        if score > best_score:
            best_score = score
            best = row

        if int(args.log_every) > 0 and (i % int(args.log_every) == 0 or i == len(configs)):
            print(f"[sweep] {i}/{len(configs)} survivors={len(rows)} best_score={best_score:.4f}")

    (args.out_dir / "grid_results.json").write_text(json.dumps(rows, indent=2))
    if rows:
        flat = []
        for r in rows:
            flat.append(
                {
                    "lookback": int(r["lookback_months"][0]),
                    "ma": int(r["ma_months"][0]),
                    "vol_m": int(r["vol_months"]),
                    "target_vol": float(r["target_vol"]),
                    "dd_throttle": float(r["dd_throttle"]),
                    "dd_floor": float(r["dd_floor_exposure"]),
                    "cost_bps": float(r["cost_bps"]),
                    "sig_thr": float(r["signal_threshold"]),
                    "sig_smooth": int(r["signal_smooth_months"]),
                    "cagr": float(r["strategy_cagr"]),
                    "sharpe": float(r["strategy_sharpe"]),
                    "max_dd": float(r["strategy_max_dd"]),
                    "excess_spy": float(r["excess_ann_vs_spy_raw"]),
                    "ir_spy": float(r["ir_vs_spy_raw"]),
                    "excess_60": float(r["excess_ann_vs_60_40"]),
                    "ir_60": float(r["ir_vs_60_40"]),
                    "worst_fold_excess": float(r["worst_fold_excess_vs_spy_raw"]),
                    "score": float(r["score"]),
                }
            )
        pd.DataFrame(flat).sort_values("score", ascending=False).to_csv(args.out_dir / "grid_results.csv", index=False)

    if best is None:
        (args.out_dir / "report.md").write_text(
            "No configuration survived stability caps. Try relaxing `--max-dd-cap` or `--worst12-cap`, or expand the universe.\n"
        )
        print("No configuration survived stability caps.")
        return 2

    (args.out_dir / "best.json").write_text(json.dumps(best, indent=2))
    rep = []
    rep.append("# Robust Multi-Asset Research შედეგ\n")
    rep.append(f"- Panel: `{args.panel}`\n")
    rep.append(f"- Universe: `{args.assets_file}`\n")
    rep.append(f"- Objective: maximize excess vs `{args.prefer}` under stability caps\n")
    rep.append(f"- Stability caps: max_dd <= {args.max_dd_cap:.2f}, worst_12m >= {-args.worst12_cap:.2f}\n")
    rep.append("\n## Best Configuration\n")
    rep.append("```json\n")
    rep.append(json.dumps(best, indent=2))
    rep.append("\n```\n")
    (args.out_dir / "report.md").write_text("".join(rep))
    print(json.dumps(best, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
