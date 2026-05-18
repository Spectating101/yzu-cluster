#!/usr/bin/env python3
"""
Fetch common equity universes from Wikipedia and write ticker lists for yfinance.

Requires network access.

Examples:
  python3 scripts/fetch_equity_universe_wikipedia.py --sp500 --out config/tickers_sp500.txt
  python3 scripts/fetch_equity_universe_wikipedia.py --nasdaq100 --out config/tickers_nasdaq100.txt
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List

import pandas as pd
import urllib.request
from io import StringIO


def _normalize_for_yahoo(ticker: str) -> str:
    # Wikipedia often uses BRK.B / BF.B; yfinance uses BRK-B / BF-B.
    t = ticker.strip().upper()
    return t.replace(".", "-")


def _write(out: Path, tickers: Iterable[str], header: str) -> None:
    uniq = []
    seen = set()
    for t in tickers:
        t = _normalize_for_yahoo(t)
        if not t or t.startswith("#"):
            continue
        if t not in seen:
            uniq.append(t)
            seen.add(t)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(header + "\n" + "\n".join(uniq) + "\n")


def fetch_sp500() -> List[str]:
    # Table contains a "Symbol" column.
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    tables = pd.read_html(StringIO(html))
    for t in tables:
        if "Symbol" in t.columns:
            return [str(x) for x in t["Symbol"].dropna().tolist()]
    raise RuntimeError("Unable to find S&P 500 Symbol column on Wikipedia page")


def fetch_nasdaq100() -> List[str]:
    # Table contains "Ticker" column.
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    tables = pd.read_html(StringIO(html))
    for t in tables:
        if "Ticker" in t.columns:
            return [str(x) for x in t["Ticker"].dropna().tolist()]
    # Some page variants use "Company" / "Ticker" in other tables; fallback scan.
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if "ticker" in cols:
            idx = cols.index("ticker")
            return [str(x) for x in t.iloc[:, idx].dropna().tolist()]
    raise RuntimeError("Unable to find Nasdaq-100 Ticker column on Wikipedia page")


def main() -> int:
    p = argparse.ArgumentParser(description="Fetch Wikipedia-based equity universe ticker lists.")
    p.add_argument("--sp500", action="store_true")
    p.add_argument("--nasdaq100", action="store_true")
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    if not args.sp500 and not args.nasdaq100:
        print("Select at least one: --sp500 or --nasdaq100")
        return 2

    if args.sp500 and args.nasdaq100:
        print("Choose only one universe per file. Run the script twice.")
        return 2

    if args.sp500:
        tickers = fetch_sp500()
        header = "# S&P 500 constituents (Wikipedia)\n"
    else:
        tickers = fetch_nasdaq100()
        header = "# Nasdaq-100 constituents (Wikipedia)\n"

    _write(args.out, tickers, header=header)
    print(f"✅ wrote {len(tickers)} tickers to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
