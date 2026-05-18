#!/usr/bin/env python3
"""
Apply an Intelligence Oracle market-context overlay to a dynamic-regime protocol JSON.

This is intended to be a *soft risk/positioning constraint*:
  - scale meta.max_gross by MARKET_CONTEXT.overlay.meta_max_gross_multiplier
  - optionally tighten/loosen ML regime thresholds based on recommended_stance

No network calls.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(x)))


def _effective_multiplier(*, raw_mult: float, stance: str, mode: str, geopolitical_shock: bool) -> float:
    mode = str(mode).strip().lower()
    stance = str(stance).strip().lower()
    m = float(raw_mult)

    if mode == "strict":
        out = float(_clamp(m, 0.0, 1.25))
        if geopolitical_shock:
            out = float(min(out, 0.85))
        return out

    if mode == "balanced":
        if stance == "risk_off":
            out = float(_clamp(m, 0.70, 1.00))
            if geopolitical_shock:
                out = float(min(out, 0.80))
            return out
        if stance == "risk_on":
            out = float(max(1.00, m))
            if geopolitical_shock:
                out = float(min(out, 0.95))
            return out
        out = float(max(0.95, m))
        if geopolitical_shock:
            out = float(min(out, 0.90))
        return out

    # soft (default): context acts as guardrail, not alpha suppressor.
    if stance == "risk_off":
        out = float(_clamp(m, 0.75, 1.00))
        if geopolitical_shock:
            out = float(min(out, 0.82))
        return out
    if stance == "risk_on":
        out = float(max(1.00, m))
        if geopolitical_shock:
            out = float(min(out, 0.95))
        return out
    if geopolitical_shock:
        return 0.90
    return 1.00


def apply_overlay(protocol: Dict[str, Any], market_context: Dict[str, Any], *, mode: str = "soft") -> Dict[str, Any]:
    out = deepcopy(protocol)
    meta = dict(out.get("meta") or {})

    base_max_gross = float(meta.get("max_gross", 1.0))
    overlay = market_context.get("overlay") or {}
    mult = float(overlay.get("meta_max_gross_multiplier", 1.0))
    banned_tickers = list(overlay.get("ticker_banned") or [])
    banned_sectors = list(overlay.get("sector_banned") or [])
    stance = str(market_context.get("recommended_stance") or "").strip().lower()
    flags = market_context.get("flags") or {}
    geopolitical_shock = bool(flags.get("geopolitical_shock", False))
    applied_mult = _effective_multiplier(raw_mult=mult, stance=stance, mode=mode, geopolitical_shock=geopolitical_shock)

    new_max_gross = _clamp(base_max_gross * applied_mult, 0.0, 1.0)
    meta["max_gross"] = new_max_gross

    # Small, reversible bias: only tweak thresholds, don't rewrite the strategy.
    if stance == "risk_off":
        out["prob_risk_on_enter"] = float(out.get("prob_risk_on_enter", 0.5)) + 0.03
        out["prob_risk_on_exit"] = float(out.get("prob_risk_on_exit", 0.45)) + 0.03
    elif stance == "risk_on":
        out["prob_risk_on_enter"] = float(out.get("prob_risk_on_enter", 0.5)) - 0.02
        out["prob_risk_on_exit"] = float(out.get("prob_risk_on_exit", 0.45)) - 0.02

    if geopolitical_shock:
        # Temporary de-risk preference under geopolitical stress.
        out["prob_risk_on_enter"] = float(out.get("prob_risk_on_enter", 0.5)) + 0.02
        out["prob_risk_on_exit"] = float(out.get("prob_risk_on_exit", 0.45)) + 0.04

    # Clamp probabilities.
    out["prob_risk_on_enter"] = float(_clamp(float(out.get("prob_risk_on_enter", 0.5)), 0.0, 1.0))
    out["prob_risk_on_exit"] = float(_clamp(float(out.get("prob_risk_on_exit", 0.45)), 0.0, 1.0))
    if float(out["prob_risk_on_exit"]) > float(out["prob_risk_on_enter"]):
        out["prob_risk_on_exit"] = out["prob_risk_on_enter"]

    out["meta"] = meta
    out["intelligence_overlay"] = {
        "as_of": str(market_context.get("as_of", "")),
        "risk_level": str(market_context.get("risk_level", "")),
        "risk_score": float(market_context.get("risk_score", 0.0)),
        "recommended_stance": stance,
        "applied": {
            "mode": str(mode).strip().lower(),
            "geopolitical_shock": geopolitical_shock,
            "meta_max_gross_multiplier": mult,
            "effective_meta_max_gross_multiplier": applied_mult,
            "base_meta_max_gross": base_max_gross,
            "new_meta_max_gross": new_max_gross,
            "ticker_banned": banned_tickers,
            "sector_banned": banned_sectors,
        },
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply MARKET_CONTEXT.json overlay to a protocol JSON.")
    ap.add_argument("--protocol-in", type=Path, required=True)
    ap.add_argument("--market-context", type=Path, default=Path("MARKET_CONTEXT.json"))
    ap.add_argument("--protocol-out", type=Path, required=True)
    ap.add_argument("--mode", choices=["soft", "balanced", "strict"], default="soft")
    args = ap.parse_args()

    protocol = _read_json(args.protocol_in)
    ctx = _read_json(args.market_context)
    out = apply_overlay(protocol, ctx, mode=str(args.mode))
    _write_json(args.protocol_out, out)
    print(f"✅ Wrote {args.protocol_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
