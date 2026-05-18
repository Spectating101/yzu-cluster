#!/usr/bin/env python3
"""
Build a tradable universe (ticker list) from INTELLIGENCE_BUNDLE.json.

This enables staged testing:
  1) stocks-only
  2) crypto-only
  3) combined
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Set


def _read_json(path: Path):
    return json.loads(path.read_text())


def _write_tickers(path: Path, tickers: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(tickers) + ("\n" if tickers else ""))


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a ticker universe from an intelligence bundle.")
    ap.add_argument("--bundle", type=Path, default=Path("INTELLIGENCE_BUNDLE.json"))
    ap.add_argument("--asset-class", choices=["stocks", "crypto", "both"], default="stocks")
    ap.add_argument("--out", type=Path, default=Path("Sharpe-Renaissance/config/universes/intel_universe.txt"))
    ap.add_argument(
        "--include",
        nargs="*",
        default=[],
        help="Always include these tickers (e.g. SPY BIL BTC-USD).",
    )
    args = ap.parse_args()

    b = _read_json(args.bundle)
    ex = b.get("extracted") or {}
    by_cls = ex.get("tickers_by_asset_class") or {}

    tickers: Set[str] = set()
    if args.asset_class in {"stocks", "both"}:
        tickers |= {str(t).strip().upper() for t in (by_cls.get("stock") or [])}
    if args.asset_class in {"crypto", "both"}:
        tickers |= {str(t).strip().upper() for t in (by_cls.get("crypto") or [])}

    for t in args.include or []:
        if str(t).strip():
            tickers.add(str(t).strip().upper().lstrip("$"))

    out = sorted(tickers)
    _write_tickers(args.out, out)
    print(f"✅ Wrote {args.out} ({len(out)} tickers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

