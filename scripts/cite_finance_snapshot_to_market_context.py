#!/usr/bin/env python3
from __future__ import annotations

"""
Convert a Cite-Finance-style snapshot JSON into MARKET_CONTEXT.json for Sharpe-Renaissance.

Why:
- Sharpe-Renaissance already supports a deterministic "intelligence overlay" via:
  `scripts/apply_intelligence_overlay.py`
- Cite-Finance (or the offline snapshot generator) produces "insights" that we can translate into:
  - risk_score (0..1)
  - risk_level (low/medium/high)
  - recommended_stance (risk_on / neutral / risk_off)
  - overlay meta_max_gross_multiplier (position sizing constraint)

This stays deterministic and auditable.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(x)))


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _score_from_insights(insights: List[Dict[str, Any]]) -> float:
    """
    Heuristic scoring:
    - risk/anomaly/volatility warnings push risk_score up
    - strong bullish momentum can slightly reduce it
    """
    score = 0.50
    for i in insights:
        itype = str(i.get("insight_type") or "").lower()
        sig = str(i.get("signal") or "").lower()
        conf = float(i.get("confidence") or 0.0)

        if itype in {"risk", "anomaly", "volatility"} and sig in {"warning", "bearish", "strong_bearish"}:
            score += 0.18 * conf
        elif itype in {"trend", "momentum"} and sig in {"bearish", "strong_bearish"}:
            score += 0.10 * conf
        elif itype in {"trend", "momentum"} and sig in {"bullish", "strong_bullish"}:
            score -= 0.06 * conf

    return float(_clamp(score, 0.0, 1.0))


def _stance(score: float) -> str:
    if score >= 0.62:
        return "risk_off"
    if score <= 0.38:
        return "risk_on"
    return "neutral"


def _risk_level(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.55:
        return "medium"
    return "low"


def _max_gross_multiplier(score: float) -> float:
    if score >= 0.80:
        return 0.55
    if score >= 0.65:
        return 0.70
    if score >= 0.55:
        return 0.85
    return 1.00


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert cite-finance snapshot JSON to MARKET_CONTEXT.json.")
    ap.add_argument("--snapshot", type=Path, required=True, help="Snapshot JSON with {ticker, metrics, insights}.")
    ap.add_argument("--out", type=Path, default=Path("MARKET_CONTEXT.json"))
    ap.add_argument("--as-of", type=str, default=None, help="Override as_of timestamp (ISO).")
    args = ap.parse_args()

    snap = json.loads(args.snapshot.read_text())
    ticker = str(snap.get("ticker") or "")
    insights = snap.get("insights") or []
    if not isinstance(insights, list):
        insights = []

    score = _score_from_insights(insights)
    stance = _stance(score)
    ctx: Dict[str, Any] = {
        "as_of": args.as_of or _now_utc_iso(),
        "source": "cite_finance_snapshot",
        "ticker": ticker,
        "risk_score": score,
        "risk_level": _risk_level(score),
        "recommended_stance": stance,
        "overlay": {
            "meta_max_gross_multiplier": _max_gross_multiplier(score),
        },
        "notes": {
            "insights_count": len(insights),
            "heuristic": "risk/anomaly warnings increase risk_score; bullish momentum reduces it slightly.",
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(ctx, indent=2) + "\n")
    print(f"✅ Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

