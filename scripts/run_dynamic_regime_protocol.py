#!/usr/bin/env python3
"""
Run the dynamic regime runner from a single protocol JSON.

This is the "wrap it up" entrypoint:
  - reads `protocol.json`
  - invokes `spy_beater_dynamic_regime_runner.py` with matching CLI flags
  - produces `summary.json`, `equity.csv`, `benchmark_equity.csv`, `regime_log.csv`, and `signal.json`
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List


_WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[1]


def _resolve_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if path.is_absolute():
        return path.resolve()
    parts = list(path.parts)
    trimmed = path
    if parts and parts[0] == _REPO_ROOT.name:
        trimmed = Path(*parts[1:]) if len(parts) > 1 else Path(".")
    repo_default = _REPO_ROOT / trimmed
    workspace_default = _WORKSPACE_ROOT / trimmed
    candidates = [path, repo_default, workspace_default]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    return repo_default.resolve()


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a dynamic regime protocol JSON and emit a signal artifact.")
    ap.add_argument(
        "--protocol-json",
        type=Path,
        default=_REPO_ROOT / "config" / "dynamic_regime_protocol_signal_ready.json",
    )
    ap.add_argument("--out-dir", type=Path, default=_REPO_ROOT / "backtests" / "outputs" / "spy_beater" / "dynamic_regime_protocol_run")
    args = ap.parse_args()

    protocol_json = _resolve_path(args.protocol_json)
    protocol = _read_json(protocol_json)
    meta = protocol.get("meta") or {}
    put = protocol.get("put_hedge") or {}
    out_dir = _resolve_path(args.out_dir)

    cmd: List[str] = [
        sys.executable,
        str(_REPO_ROOT / "scripts" / "spy_beater_dynamic_regime_runner.py"),
        "--panel",
        str(_resolve_path(protocol["panel"])),
        "--benchmark",
        str(protocol.get("benchmark", "SPY")),
        "--risk-on-config",
        str(_resolve_path(protocol["risk_on_config"])),
        "--risk-off-config",
        str(_resolve_path(protocol["risk_off_config"])),
        "--crash-config",
        str(_resolve_path(protocol["crash_config"])),
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
        "--prob-risk-on-enter",
        str(float(protocol.get("prob_risk_on_enter", protocol.get("prob_risk_on", 0.5)))),
        "--prob-risk-on-exit",
        str(float(protocol.get("prob_risk_on_exit", max(0.0, float(protocol.get("prob_risk_on_enter", protocol.get("prob_risk_on", 0.5))) - 0.05)))),
        "--rebalance-every",
        str(int(protocol.get("rebalance_every", 1))),
        "--turnover-cap",
        str(float(protocol.get("turnover_cap", 0.0))),
        "--meta-max-gross",
        str(float(meta.get("max_gross", 1.0))),
        "--meta-cash",
        str(meta.get("cash", "")),
        "--meta-port-dd-stop",
        str(float(meta.get("port_dd_stop", 0.0))),
        "--meta-port-dd-cooldown-days",
        str(int(meta.get("port_dd_cooldown_days", 21))),
        "--meta-cppi-floor-frac",
        str(float(meta.get("cppi_floor_frac", 0.0))),
        "--meta-cppi-multiplier",
        str(float(meta.get("cppi_multiplier", 0.0))),
        "--meta-vol-target",
        str(float(meta.get("vol_target", 0.0))),
        "--meta-vol-lookback",
        str(int(meta.get("vol_lookback", 20))),
    ]

    if bool(protocol.get("hard_vol_requires_bear", False)):
        cmd.append("--hard-vol-requires-bear")
        cmd.extend(["--hard-vol-sma-days", str(int(protocol.get("hard_vol_sma_days", 200)))])

    if bool(protocol.get("turnover_cap_skip_on_regime_change", False)):
        cmd.append("--turnover-cap-skip-on-regime-change")

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

    # Molina Intelligence Overlay: Blacklist
    overlay = protocol.get("intelligence_overlay", {})
    applied = overlay.get("applied", {})
    banned = applied.get("ticker_banned", [])
    if banned and isinstance(banned, list):
        cmd.append("--blacklist")
        cmd.extend([str(t) for t in banned])

    subprocess.run(cmd, check=True, cwd=str(_REPO_ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
