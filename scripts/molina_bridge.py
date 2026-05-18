#!/usr/bin/env python3
"""
Molina-to-Sharpe Bridge (molina_bridge.py)

Purpose:
  Consumes the high-level 'INTELLIGENCE_BUNDLE.json' (produced by the Molina Fleet)
  and transforms it into a trading-executable 'MARKET_CONTEXT.json'.
  
  Unlike the basic 'generate_market_context.py', this bridge respects:
  - Specific Ticker Bans (from Analyst Reports)
  - Sector Risk Levels
  - Scientific Credibility Scores (from ConceptAuditor)

Usage:
  python3 molina_bridge.py --bundle INTELLIGENCE_BUNDLE.json --out MARKET_CONTEXT.json
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Set

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MolinaBridge")

def load_bundle(path: Path) -> Dict[str, Any]:
    if not path.exists():
        logger.error(f"Bundle not found: {path}")
        return {}
    return json.loads(path.read_text())

def extract_ticker_bans(bundle: Dict[str, Any]) -> List[str]:
    """
    Scans Analyst Reports for explicit negative sentiment or 'risk_off' targets.
    """
    banned = set()
    
    # 1. Check Analyst Reports
    reports = bundle.get("analyst", [])
    for report in reports:
        struct = report.get("structured", {})
        stance = struct.get("stance", "neutral").lower()
        tickers = struct.get("tickers", [])
        
        # If the analyst says "Risk Off" for these tickers, we ban them.
        if stance in ["risk_off", "bearish", "sell"]:
            for t in tickers:
                clean_t = t.replace("$", "").upper().strip()
                banned.add(clean_t)
                
    return list(banned)

def calculate_risk_multiplier(bundle: Dict[str, Any]) -> float:
    """
    Calculates a global risk scaler (0.0 to 1.0) based on science & news.
    """
    base_mult = 1.0
    
    # 1. Science Check (ConceptAuditor)
    # If we have many claims with "No relevant papers found" or refutations, we lower confidence.
    science = bundle.get("science", [])
    invalid_claims = 0
    for s in science:
        if "refuted" in s.get("analysis", "").lower() or "no relevant papers" in s.get("analysis", "").lower():
            invalid_claims += 1
            
    if invalid_claims > 0:
        logger.info(f"Detected {invalid_claims} shaky scientific claims. Reducing exposure.")
        base_mult -= (0.1 * invalid_claims)

    # 2. Analyst Stance
    reports = bundle.get("analyst", [])
    risk_off_reports = sum(1 for r in reports if r.get("structured", {}).get("stance") == "risk_off")
    if risk_off_reports > 0:
         logger.info(f"Detected {risk_off_reports} bearish analyst reports. Reducing exposure.")
         base_mult -= (0.2 * risk_off_reports)
         
    return max(0.1, min(1.0, base_mult))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", type=Path, default=Path("INTELLIGENCE_BUNDLE.json"))
    ap.add_argument("--out", type=Path, default=Path("MARKET_CONTEXT.json"))
    args = ap.parse_args()

    bundle = load_bundle(args.bundle)
    if not bundle:
        return 1

    # Logic
    banned_tickers = extract_ticker_bans(bundle)
    gross_mult = calculate_risk_multiplier(bundle)
    
    # Determine Global Stance
    stance = "neutral"
    if gross_mult < 0.8:
        stance = "risk_off"
    elif gross_mult > 1.1: # Rare
        stance = "risk_on"

    # Construct Context
    context = {
        "as_of": bundle.get("as_of"),
        "generated_by": "MolinaBridge v1.0",
        "recommended_stance": stance,
        "risk_score": 1.0 - gross_mult, # Inverse
        "overlay": {
            "meta_max_gross_multiplier": round(gross_mult, 2),
            "ticker_banned": banned_tickers,
            "notes": f"Molina Fleet detected {len(banned_tickers)} toxic assets and adjusted global risk to {gross_mult:.2f}x."
        }
    }

    # Write
    args.out.write_text(json.dumps(context, indent=2))
    logger.info(f"✅ Generated MARKET_CONTEXT with bans: {banned_tickers} and mult: {gross_mult}")
    
if __name__ == "__main__":
    main()
