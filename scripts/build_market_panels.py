#!/usr/bin/env python3
"""
Build yfinance tidy panels for non-US markets (via US-listed proxies + key local tickers).

Outputs the same tidy schema used everywhere else:
  Instrument, Date, Price_Close, Volume

This script is just a convenience wrapper around `scripts/fetch_yfinance_tidy_panel.py`.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Dict, List


_ROOT = Path(__file__).resolve().parents[2]


def _run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(_ROOT))


def _write_tickers(path: Path, tickers: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for t in tickers:
        t = t.strip()
        if not t:
            continue
        lines.append(t)
    path.write_text("\n".join(lines) + "\n")


def _preset(name: str) -> List[str]:
    # Keep these conservative and highly likely to exist on Yahoo.
    base = ["BIL", "TLT", "GLD"]
    if name == "taiwan":
        # US-listed Taiwan exposure + major ADR; include BTC/ETH optional diversifiers.
        return ["EWT", "TSM", *base, "BTC-USD", "ETH-USD"]
    if name == "vietnam":
        return ["VNM", *base, "BTC-USD", "ETH-USD"]
    if name == "indonesia":
        return ["EIDO", *base, "BTC-USD", "ETH-USD"]
    raise SystemExit(f"Unknown preset: {name}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build yfinance tidy panels for selected markets.")
    ap.add_argument("--market", choices=["taiwan", "vietnam", "indonesia", "all"], default="all")
    ap.add_argument("--period", default="10y")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--batch-size", type=int, default=2)
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/data_lake/markets"))
    ap.add_argument("--tickers-dir", type=Path, default=Path("Sharpe-Renaissance/config/markets"))
    args = ap.parse_args()

    markets = ["taiwan", "vietnam", "indonesia"] if args.market == "all" else [args.market]
    for m in markets:
        tickers = _preset(m)
        tickers_file = _ROOT / args.tickers_dir / f"{m}.tickers.txt"
        _write_tickers(tickers_file, tickers)

        out_path = _ROOT / args.out_dir / f"{m}_{args.period}.csv"
        _run(
            [
                sys.executable,
                str(_ROOT / "Sharpe-Renaissance/scripts/fetch_yfinance_tidy_panel.py"),
                "--tickers-file",
                str(tickers_file),
                "--period",
                str(args.period),
                "--interval",
                str(args.interval),
                "--batch-size",
                str(int(args.batch_size)),
                "--out",
                str(out_path),
            ]
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

