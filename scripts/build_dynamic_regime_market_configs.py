#!/usr/bin/env python3
"""
Generate risk_on/risk_off/crash config JSONs + a dynamic-regime protocol JSON from a ticker universe file.

This is meant for rapid staged testing:
  - stocks-only (benchmark SPY)
  - crypto-only (benchmark BTC-USD)
  - combined (benchmark SPY, risky includes both)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def _read_tickers(path: Path) -> List[str]:
    tickers: List[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.append(line.split()[0].strip().upper())
    return sorted(dict.fromkeys(tickers))


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _config(
    *,
    benchmark: str,
    risky: List[str],
    defensive: List[str],
    core_weight: float,
    core_to_cash_when_bear: bool,
) -> Dict[str, Any]:
    return {
        "benchmark": benchmark,
        "cash": "BIL",
        "cost_bps": 2,
        "sma_days": 200,
        "mom_days": 63,
        "top_k_risky": 1,
        "top_k_defensive": min(2, len(defensive)),
        "core_weight": float(core_weight),
        "core_to_cash_when_bear": bool(core_to_cash_when_bear),
        "max_gross": 1.0,
        "allocate_residual_to_cash": True,
        "bear_mode": "defensive",
        "risky": risky,
        "defensive": defensive,
        "inverse": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build dynamic-regime configs/protocol from a ticker universe.")
    ap.add_argument("--universe", type=Path, required=True, help="Ticker list (one per line).")
    ap.add_argument("--mode", choices=["stocks", "crypto", "both"], default="stocks")
    ap.add_argument("--panel", type=str, required=True, help="Path to tidy panel CSV (repo-relative).")
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/config/generated"))
    ap.add_argument("--name", type=str, default="intel")
    args = ap.parse_args()

    tickers = _read_tickers(args.universe)
    if not tickers:
        raise SystemExit("Universe is empty.")

    if args.mode == "crypto":
        benchmark = "BTC-USD"
    else:
        benchmark = "SPY"

    # Defensive set kept small and stable.
    defensive = [t for t in ["BIL", "TLT", "GLD"] if t in tickers or True]

    risky = tickers[:]
    if benchmark not in risky:
        risky = [benchmark, *risky]
    # Avoid putting defensive assets in risky list.
    risky = [t for t in risky if t not in defensive]

    name = args.name.strip() or "intel"
    out_dir = args.out_dir / name
    out_dir.mkdir(parents=True, exist_ok=True)

    risk_on = _config(benchmark=benchmark, risky=risky, defensive=defensive, core_weight=0.50, core_to_cash_when_bear=False)
    risk_off = _config(benchmark=benchmark, risky=risky, defensive=defensive, core_weight=0.25, core_to_cash_when_bear=True)
    crash = _config(benchmark=benchmark, risky=risky, defensive=defensive, core_weight=0.0, core_to_cash_when_bear=True)

    risk_on_path = out_dir / f"{name}_{args.mode}_risk_on.json"
    risk_off_path = out_dir / f"{name}_{args.mode}_risk_off.json"
    crash_path = out_dir / f"{name}_{args.mode}_crash.json"

    _write_json(risk_on_path, risk_on)
    _write_json(risk_off_path, risk_off)
    _write_json(crash_path, crash)

    protocol = {
        "panel": str(args.panel),
        "benchmark": benchmark,
        "train_days": 756,
        "refit_every": 5,
        "label_horizon": 5,
        "hard_crash_days": 3,
        "hard_crash_ret": -0.1,
        "hard_vol_lookback": 10,
        "hard_vol_max": 0.0,
        "prob_risk_on_enter": 0.5,
        "prob_risk_on_exit": 0.45,
        "rebalance_every": 1,
        "turnover_cap": 0.0,
        "risk_on_config": str(risk_on_path),
        "risk_off_config": str(risk_off_path),
        "crash_config": str(crash_path),
        "meta": {
            "max_gross": 1.0,
            "cash": "BIL",
            "port_dd_stop": 0.0,
            "port_dd_cooldown_days": 21,
            "cppi_floor_frac": 0.0,
            "cppi_multiplier": 0.0,
            "vol_target": 0.0,
            "vol_lookback": 20,
        },
        "put_hedge": {"enabled": False},
    }
    protocol_path = out_dir / f"{name}_{args.mode}_protocol.json"
    _write_json(protocol_path, protocol)

    print(f"✅ Wrote configs to {out_dir}")
    print(f"✅ Protocol: {protocol_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

