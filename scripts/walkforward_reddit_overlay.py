#!/usr/bin/env python3
"""
Walk-forward evaluation for Reddit alpha sleeve overlay (vs a base run).

Why:
  - The Reddit sleeve is easy to overfit (many thresholds / choices).
  - This script performs leakage-resistant selection:
      train window -> embargo gap -> test window
    For each fold, it selects the best config on train metrics and reports test metrics.

How it works:
  - Calls `backtest_reddit_alpha_overlay.py` once per config per fold over
    [train_start .. test_end], then slices returns into train/test ranges.
  - Uses ONLY train slice to pick a config, then reports the chosen config on test slice.

Outputs:
  - backtests/outputs/reddit_walkforward_overlay/YYYY-MM-DD_HHMMSS/
      folds.csv
      picks.csv
      summary.json
      fold_<k>/<config_name>/{summary.json,returns.csv,picks.csv}
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Perf:
    n: int
    total_return: float
    cagr: float
    sharpe: float
    mdd: float


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _perf(returns: pd.Series, *, ann_factor: float = 252.0) -> Perf:
    r = pd.to_numeric(returns, errors="coerce").fillna(0.0).astype(float)
    eq = (1.0 + r).cumprod()
    n = int(len(r))
    vol = float(r.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((r.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / max(1, n)) - 1.0) if n > 1 else 0.0
    mdd = float((eq / eq.cummax() - 1.0).min()) if not eq.empty else 0.0
    total_return = float(eq.iloc[-1] - 1.0) if not eq.empty else 0.0
    return Perf(n=n, total_return=total_return, cagr=cagr, sharpe=sharpe, mdd=mdd)


def _read_returns_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if df.columns[0].lower().startswith("unnamed"):
        df = df.rename(columns={df.columns[0]: "Date"})
    if "Date" not in df.columns:
        raise ValueError(f"returns.csv missing Date column: {path}")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"]).set_index("Date").sort_index()
    need = {"base_ret", "overlay_ret"}
    if not need.issubset(df.columns):
        raise ValueError(f"returns.csv missing {sorted(need)}: {path}")
    df["base_ret"] = pd.to_numeric(df["base_ret"], errors="coerce").fillna(0.0)
    df["overlay_ret"] = pd.to_numeric(df["overlay_ret"], errors="coerce").fillna(0.0)
    df["active_ret"] = df["overlay_ret"] - df["base_ret"]
    return df


def _range_slice(df: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    start = pd.Timestamp(start).normalize()
    end = pd.Timestamp(end).normalize()
    out = df[(df.index.normalize() >= start) & (df.index.normalize() <= end)].copy()
    return out


def _excess_total_return(a: pd.Series, b: pd.Series) -> float:
    ea = float((1.0 + a.fillna(0.0)).prod())
    eb = float((1.0 + b.fillna(0.0)).prod())
    return float(ea / max(1e-12, eb) - 1.0)


def _run_overlay(
    *,
    sr_root: Path,
    base_run_dir: Path,
    panel: Path,
    reddit_signals: Path,
    fold_start: str,
    fold_end: str,
    out_dir: Path,
    args_list: List[str],
) -> None:
    script = sr_root / "scripts/backtest_reddit_alpha_overlay.py"
    cmd = [
        "python3",
        str(script),
        "--run-dir",
        str(base_run_dir),
        "--panel",
        str(panel),
        "--reddit-signals",
        str(reddit_signals),
        "--benchmark",
        "SPY",
        "--start-date",
        str(fold_start),
        "--end-date",
        str(fold_end),
        "--out-dir",
        str(out_dir),
    ] + args_list
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"overlay failed: {' '.join(cmd)}\n{p.stderr[-2000:]}")


def _default_grid() -> List[Tuple[str, List[str]]]:
    # Keep this small & robust; expand later once we have more data.
    return [
        (
            "tiny_weightxsent",
            ["--sleeve", "0.02", "--top-k", "5", "--pick-mode", "upvote_weight_x_sent", "--min-posts", "1", "--min-authors", "1", "--allow-missing-novelty", "--cost-bps", "2"],
        ),
        (
            "loose_weight",
            ["--sleeve", "0.10", "--top-k", "5", "--pick-mode", "upvote_weight", "--min-posts", "1", "--min-authors", "1", "--min-upvote-weight", "0", "--allow-missing-novelty", "--cost-bps", "2"],
        ),
        (
            "loose_weightxsent",
            ["--sleeve", "0.10", "--top-k", "5", "--pick-mode", "upvote_weight_x_sent", "--min-posts", "1", "--min-authors", "1", "--min-upvote-weight", "0", "--allow-missing-novelty", "--cost-bps", "2"],
        ),
        (
            "novelty_gate_z2",
            ["--sleeve", "0.10", "--top-k", "5", "--pick-mode", "novelty_z", "--min-posts", "2", "--min-authors", "2", "--novelty-z-min", "2", "--cost-bps", "2"],
        ),
        (
            "mom10_weightxsent",
            [
                "--sleeve",
                "0.10",
                "--top-k",
                "3",
                "--pick-mode",
                "upvote_weight_x_sent",
                "--min-posts",
                "2",
                "--min-authors",
                "2",
                "--sentiment-min",
                "0",
                "--min-upvote-weight",
                "2",
                "--allow-missing-novelty",
                "--mom-short",
                "10",
                "--mom-long",
                "30",
                "--min-mom-score",
                "0",
                "--cost-bps",
                "2",
            ],
        ),
    ]


def _build_folds(
    dates: List[pd.Timestamp],
    *,
    train_days: int,
    embargo_days: int,
    test_days: int,
    step_days: int,
) -> List[Dict[str, Any]]:
    d = pd.DatetimeIndex(sorted(pd.Timestamp(x).normalize() for x in dates))
    folds: List[Dict[str, Any]] = []
    n = len(d)
    if n < train_days + embargo_days + test_days:
        return folds
    i = 0
    k = 0
    while i + train_days + embargo_days + test_days <= n:
        train_start = d[i]
        train_end = d[i + train_days - 1]
        embargo_start = d[i + train_days]
        embargo_end = d[i + train_days + embargo_days - 1] if embargo_days > 0 else train_end
        test_start = d[i + train_days + embargo_days]
        test_end = d[i + train_days + embargo_days + test_days - 1]
        folds.append(
            {
                "fold": k,
                "train_start": str(train_start.date()),
                "train_end": str(train_end.date()),
                "embargo_start": str(embargo_start.date()) if embargo_days > 0 else "",
                "embargo_end": str(embargo_end.date()) if embargo_days > 0 else "",
                "test_start": str(test_start.date()),
                "test_end": str(test_end.date()),
                "fold_start": str(train_start.date()),
                "fold_end": str(test_end.date()),
            }
        )
        k += 1
        i += int(max(1, step_days))
    return folds


def main() -> int:
    sr_root = Path(__file__).resolve().parents[1]

    ap = argparse.ArgumentParser(description="Walk-forward selection for Reddit sleeve overlay.")
    ap.add_argument("--base-run-dir", type=Path, default=sr_root / "backtests/outputs/spy_beater/dynamic_regime_signal_ready_run_with_weights")
    ap.add_argument("--panel", type=Path, default=sr_root / "data_lake/sentiment/reddit_overlay_panel.csv")
    ap.add_argument("--reddit-signals", type=Path, default=sr_root / "data_lake/sentiment/reddit_daily_signals.parquet")
    ap.add_argument("--out-root", type=Path, default=sr_root / "backtests/outputs/reddit_walkforward_overlay")

    ap.add_argument("--train-days", type=int, default=126)
    ap.add_argument("--embargo-days", type=int, default=5)
    ap.add_argument("--test-days", type=int, default=21)
    ap.add_argument("--step-days", type=int, default=21)
    ap.add_argument("--select-metric", choices=["train_active_excess", "train_active_sharpe"], default="train_active_excess")
    ap.add_argument("--min-train-days", type=int, default=50, help="Skip folds with fewer realized return days than this.")
    args = ap.parse_args()

    # Fold calendar: use dates where we have at least some Reddit signal rows.
    sig = pd.read_parquet(args.reddit_signals) if args.reddit_signals.suffix.lower() in {".parquet", ".pq"} else pd.read_csv(args.reddit_signals)
    sig["Date"] = pd.to_datetime(sig["Date"], errors="coerce")
    sig = sig.dropna(subset=["Date"])
    sig_dates = sorted({pd.Timestamp(d).normalize() for d in sig["Date"].unique()})
    folds = _build_folds(
        sig_dates,
        train_days=int(args.train_days),
        embargo_days=int(args.embargo_days),
        test_days=int(args.test_days),
        step_days=int(args.step_days),
    )
    if not folds:
        raise SystemExit("Not enough signal history to form a single train/embargo/test fold.")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    out_dir = Path(args.out_root) / stamp
    _ensure_dir(out_dir)

    grid = _default_grid()
    fold_rows: List[Dict[str, Any]] = []
    pick_rows: List[Dict[str, Any]] = []

    for f in folds:
        fold_id = int(f["fold"])
        fold_dir = out_dir / f"fold_{fold_id}"
        _ensure_dir(fold_dir)

        best_name: Optional[str] = None
        best_metric = float("-inf")
        best_train: Dict[str, Any] = {}
        best_test: Dict[str, Any] = {}

        for name, cfg_args in grid:
            cfg_dir = fold_dir / name
            _ensure_dir(cfg_dir)
            _run_overlay(
                sr_root=sr_root,
                base_run_dir=Path(args.base_run_dir),
                panel=Path(args.panel),
                reddit_signals=Path(args.reddit_signals),
                fold_start=f["fold_start"],
                fold_end=f["fold_end"],
                out_dir=cfg_dir,
                args_list=cfg_args,
            )
            r = _read_returns_csv(cfg_dir / "returns.csv")

            train = _range_slice(r, pd.to_datetime(f["train_start"]), pd.to_datetime(f["train_end"]))
            test = _range_slice(r, pd.to_datetime(f["test_start"]), pd.to_datetime(f["test_end"]))
            if len(train) < int(args.min_train_days) or len(test) < 5:
                continue

            train_active_excess = _excess_total_return(train["overlay_ret"], train["base_ret"])
            test_active_excess = _excess_total_return(test["overlay_ret"], test["base_ret"])

            train_perf = {
                "train_overlay": asdict(_perf(train["overlay_ret"])),
                "train_base": asdict(_perf(train["base_ret"])),
                "train_active": asdict(_perf(train["active_ret"])),
                "train_active_excess": float(train_active_excess),
            }
            test_perf = {
                "test_overlay": asdict(_perf(test["overlay_ret"])),
                "test_base": asdict(_perf(test["base_ret"])),
                "test_active": asdict(_perf(test["active_ret"])),
                "test_active_excess": float(test_active_excess),
            }

            metric = float(train_active_excess) if args.select_metric == "train_active_excess" else float(train_perf["train_active"]["sharpe"])
            if metric > best_metric:
                best_metric = metric
                best_name = name
                best_train = train_perf
                best_test = test_perf

        if best_name is None:
            fold_rows.append({"fold": fold_id, **f, "status": "skipped_no_valid_configs"})
            continue

        fold_rows.append({"fold": fold_id, **f, "status": "ok", "picked": best_name, "train_metric": best_metric})
        pick_rows.append(
            {
                "fold": fold_id,
                "picked": best_name,
                "select_metric": str(args.select_metric),
                "train_active_excess": float(best_train.get("train_active_excess", 0.0)),
                "train_active_sharpe": float((best_train.get("train_active") or {}).get("sharpe", 0.0)),
                "test_active_excess": float(best_test.get("test_active_excess", 0.0)),
                "test_active_sharpe": float((best_test.get("test_active") or {}).get("sharpe", 0.0)),
                "train_overlay_total_return": float((best_train.get("train_overlay") or {}).get("total_return", 0.0)),
                "test_overlay_total_return": float((best_test.get("test_overlay") or {}).get("total_return", 0.0)),
                "train_base_total_return": float((best_train.get("train_base") or {}).get("total_return", 0.0)),
                "test_base_total_return": float((best_test.get("test_base") or {}).get("total_return", 0.0)),
            }
        )

    folds_df = pd.DataFrame(fold_rows)
    picks_df = pd.DataFrame(pick_rows)
    folds_df.to_csv(out_dir / "folds.csv", index=False)
    picks_df.to_csv(out_dir / "picks.csv", index=False)

    summary = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "out_dir": str(out_dir),
        "settings": {
            "train_days": int(args.train_days),
            "embargo_days": int(args.embargo_days),
            "test_days": int(args.test_days),
            "step_days": int(args.step_days),
            "select_metric": str(args.select_metric),
            "min_train_days": int(args.min_train_days),
            "grid_size": len(grid),
        },
        "n_folds": int(len(folds_df)),
        "n_scored_folds": int(len(picks_df)),
        "avg_test_active_excess": float(picks_df["test_active_excess"].mean()) if not picks_df.empty else 0.0,
        "median_test_active_excess": float(picks_df["test_active_excess"].median()) if not picks_df.empty else 0.0,
        "beat_rate_test": float((picks_df["test_active_excess"] > 0).mean()) if not picks_df.empty else 0.0,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

