#!/usr/bin/env python3
"""
Offline Cite-Finance-style insights demo (no API key required).

Why:
- Cite-Finance API's "insights" endpoint is sellable on Upwork, but may require keys/network.
- Sharpe-Renaissance already includes an insights engine under `Sharpe-Renaissance/src/intelligence/`.
- This script runs that engine against a local tidy panel and saves a JSON snapshot you can attach to proposals.

Input panel format:
  Instrument, Date, Price_Close, Volume(optional)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SR_ROOT))

from src.intelligence.insights_engine import InsightsEngine  # noqa: E402


def load_price_records(panel_csv: Path, ticker: str, *, period_days: int = 365) -> List[Dict[str, Any]]:
    df = pd.read_csv(panel_csv)
    if not {"Instrument", "Date", "Price_Close"}.issubset(df.columns):
        raise ValueError("Panel must have columns: Instrument, Date, Price_Close, Volume(optional)")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Instrument", "Price_Close"])
    df = df[df["Instrument"].astype(str) == str(ticker)].copy()
    if df.empty:
        return []

    df = df.sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    if "Volume" in df.columns:
        df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")
    else:
        df["Volume"] = pd.NA

    cutoff = df["Date"].max() - pd.Timedelta(days=int(period_days))
    df = df[df["Date"] >= cutoff]

    # Map to cite-finance-api market_data schema expected by TechnicalIndicators:
    # {date, open, high, low, close, volume}
    out = []
    for r in df.itertuples(index=False):
        close = float(getattr(r, "Price_Close"))
        out.append(
            {
                "date": pd.Timestamp(getattr(r, "Date")).isoformat(),
                "open": close,
                "high": close,
                "low": close,
                "close": close,
                "volume": None if pd.isna(getattr(r, "Volume")) else float(getattr(r, "Volume")),
            }
        )
    return out


async def run(ticker: str, price_data: List[Dict[str, Any]], min_confidence: float) -> Dict[str, Any]:
    eng = InsightsEngine()
    insights = await eng.generate_all_insights(ticker=ticker, price_data=price_data, quote_data=None)
    # Filter by confidence like the API does.
    insights = [i for i in insights if float(i.confidence) >= float(min_confidence)]
    # Serialize.
    return {
        "ticker": ticker,
        "n_prices": len(price_data),
        "min_confidence": float(min_confidence),
        "insights": [i.__dict__ for i in insights],
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Offline insights demo using Sharpe-Renaissance intelligence engine.")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--ticker", type=str, required=True)
    p.add_argument("--period-days", type=int, default=365)
    p.add_argument("--min-confidence", type=float, default=0.6)
    p.add_argument("--out", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/offline_insights.json"))
    args = p.parse_args()

    ticker = str(args.ticker).upper()
    prices = load_price_records(args.panel, ticker, period_days=int(args.period_days))
    if not prices:
        print(f"No price records for {ticker} in {args.panel}")
        return 2

    import asyncio

    out = asyncio.run(run(ticker, prices, float(args.min_confidence)))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2))
    print(f"Wrote {args.out}")
    print(f"Insights: {len(out['insights'])} (min_confidence={out['min_confidence']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
