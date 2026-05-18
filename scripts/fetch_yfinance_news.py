#!/usr/bin/env python3
"""
Optional news collector via yfinance (network required).

This is *not* used in the backtests yet; it exists to build a local dataset
that we can later turn into features (sentiment/volume-of-news/shocks).

Output format:
  data_lake/news/yfinance_{TICKER}.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def fetch_news(ticker: str) -> List[Dict[str, Any]]:
    import yfinance as yf

    t = yf.Ticker(ticker)
    news = getattr(t, "news", None) or []
    # Keep only stable fields
    out = []
    for item in news:
        out.append(
            {
                "ticker": ticker,
                "title": item.get("title"),
                "publisher": item.get("publisher"),
                "link": item.get("link"),
                "providerPublishTime": item.get("providerPublishTime"),
                "type": item.get("type"),
                "uuid": item.get("uuid"),
                "relatedTickers": item.get("relatedTickers"),
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch recent news via yfinance.")
    parser.add_argument("--tickers", nargs="+", required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("data_lake/news"))
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for t in args.tickers:
        news = fetch_news(t)
        out_path = args.out_dir / f"yfinance_{t}.json"
        out_path.write_text(json.dumps(news, indent=2))
        print(f"✅ {t}: {len(news)} items -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

