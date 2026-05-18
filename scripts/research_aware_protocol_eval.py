#!/usr/bin/env python3
"""
Research-aware protocol evaluation.

Purpose:
  Take an existing dynamic regime protocol (risk_on/risk_off/crash configs)
  and evaluate whether applying simple "academic realism" overrides improves
  outcomes or simply degrades performance.

What this does (intentionally conservative):
  - Reads Cite-Agent topic snapshots from `--research-context-dir`
  - If the snapshots emphasize implementation frictions (turnover/costs/slippage),
    it increases `cost_bps` and slows rebalancing across all underlying configs.
  - Runs the dynamic regime backtest twice:
      1) baseline (as-is)
      2) research-aware (overridden configs)
  - Writes a comparison JSON plus both run outputs.

This is research tooling only; it does not provide investment advice.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


_ROOT = Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _iter_topic_texts(research_dir: Path) -> Iterable[str]:
    if not research_dir.exists():
        return []
    for p in sorted(research_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        state = data.get("state") or {}
        yield str(state.get("summary") or "")
        for item in (state.get("key_findings") or []):
            yield str(item)
        for item in (state.get("established_methods") or []):
            yield str(item)
        for item in (state.get("known_gaps") or []):
            yield str(item)
        for paper in (state.get("last_papers") or []):
            yield str(paper.get("title") or "")
            yield str(paper.get("venue") or "")


def _mentions_any(text: str, needles: Iterable[str]) -> bool:
    t = (text or "").lower()
    return any(n.lower() in t for n in needles)


@dataclass(frozen=True)
class ResearchOverrides:
    cost_bps_floor: float
    rebalance_every_floor: int
    rebalance_threshold_floor: float


def derive_overrides(research_dir: Path) -> Tuple[ResearchOverrides, Dict[str, Any]]:
    """
    Derive simple, deterministic overrides from research snapshots.

    These are intentionally blunt: they push the strategy toward being honest
    about turnover and friction. If this reduces backtest returns, that's
    useful information (it means performance was brittle).
    """
    texts = list(_iter_topic_texts(research_dir))
    joined = "\n".join(texts)

    friction_keywords = [
        "transaction cost",
        "trading cost",
        "turnover",
        "slippage",
        "market impact",
        "implementation shortfall",
        "capacity",
        "liquidity",
        "bid-ask",
        "fees",
    ]
    has_friction = _mentions_any(joined, friction_keywords)

    # Default: no change.
    overrides = ResearchOverrides(cost_bps_floor=0.0, rebalance_every_floor=1, rebalance_threshold_floor=0.0)

    # If the academic context strongly points at frictions, be stricter.
    if has_friction:
        overrides = ResearchOverrides(cost_bps_floor=5.0, rebalance_every_floor=5, rebalance_threshold_floor=0.15)

    diag = {
        "research_dir": str(research_dir),
        "friction_keywords_hit": bool(has_friction),
        "friction_keywords": friction_keywords,
        "derived": {
            "cost_bps_floor": overrides.cost_bps_floor,
            "rebalance_every_floor": overrides.rebalance_every_floor,
            "rebalance_threshold_floor": overrides.rebalance_threshold_floor,
        },
    }
    return overrides, diag


def _apply_overrides_to_config(cfg: Dict[str, Any], ov: ResearchOverrides) -> Dict[str, Any]:
    out = dict(cfg)
    if ov.cost_bps_floor > 0:
        out["cost_bps"] = float(max(float(out.get("cost_bps", 0.0)), ov.cost_bps_floor))
    if ov.rebalance_every_floor > 1:
        out["rebalance_every"] = int(max(int(out.get("rebalance_every", 1)), ov.rebalance_every_floor))
    if ov.rebalance_threshold_floor > 0:
        out["rebalance_threshold"] = float(
            max(float(out.get("rebalance_threshold", 0.0)), ov.rebalance_threshold_floor)
        )
    return out


def _run_dynamic_regime(protocol: Dict[str, Any], *, out_dir: Path) -> Dict[str, Any]:
    cmd = [
        sys.executable,
        str(_ROOT / "Sharpe-Renaissance/scripts/spy_beater_dynamic_regime_runner.py"),
        "--panel",
        str(_ROOT / protocol["panel"]),
        "--benchmark",
        str(protocol.get("benchmark", "SPY")),
        "--risk-on-config",
        str(_ROOT / protocol["risk_on_config"]),
        "--risk-off-config",
        str(_ROOT / protocol["risk_off_config"]),
        "--crash-config",
        str(_ROOT / protocol["crash_config"]),
        "--out-dir",
        str(out_dir),
        "--train-days",
        str(int(protocol.get("train_days", 756))),
        "--refit-every",
        str(int(protocol.get("refit_every", 21))),
        "--label-horizon",
        str(int(protocol.get("label_horizon", 21))),
        "--hard-crash-days",
        str(int(protocol.get("hard_crash_days", 3))),
        "--hard-crash-ret",
        str(float(protocol.get("hard_crash_ret", -0.10))),
        "--hard-vol-lookback",
        str(int(protocol.get("hard_vol_lookback", 10))),
        "--hard-vol-max",
        str(float(protocol.get("hard_vol_max", 0.24))),
        "--prob-risk-on",
        str(float(protocol.get("prob_risk_on", 0.5))),
    ]

    put = protocol.get("put_hedge") or {}
    if isinstance(put, dict) and bool(put.get("enabled")):
        cmd.extend(
            [
                "--put-hedge",
                "--put-maturity-days",
                str(int(put.get("maturity_days", 21))),
                "--put-otm",
                str(float(put.get("otm", 0.05))),
                "--put-notional-frac",
                str(float(put.get("notional_frac", 0.3))),
                "--iv-mult",
                str(float(put.get("iv_mult", 1.25))),
                "--opt-rate",
                str(float(put.get("opt_rate", 0.0))),
                "--opt-steps",
                str(int(put.get("opt_steps", 200))),
            ]
        )

    subprocess.run(cmd, check=True, cwd=str(_ROOT))
    return _read_json(out_dir / "summary.json")


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate a dynamic regime protocol with research-aware overrides.")
    ap.add_argument(
        "--protocol-json",
        type=Path,
        default=Path("Sharpe-Renaissance/config/dynamic_regime_protocol_sweepbest.json"),
    )
    ap.add_argument(
        "--research-context-dir",
        type=Path,
        default=Path("Sharpe-Renaissance/data_lake/research_context"),
        help="Directory containing Cite-Agent topic snapshots (*.json).",
    )
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/spy_beater/research_aware_eval"))
    ap.add_argument("--clean", action="store_true", help="Delete out-dir before running.")
    args = ap.parse_args()

    out_dir = args.out_dir
    if args.clean and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    protocol = _read_json(args.protocol_json)
    overrides, diag = derive_overrides(args.research_context_dir)

    baseline_dir = out_dir / "baseline"
    ra_dir = out_dir / "research_aware"

    baseline_summary = _run_dynamic_regime(protocol, out_dir=baseline_dir)

    # Build overridden configs in-place for this run.
    cfg_on = _apply_overrides_to_config(_read_json(_ROOT / protocol["risk_on_config"]), overrides)
    cfg_off = _apply_overrides_to_config(_read_json(_ROOT / protocol["risk_off_config"]), overrides)
    cfg_crash = _apply_overrides_to_config(_read_json(_ROOT / protocol["crash_config"]), overrides)

    tmp_cfg_dir = out_dir / "tmp_configs"
    tmp_cfg_dir.mkdir(parents=True, exist_ok=True)
    on_path = tmp_cfg_dir / "risk_on.json"
    off_path = tmp_cfg_dir / "risk_off.json"
    crash_path = tmp_cfg_dir / "crash.json"
    _write_json(on_path, cfg_on)
    _write_json(off_path, cfg_off)
    _write_json(crash_path, cfg_crash)

    protocol_ra = dict(protocol)
    # Use absolute paths so the protocol remains runnable regardless of CWD.
    protocol_ra["risk_on_config"] = str(on_path.resolve())
    protocol_ra["risk_off_config"] = str(off_path.resolve())
    protocol_ra["crash_config"] = str(crash_path.resolve())
    _write_json(out_dir / "protocol_research_aware.json", protocol_ra)

    ra_summary = _run_dynamic_regime(protocol_ra, out_dir=ra_dir)

    comparison = {
        "protocol_json": str(args.protocol_json),
        "research_context_dir": str(args.research_context_dir),
        "overrides": diag,
        "baseline": baseline_summary,
        "research_aware": ra_summary,
    }
    _write_json(out_dir / "comparison.json", comparison)
    print(json.dumps(comparison, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
