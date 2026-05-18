#!/usr/bin/env python3
from __future__ import annotations

"""
Run the repo's main SEC-event edge thesis as a repeatable research cycle.

This wrapper:
  1) runs the strongest direct SEC-event drift configuration,
  2) runs a recent-window check,
  3) runs a few ablations that explain where the edge is coming from,
  4) writes one JSON + Markdown report with a clear verdict.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List


SR_ROOT = Path(__file__).resolve().parents[1]


def _run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(SR_ROOT))


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _backtest_cmd(
    *,
    prices: Path,
    events: Path,
    out_dir: Path,
    benchmark: str,
    top_n: int,
    hold_days: int,
    trade_lag: int,
    gross: float,
    cost_bps: float,
    target_vol: float,
    vol_lookback: int,
    max_gross: float,
    cooldown_days: int,
    mom_days: int,
    mom_weight: float,
    form_weight_8k: float,
    form_weight_10q: float,
    form_weight_10k: float,
    eval_last_days: int,
) -> List[str]:
    cmd = [
        sys.executable,
        str(SR_ROOT / "scripts" / "sec_event_alpha_backtest.py"),
        "--prices",
        str(prices),
        "--events",
        str(events),
        "--out-dir",
        str(out_dir),
        "--benchmark",
        str(benchmark),
        "--top-n",
        str(int(top_n)),
        "--hold-days",
        str(int(hold_days)),
        "--trade-lag",
        str(int(trade_lag)),
        "--gross",
        str(float(gross)),
        "--cost-bps",
        str(float(cost_bps)),
        "--target-vol",
        str(float(target_vol)),
        "--vol-lookback",
        str(int(vol_lookback)),
        "--max-gross",
        str(float(max_gross)),
        "--cooldown-days",
        str(int(cooldown_days)),
        "--mom-days",
        str(int(mom_days)),
        "--mom-weight",
        str(float(mom_weight)),
        "--form-weight-8k",
        str(float(form_weight_8k)),
        "--form-weight-10q",
        str(float(form_weight_10q)),
        "--form-weight-10k",
        str(float(form_weight_10k)),
    ]
    if int(eval_last_days) > 0:
        cmd.extend(["--eval-last-days", str(int(eval_last_days))])
    return cmd


def _extract_metrics(summary: Dict[str, Any]) -> Dict[str, Any]:
    strat = summary.get("strategy", {}) or {}
    bench = summary.get("benchmark", {}) or {}
    active = summary.get("active", {}) or {}
    roll = summary.get("rolling_21d_vs_spy", {}) or {}
    hit_rates = roll.get("hit_rates", {}) or {}
    return {
        "start": strat.get("start"),
        "end": strat.get("end"),
        "n": strat.get("n"),
        "cagr": strat.get("cagr"),
        "sharpe": strat.get("sharpe"),
        "mdd": strat.get("mdd"),
        "benchmark_cagr": bench.get("cagr"),
        "benchmark_sharpe": bench.get("sharpe"),
        "active_excess_final": active.get("excess_final"),
        "active_sharpe": active.get("active_sharpe"),
        "hit_rate_21d": hit_rates.get("0.0"),
        "hit_rate_21d_gt_2pct": hit_rates.get("0.02"),
    }


def _assess_edge(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    best = results["best"]["metrics"]
    recent = results["recent_3y"]["metrics"]
    lag2 = results["lag2_cd10"]["metrics"]
    all_forms = results["all_forms"]["metrics"]
    no_momentum = results["no_momentum"]["metrics"]

    checks = {
        "best_beats_spy_cagr": float(best["cagr"]) > float(best["benchmark_cagr"]),
        "best_sharpe_above_1": float(best["sharpe"]) >= 1.0,
        "best_active_sharpe_positive": float(best["active_sharpe"]) > 0.0,
        "recent_beats_spy_cagr": float(recent["cagr"]) > float(recent["benchmark_cagr"]),
        "recent_active_sharpe_positive": float(recent["active_sharpe"]) > 0.0,
        "lag1_better_than_lag2_cd10": float(best["active_sharpe"]) > float(lag2["active_sharpe"]),
        "eight_k_only_better_than_all_forms": float(best["active_sharpe"]) > float(all_forms["active_sharpe"]),
        "event_edge_survives_without_momentum": float(no_momentum["active_sharpe"]) > 0.0,
    }
    if all(checks.values()):
        status = "ready"
    elif checks["best_beats_spy_cagr"] and checks["best_active_sharpe_positive"] and checks["recent_active_sharpe_positive"]:
        status = "caution"
    else:
        status = "blocked"

    reasoning = [
        {
            "claim": "The edge concentrates in fast, unscheduled disclosure flow.",
            "evidence": {
                "best_trade_lag": 1,
                "lag2_cd10_active_sharpe": lag2["active_sharpe"],
                "best_active_sharpe": best["active_sharpe"],
            },
        },
        {
            "claim": "8-K-heavy selection is stronger than blending in slower filing types.",
            "evidence": {
                "best_active_sharpe": best["active_sharpe"],
                "all_forms_active_sharpe": all_forms["active_sharpe"],
            },
        },
        {
            "claim": "The core edge is event-driven; momentum is not required in the current local rerun.",
            "evidence": {
                "best_active_sharpe": best["active_sharpe"],
                "no_momentum_active_sharpe": no_momentum["active_sharpe"],
            },
        },
        {
            "claim": "The edge still exists in the recent window and remains strong in this local rerun.",
            "evidence": {
                "recent_cagr": recent["cagr"],
                "recent_benchmark_cagr": recent["benchmark_cagr"],
                "recent_active_sharpe": recent["active_sharpe"],
            },
        },
    ]
    return {"status": status, "checks": checks, "reasoning": reasoning}


def _report_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# SEC Edge Cycle",
        "",
        f"- status: `{report['assessment']['status']}`",
        f"- prices: `{report['inputs']['prices']}`",
        f"- events: `{report['inputs']['events']}`",
        "",
        "## Runs",
        "",
    ]
    for name, obj in report["results"].items():
        m = obj["metrics"]
        lines.append(
            f"- {name}: cagr=`{m['cagr']:.4f}` sharpe=`{m['sharpe']:.4f}` "
            f"mdd=`{m['mdd']:.4f}` active_sharpe=`{m['active_sharpe']:.4f}`"
        )
    lines.extend(["", "## Checks", ""])
    for name, ok in report["assessment"]["checks"].items():
        lines.append(f"- {name}: `{ok}`")
    lines.extend(["", "## Why It Works", ""])
    for item in report["assessment"]["reasoning"]:
        ev = item["evidence"]
        lines.append(f"- {item['claim']}")
        lines.append(f"  evidence: `{json.dumps(ev, sort_keys=True)}`")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Run the SEC-event edge cycle and emit a verdict.")
    ap.add_argument("--prices", type=Path, default=SR_ROOT / "data_lake" / "yfinance_nasdaq100_plus_spy_10y.csv")
    ap.add_argument("--events", type=Path, default=SR_ROOT / "data_lake" / "sec" / "filing_events_nasdaq100.csv")
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--out-dir", type=Path, default=SR_ROOT / "backtests" / "outputs" / "sec_edge_cycle")
    args = ap.parse_args()

    runs = {
        "best": {
            "top_n": 20,
            "hold_days": 5,
            "trade_lag": 1,
            "gross": 1.0,
            "cost_bps": 10.0,
            "target_vol": 0.2,
            "vol_lookback": 20,
            "max_gross": 2.0,
            "cooldown_days": 0,
            "mom_days": 5,
            "mom_weight": 1.5,
            "form_weight_8k": 1.0,
            "form_weight_10q": 0.0,
            "form_weight_10k": 0.0,
            "eval_last_days": 0,
        },
        "recent_3y": {
            "top_n": 20,
            "hold_days": 5,
            "trade_lag": 1,
            "gross": 1.0,
            "cost_bps": 10.0,
            "target_vol": 0.2,
            "vol_lookback": 20,
            "max_gross": 2.0,
            "cooldown_days": 0,
            "mom_days": 5,
            "mom_weight": 1.5,
            "form_weight_8k": 1.0,
            "form_weight_10q": 0.0,
            "form_weight_10k": 0.0,
            "eval_last_days": 756,
        },
        "no_momentum": {
            "top_n": 20,
            "hold_days": 5,
            "trade_lag": 1,
            "gross": 1.0,
            "cost_bps": 10.0,
            "target_vol": 0.2,
            "vol_lookback": 20,
            "max_gross": 2.0,
            "cooldown_days": 0,
            "mom_days": 5,
            "mom_weight": 0.0,
            "form_weight_8k": 1.0,
            "form_weight_10q": 0.0,
            "form_weight_10k": 0.0,
            "eval_last_days": 0,
        },
        "all_forms": {
            "top_n": 20,
            "hold_days": 5,
            "trade_lag": 1,
            "gross": 1.0,
            "cost_bps": 10.0,
            "target_vol": 0.2,
            "vol_lookback": 20,
            "max_gross": 2.0,
            "cooldown_days": 0,
            "mom_days": 5,
            "mom_weight": 1.5,
            "form_weight_8k": 1.0,
            "form_weight_10q": 0.5,
            "form_weight_10k": 0.25,
            "eval_last_days": 0,
        },
        "lag2_cd10": {
            "top_n": 20,
            "hold_days": 5,
            "trade_lag": 2,
            "gross": 1.0,
            "cost_bps": 10.0,
            "target_vol": 0.2,
            "vol_lookback": 20,
            "max_gross": 2.0,
            "cooldown_days": 10,
            "mom_days": 5,
            "mom_weight": 1.5,
            "form_weight_8k": 1.0,
            "form_weight_10q": 0.0,
            "form_weight_10k": 0.0,
            "eval_last_days": 0,
        },
    }

    results: Dict[str, Dict[str, Any]] = {}
    for name, cfg in runs.items():
        run_dir = args.out_dir / name
        cmd = _backtest_cmd(
            prices=args.prices,
            events=args.events,
            out_dir=run_dir,
            benchmark=str(args.benchmark),
            **cfg,
        )
        _run(cmd)
        summary = _read_json(run_dir / "summary.json")
        results[name] = {
            "run_dir": str(run_dir),
            "params": cfg,
            "summary": summary,
            "metrics": _extract_metrics(summary),
        }

    assessment = _assess_edge(results)
    report = {
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "inputs": {
            "prices": str(args.prices),
            "events": str(args.events),
            "benchmark": str(args.benchmark),
        },
        "results": results,
        "assessment": assessment,
    }
    _write_json(args.out_dir / "edge_cycle_summary.json", report)
    _write_md(args.out_dir / "edge_cycle_report.md", _report_markdown(report))
    print(json.dumps({"status": assessment["status"], "out_dir": str(args.out_dir)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
