#!/usr/bin/env python3
"""
Research-findings ablation harness.

Goal:
  Turn "paper reasoning" into *testable interventions* on the trading protocol.
  This is deliberately not magic: it creates variants you can backtest and
  keeps only what survives robust evaluation.

Approach:
  - Start from an existing dynamic regime protocol JSON.
  - Read Cite-Agent topic snapshots (Sharpe-Renaissance/data_lake/research_context/*.json).
  - Generate a small set of protocol variants ("interventions") that correspond to
    common academic findings/implementation guidance, e.g.:
      * implementation frictions -> higher cost + slower rebalancing
      * short-horizon predictability -> shorter label horizon + more frequent refits
      * trend + absolute momentum robustness -> require_asset_trend + mom_floor>=0
  - Run the dynamic regime backtest for baseline + each intervention.
  - Write a comparison report.

This script does NOT claim to "use papers to predict markets". It makes the
research influence explicit and falsifiable.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


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
        yield p.name
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
class Intervention:
    name: str
    description: str

    # Protocol-level changes (dynamic regime model / hard overrides)
    train_days: Optional[int] = None
    refit_every: Optional[int] = None
    label_horizon: Optional[int] = None
    hard_vol_max: Optional[float] = None

    # Engine config changes (applied to risk_on/risk_off/crash configs)
    cost_bps_floor: Optional[float] = None
    rebalance_every_floor: Optional[int] = None
    rebalance_threshold_floor: Optional[float] = None
    mom_floor: Optional[float] = None
    mom_days: Optional[int] = None
    require_asset_trend: Optional[bool] = None


def propose_interventions(research_dir: Path) -> Tuple[List[Intervention], Dict[str, Any]]:
    texts = list(_iter_topic_texts(research_dir))
    joined = "\n".join(texts)

    friction_hit = _mentions_any(
        joined,
        [
            "transaction cost",
            "trading cost",
            "turnover",
            "slippage",
            "market impact",
            "implementation shortfall",
            "bid-ask",
            "liquidity",
            "capacity",
            "fees",
        ],
    )

    short_horizon_hit = _mentions_any(
        joined,
        [
            "intraday",
            "high-frequency",
            "short horizon",
            "daily",
            "week",
            "weekly",
            "near-term",
        ],
    )

    robustness_hit = _mentions_any(
        joined,
        [
            "momentum",
            "trend",
            "moving average",
            "robust",
            "out-of-sample",
            "regularize",
            "shrinkage",
        ],
    )

    interventions: List[Intervention] = []

    # Always include a couple of generic, falsifiable “paper-ish” robustness tweaks.
    interventions.append(
        Intervention(
            name="abs_momentum_plus_trend",
            description="Require positive momentum + per-asset trend filter (common robustness constraint).",
            mom_floor=0.0,
            require_asset_trend=True,
        )
    )

    if friction_hit:
        interventions.append(
            Intervention(
                name="frictions_strict",
                description="Implementation realism: enforce higher costs + slower rebalancing.",
                cost_bps_floor=5.0,
                rebalance_every_floor=5,
                rebalance_threshold_floor=0.15,
            )
        )

    if short_horizon_hit:
        interventions.append(
            Intervention(
                name="short_horizon_regime",
                description="Shorter horizon regime model: faster refits + shorter label horizon.",
                refit_every=5,
                label_horizon=5,
            )
        )
        interventions.append(
            Intervention(
                name="short_horizon_momentum",
                description="Shorter momentum lookback (more reactive rotation).",
                mom_days=21,
            )
        )

    if robustness_hit:
        interventions.append(
            Intervention(
                name="risk_off_stricter",
                description="Stricter hard volatility override for risk-off (reduce tail exposure).",
                hard_vol_max=0.20,
            )
        )

    diag = {
        "research_dir": str(research_dir),
        "signals": {
            "friction_hit": bool(friction_hit),
            "short_horizon_hit": bool(short_horizon_hit),
            "robustness_hit": bool(robustness_hit),
        },
        "interventions": [i.__dict__ for i in interventions],
    }
    return interventions, diag


def _apply_engine_overrides(cfg: Dict[str, Any], i: Intervention) -> Dict[str, Any]:
    out = dict(cfg)
    if i.cost_bps_floor is not None:
        out["cost_bps"] = float(max(float(out.get("cost_bps", 0.0)), float(i.cost_bps_floor)))
    if i.rebalance_every_floor is not None:
        out["rebalance_every"] = int(max(int(out.get("rebalance_every", 1)), int(i.rebalance_every_floor)))
    if i.rebalance_threshold_floor is not None:
        out["rebalance_threshold"] = float(
            max(float(out.get("rebalance_threshold", 0.0)), float(i.rebalance_threshold_floor))
        )
    if i.mom_floor is not None:
        out["mom_floor"] = float(i.mom_floor)
    if i.mom_days is not None:
        out["mom_days"] = int(i.mom_days)
    if i.require_asset_trend is not None:
        out["require_asset_trend"] = bool(i.require_asset_trend)
    return out


def _apply_protocol_overrides(protocol: Dict[str, Any], i: Intervention) -> Dict[str, Any]:
    out = dict(protocol)
    if i.train_days is not None:
        out["train_days"] = int(i.train_days)
    if i.refit_every is not None:
        out["refit_every"] = int(i.refit_every)
    if i.label_horizon is not None:
        out["label_horizon"] = int(i.label_horizon)
    if i.hard_vol_max is not None:
        out["hard_vol_max"] = float(i.hard_vol_max)
    return out


def _run_dynamic_regime(protocol: Dict[str, Any], *, out_dir: Path) -> Dict[str, Any]:
    cmd = [
        sys.executable,
        str(_ROOT / "Sharpe-Renaissance/scripts/spy_beater_dynamic_regime_runner.py"),
        "--panel",
        str(protocol["panel"]),
        "--benchmark",
        str(protocol.get("benchmark", "SPY")),
        "--risk-on-config",
        str(protocol["risk_on_config"]),
        "--risk-off-config",
        str(protocol["risk_off_config"]),
        "--crash-config",
        str(protocol["crash_config"]),
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
    ap = argparse.ArgumentParser(description="Ablate research-inspired interventions against a baseline protocol.")
    ap.add_argument(
        "--protocol-json",
        type=Path,
        default=Path("Sharpe-Renaissance/config/dynamic_regime_protocol_sweepbest.json"),
    )
    ap.add_argument(
        "--research-context-dir",
        type=Path,
        default=Path("Sharpe-Renaissance/data_lake/research_context"),
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path("Sharpe-Renaissance/backtests/outputs/spy_beater/research_findings_ablation"),
    )
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

    if args.clean and args.out_dir.exists():
        shutil.rmtree(args.out_dir)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    protocol = _read_json(args.protocol_json)
    interventions, diag = propose_interventions(args.research_context_dir)

    baseline_dir = args.out_dir / "baseline"
    baseline_summary = _run_dynamic_regime(protocol, out_dir=baseline_dir)

    # Load base engine configs once.
    cfg_on_base = _read_json(Path(protocol["risk_on_config"]))
    cfg_off_base = _read_json(Path(protocol["risk_off_config"]))
    cfg_crash_base = _read_json(Path(protocol["crash_config"]))

    results: Dict[str, Any] = {
        "protocol_json": str(args.protocol_json),
        "research_context_dir": str(args.research_context_dir),
        "diagnostics": diag,
        "baseline": baseline_summary,
        "variants": {},
    }

    tmp_cfg_dir = args.out_dir / "tmp_configs"
    tmp_cfg_dir.mkdir(parents=True, exist_ok=True)

    for inv in interventions:
        inv_dir = args.out_dir / f"variant_{inv.name}"
        inv_dir.mkdir(parents=True, exist_ok=True)
        inv_cfg_dir = tmp_cfg_dir / inv.name
        inv_cfg_dir.mkdir(parents=True, exist_ok=True)

        cfg_on = _apply_engine_overrides(cfg_on_base, inv)
        cfg_off = _apply_engine_overrides(cfg_off_base, inv)
        cfg_crash = _apply_engine_overrides(cfg_crash_base, inv)

        on_path = inv_cfg_dir / "risk_on.json"
        off_path = inv_cfg_dir / "risk_off.json"
        crash_path = inv_cfg_dir / "crash.json"
        _write_json(on_path, cfg_on)
        _write_json(off_path, cfg_off)
        _write_json(crash_path, cfg_crash)

        prot_inv = _apply_protocol_overrides(protocol, inv)
        prot_inv["risk_on_config"] = str(on_path)
        prot_inv["risk_off_config"] = str(off_path)
        prot_inv["crash_config"] = str(crash_path)
        _write_json(inv_dir / "protocol.json", prot_inv)

        summary = _run_dynamic_regime(prot_inv, out_dir=inv_dir)
        results["variants"][inv.name] = {
            "description": inv.description,
            "summary": summary,
            "protocol_path": str(inv_dir / "protocol.json"),
        }

    _write_json(args.out_dir / "comparison.json", results)
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
