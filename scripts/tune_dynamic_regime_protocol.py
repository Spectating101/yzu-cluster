#!/usr/bin/env python3
"""
Small, targeted tuner for dynamic-regime protocol JSONs.

It:
  1) creates protocol variants (in-memory)
  2) runs each variant via run_dynamic_regime_protocol.py
  3) evaluates 2025 (launch-style) and randomized windows (multi-seed)
  4) writes a comparison CSV/JSON to the output directory

Research/backtest only.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple


_ROOT = Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(_ROOT))


def _safe_name(x: object) -> str:
    s = str(x).strip().lower()
    s = s.replace(" ", "_").replace("/", "_")
    s = s.replace("true", "T").replace("false", "F")
    s = "".join(ch for ch in s if ch.isalnum() or ch in {"_", "-", ".", "="})
    return s


@dataclass(frozen=True)
class Variant:
    name: str
    protocol: Dict[str, Any]


def _make_variants(base: Dict[str, Any]) -> List[Variant]:
    variants: List[Variant] = []

    # Baseline (as provided).
    variants.append(Variant(name="baseline", protocol=dict(base)))

    # Targeted hard-vol gate variants (main 2025 pain point).
    for hard_vol_max in [0.0, 0.2, 0.3]:
        for hard_vol_requires_bear in [False, True]:
            if hard_vol_max == float(base.get("hard_vol_max", hard_vol_max)) and bool(base.get("hard_vol_requires_bear", False)) == hard_vol_requires_bear:
                continue
            p = dict(base)
            p["hard_vol_max"] = float(hard_vol_max)
            if hard_vol_requires_bear:
                p["hard_vol_requires_bear"] = True
                p["hard_vol_sma_days"] = int(p.get("hard_vol_sma_days", 200))
            else:
                p.pop("hard_vol_requires_bear", None)
                p.pop("hard_vol_sma_days", None)
            name = f"volmax={_safe_name(hard_vol_max)}_bear={_safe_name(hard_vol_requires_bear)}"
            variants.append(Variant(name=name, protocol=p))

    # Gentle probability hysteresis variants.
    for enter, exit_ in [(0.50, 0.45), (0.52, 0.48), (0.55, 0.50)]:
        p = dict(base)
        p["prob_risk_on_enter"] = float(enter)
        p["prob_risk_on_exit"] = float(exit_)
        name = f"prob={_safe_name(enter)}_{_safe_name(exit_)}"
        variants.append(Variant(name=name, protocol=p))

    # Turnover cap variants (backtest-side). This directly targets the strongest negative correlation driver.
    for cap in [0.0, 0.20, 0.30, 0.40]:
        p = dict(base)
        p["turnover_cap"] = float(cap)
        name = f"turncap={_safe_name(cap)}"
        variants.append(Variant(name=name, protocol=p))

    # Vol targeting variants (meta layer): reduce drawdowns without forcing risk-off.
    meta0 = dict(base.get("meta") or {})
    for vt in [0.0, 0.15, 0.20, 0.25]:
        p = dict(base)
        meta = dict(meta0)
        meta["vol_target"] = float(vt)
        meta["vol_lookback"] = int(meta.get("vol_lookback", 20))
        p["meta"] = meta
        name = f"voltarget={_safe_name(vt)}"
        variants.append(Variant(name=name, protocol=p))

    # Ensure unique names.
    seen = set()
    uniq: List[Variant] = []
    for v in variants:
        if v.name in seen:
            continue
        seen.add(v.name)
        uniq.append(v)
    return uniq


def main() -> int:
    ap = argparse.ArgumentParser(description="Tune dynamic regime protocol variants and compare.")
    ap.add_argument(
        "--base-protocol",
        type=Path,
        default=Path("Sharpe-Renaissance/config/dynamic_regime_protocol_signal_ready.json"),
    )
    ap.add_argument(
        "--out-root",
        type=Path,
        default=Path("Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_tuning"),
    )
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--launch-date", type=str, default="2025-01-01")
    ap.add_argument("--win-n-runs", type=int, default=10)
    ap.add_argument("--win-n-samples", type=int, default=300)
    ap.add_argument("--win-min-days", type=int, default=21)
    ap.add_argument("--win-max-days", type=int, default=126)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--seed-step", type=int, default=37)
    ap.add_argument(
        "--sort-by",
        type=str,
        default="excess_calmar",
        choices=["year_excess", "win_avg_excess", "excess_calmar", "year_calmar"],
        help="How to rank candidates (excess_calmar = year_excess_total_return / abs(year_mdd)).",
    )
    args = ap.parse_args()

    base = _read_json(_ROOT / args.base_protocol)
    variants = _make_variants(base)

    out_root = _ROOT / args.out_root
    out_root.mkdir(parents=True, exist_ok=True)
    _write_json(out_root / "base_protocol.json", base)

    rows: List[Dict[str, Any]] = []
    for v in variants:
        variant_dir = out_root / v.name
        variant_dir.mkdir(parents=True, exist_ok=True)
        protocol_path = variant_dir / "protocol.json"
        _write_json(protocol_path, v.protocol)

        run_dir = variant_dir / "run"
        eval_json = variant_dir / f"year_{int(args.year)}.json"
        win_json = variant_dir / "random_windows_summary.json"

        # Resume/skip logic: if artifacts exist, reuse them rather than recomputing.
        if not (run_dir / "summary.json").exists():
            _run(
                [
                    sys.executable,
                    str(_ROOT / "Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py"),
                    "--protocol-json",
                    str(protocol_path),
                    "--out-dir",
                    str(run_dir),
                ]
            )

        if not eval_json.exists():
            proc = subprocess.run(
                [
                    sys.executable,
                    str(_ROOT / "Sharpe-Renaissance/scripts/eval_year_slice_dynamic_regime.py"),
                    "--run-dir",
                    str(run_dir),
                    "--year",
                    str(int(args.year)),
                    "--launch-date",
                    str(args.launch_date),
                    "--out-dir",
                    str(variant_dir / f"year_slices/{int(args.year)}"),
                ],
                check=True,
                cwd=str(_ROOT),
                capture_output=True,
                text=True,
            )
            _write_json(eval_json, json.loads(proc.stdout.strip()))

        if not win_json.exists():
            proc2 = subprocess.run(
                [
                    sys.executable,
                    str(_ROOT / "Sharpe-Renaissance/scripts/random_period_stress_test.py"),
                    "--run-dir",
                    str(run_dir),
                    "--out-dir",
                    str(variant_dir / "random_windows"),
                    "--launch-date",
                    str(args.launch_date),
                    "--n-runs",
                    str(int(args.win_n_runs)),
                    "--n-samples",
                    str(int(args.win_n_samples)),
                    "--min-days",
                    str(int(args.win_min_days)),
                    "--max-days",
                    str(int(args.win_max_days)),
                    "--seed",
                    str(int(args.seed)),
                    "--seed-step",
                    str(int(args.seed_step)),
                ],
                check=True,
                cwd=str(_ROOT),
                capture_output=True,
                text=True,
            )
            _write_json(win_json, json.loads(proc2.stdout.strip()))

        eval_payload = _read_json(eval_json)
        win_payload = _read_json(win_json)

        row = {
            "name": v.name,
            "run_dir": str(run_dir),
            "year_total_return": float(eval_payload["strategy"]["total_return"]),
            "year_excess_total_return": float(eval_payload["active_excess_total_return"]),
            "year_mdd": float(eval_payload["strategy"]["mdd"]),
            "win_beat_rate": float(win_payload["beat_rate"]),
            "win_avg_excess": float(win_payload["avg_active_excess"]),
            "win_p10_excess": float(win_payload["p10_active_excess"]),
            "win_p90_excess": float(win_payload["p90_active_excess"]),
        }
        # Risk-adjusted ranking helpers.
        mdd_abs = abs(float(row["year_mdd"])) if float(row["year_mdd"]) < 0 else 0.0
        row["year_calmar"] = float(row["year_total_return"]) / mdd_abs if mdd_abs > 0 else 0.0
        row["excess_calmar"] = float(row["year_excess_total_return"]) / mdd_abs if mdd_abs > 0 else 0.0
        rows.append(row)

    # Save comparison.
    import pandas as pd  # local import to keep module import light

    df = pd.DataFrame(rows)
    if args.sort_by == "year_excess":
        df = df.sort_values(["year_excess_total_return", "win_avg_excess"], ascending=False)
    elif args.sort_by == "win_avg_excess":
        df = df.sort_values(["win_avg_excess", "year_excess_total_return"], ascending=False)
    elif args.sort_by == "year_calmar":
        df = df.sort_values(["year_calmar", "year_excess_total_return"], ascending=False)
    else:
        # Default: maximize excess return per unit drawdown, then prefer better downside tail.
        df = df.sort_values(["excess_calmar", "win_p10_excess"], ascending=False)
    df.to_csv(out_root / "comparison.csv", index=False)
    (out_root / "comparison.json").write_text(json.dumps(df.to_dict(orient="records"), indent=2) + "\n")

    print(df.head(10).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
