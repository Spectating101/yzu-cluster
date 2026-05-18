#!/usr/bin/env python3
"""
Weekly scorecard: integrate Reddit sleeve into an existing base run and track results.

This is designed to be scheduled. It:
  1) Generates a Reddit ingest health report.
  2) Runs several Reddit-overlay configurations on top of a chosen base run.
  3) Computes random-window stats overlay-vs-base on the overlap slice.

Outputs are written to:
  backtests/outputs/reddit_weekly_scorecard/YYYY-MM-DD/
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Perf:
    start: str
    end: str
    n: int
    total_return: float
    cagr: float
    sharpe: float
    mdd: float


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _equity_from_returns_csv(returns_csv: Path, *, col: str) -> pd.Series:
    df = pd.read_csv(returns_csv)
    if df.columns[0].lower().startswith("unnamed"):
        df = df.rename(columns={df.columns[0]: "Date"})
    if "Date" not in df.columns:
        raise ValueError(f"returns.csv missing Date column: {returns_csv}")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"]).set_index("Date").sort_index()
    if col not in df.columns:
        raise ValueError(f"returns.csv missing {col}: {returns_csv}")
    r = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    eq = (1.0 + r).cumprod()
    return eq


def _equity_to_returns(eq: pd.Series) -> pd.Series:
    if eq.empty:
        return eq
    r = eq.pct_change(fill_method=None)
    r.iloc[0] = float(eq.iloc[0] - 1.0)
    return r.astype(float)


def _perf(returns: pd.Series, *, ann_factor: float = 252.0) -> Perf:
    r = returns.fillna(0.0).astype(float)
    eq = (1.0 + r).cumprod()
    n = int(len(r))
    vol = float(r.std(ddof=0) * np.sqrt(ann_factor)) if n > 2 else 0.0
    sharpe = float((r.mean() * ann_factor) / vol) if vol > 0 else 0.0
    cagr = float(eq.iloc[-1] ** (ann_factor / max(1, n)) - 1.0) if n > 1 else 0.0
    mdd = float((eq / eq.cummax() - 1.0).min()) if not eq.empty else 0.0
    total_return = float(eq.iloc[-1] - 1.0) if not eq.empty else 0.0
    return Perf(
        start=str(eq.index.min().date()) if not eq.empty else "",
        end=str(eq.index.max().date()) if not eq.empty else "",
        n=n,
        total_return=total_return,
        cagr=cagr,
        sharpe=sharpe,
        mdd=mdd,
    )


def _pick_windows(n_obs: int, *, n_samples: int, min_len: int, max_len: int, rng: np.random.Generator) -> List[Tuple[int, int]]:
    if n_obs <= 0:
        return []
    min_len = int(max(5, min_len))
    max_len = int(max(min_len, max_len))
    max_len = int(min(max_len, n_obs))
    out: List[Tuple[int, int]] = []
    for _ in range(int(n_samples)):
        L = int(rng.integers(min_len, max_len + 1))
        start = int(rng.integers(0, n_obs - L + 1))
        out.append((start, start + L))
    return out


def _window_eval(
    eq_overlay: pd.Series,
    eq_base: pd.Series,
    *,
    n_samples: int,
    min_days: int,
    max_days: int,
    seed: int,
) -> Dict[str, Any]:
    eq_overlay, eq_base = eq_overlay.align(eq_base, join="inner")
    r = _equity_to_returns(eq_overlay)
    br = _equity_to_returns(eq_base)
    df = pd.DataFrame({"overlay_ret": r, "base_ret": br}).dropna()
    if df.empty:
        return {"n": 0}
    rng = np.random.default_rng(int(seed))
    windows = _pick_windows(len(df), n_samples=int(n_samples), min_len=int(min_days), max_len=int(max_days), rng=rng)
    ex: List[float] = []
    for s, e in windows:
        d = df.iloc[s:e]
        active = float(((1.0 + d["overlay_ret"]).prod() / max(1e-12, (1.0 + d["base_ret"]).prod())) - 1.0)
        ex.append(active)
    s_ex = pd.Series(ex, dtype=float)
    return {
        "n": int(len(s_ex)),
        "beat_rate": float((s_ex > 0).mean()),
        "p10_active_excess": float(s_ex.quantile(0.10)),
        "p50_active_excess": float(s_ex.quantile(0.50)),
        "p90_active_excess": float(s_ex.quantile(0.90)),
    }


def _run(cmd: List[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{p.stderr[-2000:]}")


def main() -> int:
    sr_root = Path(__file__).resolve().parents[1]
    repo_root = sr_root.parent

    ap = argparse.ArgumentParser(description="Weekly Reddit alpha scorecard runner.")
    ap.add_argument("--base-run-dir", type=Path, default=sr_root / "backtests/outputs/spy_beater/dynamic_regime_signal_ready_run_with_weights")
    ap.add_argument("--panel", type=Path, default=sr_root / "data_lake/sentiment/reddit_overlay_panel.csv")
    ap.add_argument("--reddit-signals", type=Path, default=sr_root / "data_lake/sentiment/reddit_daily_signals.parquet")
    ap.add_argument("--out-root", type=Path, default=sr_root / "backtests/outputs/reddit_weekly_scorecard")
    ap.add_argument("--n-samples", type=int, default=6000)
    ap.add_argument("--min-days", type=int, default=10)
    ap.add_argument("--max-days", type=int, default=60)
    ap.add_argument("--seed", type=int, default=31)
    args = ap.parse_args()

    today = datetime.now(timezone.utc).date().isoformat()
    out_dir = Path(args.out_root) / today
    _ensure_dir(out_dir)

    # 1) Data health report
    health_cmd = ["python3", str(sr_root / "scripts/reddit_data_health.py")]
    _run(health_cmd)

    health_json = sr_root / "data_lake/sentiment/reddit_health.json"
    health_md = sr_root / "data_lake/sentiment/reddit_health.md"
    if health_json.exists():
        (out_dir / "reddit_health.json").write_text(health_json.read_text())
    if health_md.exists():
        (out_dir / "reddit_health.md").write_text(health_md.read_text())

    # Determine overlap slice based on signals panel.
    sig = pd.read_parquet(args.reddit_signals) if args.reddit_signals.suffix.lower() in {".parquet", ".pq"} else pd.read_csv(args.reddit_signals)
    sig["Date"] = pd.to_datetime(sig["Date"], errors="coerce")
    sig = sig.dropna(subset=["Date"])
    start_date = str(sig["Date"].min().date()) if not sig.empty else ""
    end_date = str(sig["Date"].max().date()) if not sig.empty else ""

    overlay_script = sr_root / "scripts/backtest_reddit_alpha_overlay.py"
    if not overlay_script.exists():
        raise SystemExit(f"missing overlay script: {overlay_script}")

    configs: List[Tuple[str, List[str]]] = [
        (
            "tiny_sleeve",
            ["--sleeve", "0.02", "--top-k", "5", "--pick-mode", "upvote_weight_x_sent", "--min-posts", "1", "--min-authors", "1", "--allow-missing-novelty"],
        ),
        (
            "loose_weight",
            ["--sleeve", "0.10", "--top-k", "5", "--pick-mode", "upvote_weight", "--min-posts", "1", "--min-authors", "1", "--min-upvote-weight", "0", "--allow-missing-novelty"],
        ),
        (
            "novelty_gate",
            ["--sleeve", "0.10", "--top-k", "5", "--pick-mode", "novelty_z", "--min-posts", "2", "--min-authors", "2", "--novelty-z-min", "2"],
        ),
    ]

    rows: List[Dict[str, Any]] = []
    actual_starts: List[pd.Timestamp] = []
    actual_ends: List[pd.Timestamp] = []
    for name, extra in configs:
        cfg_dir = out_dir / name
        _ensure_dir(cfg_dir)
        cmd = [
            "python3",
            str(overlay_script),
            "--run-dir",
            str(args.base_run_dir),
            "--panel",
            str(args.panel),
            "--reddit-signals",
            str(args.reddit_signals),
            "--benchmark",
            "SPY",
            "--start-date",
            start_date,
            "--end-date",
            end_date,
            "--cost-bps",
            "2",
            "--out-dir",
            str(cfg_dir),
        ] + extra
        _run(cmd)

        summ = _read_json(cfg_dir / "summary.json")
        eq_base = _equity_from_returns_csv(cfg_dir / "returns.csv", col="base_ret")
        eq_over = _equity_from_returns_csv(cfg_dir / "returns.csv", col="overlay_ret")
        if len(eq_base):
            actual_starts.append(pd.Timestamp(eq_base.index.min()).normalize())
            actual_ends.append(pd.Timestamp(eq_base.index.max()).normalize())
        win = _window_eval(
            eq_over,
            eq_base,
            n_samples=int(args.n_samples),
            min_days=int(args.min_days),
            max_days=int(args.max_days),
            seed=int(args.seed),
        )
        (cfg_dir / "random_windows_vs_base.json").write_text(json.dumps(win, indent=2) + "\n")

        rows.append(
            {
                "name": name,
                "signals_start_date": start_date,
                "signals_end_date": end_date,
                "actual_start_date": str(eq_base.index.min().date()) if len(eq_base) else "",
                "actual_end_date": str(eq_base.index.max().date()) if len(eq_base) else "",
                "delta_total_return": float(summ.get("delta_total_return", 0.0)),
                "delta_sharpe": float(summ.get("delta_sharpe", 0.0)),
                "delta_mdd": float(summ.get("delta_mdd", 0.0)),
                "beat_rate_vs_base": float(win.get("beat_rate", 0.0)),
                "p50_active_excess_vs_base": float(win.get("p50_active_excess", 0.0)),
                "overlay_total_return": float((eq_over.iloc[-1] - 1.0) if len(eq_over) else 0.0),
                "base_total_return": float((eq_base.iloc[-1] - 1.0) if len(eq_base) else 0.0),
                "out_dir": str(cfg_dir),
            }
        )

    scorecard = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "base_run_dir": str(args.base_run_dir),
        "panel": str(args.panel),
        "reddit_signals": str(args.reddit_signals),
        "signals_date_range": {"start_date": start_date, "end_date": end_date},
        "actual_date_range": {
            "start_date": str(min(actual_starts).date()) if actual_starts else "",
            "end_date": str(max(actual_ends).date()) if actual_ends else "",
        },
        "configs": rows,
    }
    (out_dir / "scorecard.json").write_text(json.dumps(scorecard, indent=2) + "\n")
    pd.DataFrame(rows).to_csv(out_dir / "scorecard.csv", index=False)

    md_lines = ["# Reddit Weekly Scorecard", ""]
    md_lines.append(f"- generated_utc: `{scorecard['generated_utc']}`")
    md_lines.append(f"- base_run_dir: `{scorecard['base_run_dir']}`")
    md_lines.append(f"- signals_date_range: `{start_date}` .. `{end_date}`")
    adr = scorecard.get("actual_date_range") or {}
    md_lines.append(f"- actual_date_range: `{adr.get('start_date','')}` .. `{adr.get('end_date','')}`")
    md_lines.append("")
    md_lines.append("## Configs")
    for r in rows:
        md_lines.append(
            f"- `{r['name']}`: delta_total_return={r['delta_total_return']:.6f} "
            f"beat_rate_vs_base={r['beat_rate_vs_base']:.3f} p50_active_excess={r['p50_active_excess_vs_base']:.6f}"
        )
    (out_dir / "scorecard.md").write_text("\n".join(md_lines) + "\n")

    print(json.dumps({"out_dir": str(out_dir), "n_configs": len(rows)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
