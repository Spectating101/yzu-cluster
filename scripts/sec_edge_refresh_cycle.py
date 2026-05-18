#!/usr/bin/env python3
from __future__ import annotations

"""
Refresh SEC edge inputs, then run the strict SEC paper cycle.

This is the operational wrapper for the repo's primary edge track.
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List


SR_ROOT = Path(__file__).resolve().parents[1]


def _repo_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if path.is_absolute():
        return path.resolve()
    if path.parts and path.parts[0] == SR_ROOT.name:
        path = Path(*path.parts[1:]) if len(path.parts) > 1 else Path(".")
    return (SR_ROOT / path).resolve()


def _run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(SR_ROOT))


def main() -> int:
    ap = argparse.ArgumentParser(description="Refresh SEC data + run strict SEC paper cycle.")
    ap.add_argument("--tickers-file", type=Path, default=SR_ROOT / "config" / "tickers_sec_nasdaq100_plus_spy.txt")
    ap.add_argument("--mapping", type=Path, default=SR_ROOT / "data_lake" / "sec" / "company_tickers.json")
    ap.add_argument("--submissions-dir", type=Path, default=SR_ROOT / "data_lake" / "sec" / "submissions")
    ap.add_argument("--events-out", type=Path, default=SR_ROOT / "data_lake" / "sec" / "filing_events_nasdaq100.csv")
    ap.add_argument("--prices-out", type=Path, default=SR_ROOT / "data_lake" / "yfinance_nasdaq100_plus_spy_10y.csv")
    ap.add_argument("--paper-out-root", type=Path, default=SR_ROOT / "backtests" / "outputs" / "sec_edge_paper")
    ap.add_argument("--price-period", type=str, default="10y")
    ap.add_argument("--price-interval", type=str, default="1d")
    ap.add_argument("--price-batch-size", type=int, default=25)
    ap.add_argument("--sec-sleep-secs", type=float, default=0.25)
    ap.add_argument("--sec-stale-days", type=int, default=1)
    ap.add_argument(
        "--sec-user-agent",
        type=str,
        default="SharpeRenaissanceResearchBot/0.1 (research; contact: local)",
    )
    ap.add_argument("--skip-company-tickers", action="store_true")
    ap.add_argument("--skip-sec-refresh", action="store_true")
    ap.add_argument("--skip-price-refresh", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--allow-repeat-as-of", action="store_true")
    args, sec_cycle_args = ap.parse_known_args()

    tickers_file = _repo_path(args.tickers_file)
    mapping = _repo_path(args.mapping)
    submissions_dir = _repo_path(args.submissions_dir)
    events_out = _repo_path(args.events_out)
    prices_out = _repo_path(args.prices_out)
    paper_out_root = _repo_path(args.paper_out_root)

    if not bool(args.skip_company_tickers):
        _run(
            [
                sys.executable,
                str(SR_ROOT / "scripts" / "sec_fetch_company_tickers.py"),
                "--out",
                str(mapping),
                "--user-agent",
                str(args.sec_user_agent),
            ]
        )

    if not bool(args.skip_sec_refresh):
        _run(
            [
                sys.executable,
                str(SR_ROOT / "scripts" / "sec_fetch_submissions.py"),
                "--tickers-file",
                str(tickers_file),
                "--mapping",
                str(mapping),
                "--out-dir",
                str(submissions_dir),
                "--sleep-secs",
                str(float(args.sec_sleep_secs)),
                "--stale-days",
                str(int(args.sec_stale_days)),
                "--user-agent",
                str(args.sec_user_agent),
            ]
        )
        _run(
            [
                sys.executable,
                str(SR_ROOT / "scripts" / "sec_extract_filing_events.py"),
                "--submissions-dir",
                str(submissions_dir),
                "--out",
                str(events_out),
                "--forms",
                "8-K",
                "10-Q",
                "10-K",
            ]
        )

    if not bool(args.skip_price_refresh):
        _run(
            [
                sys.executable,
                str(SR_ROOT / "scripts" / "fetch_yfinance_tidy_panel.py"),
                "--tickers-file",
                str(tickers_file),
                "--period",
                str(args.price_period),
                "--interval",
                str(args.price_interval),
                "--out",
                str(prices_out),
                "--batch-size",
                str(int(args.price_batch_size)),
            ]
        )

    cmd = [
        sys.executable,
        str(SR_ROOT / "scripts" / "sec_edge_paper_cycle.py"),
        "--prices",
        str(prices_out),
        "--events",
        str(events_out),
        "--out-root",
        str(paper_out_root),
    ]
    if bool(args.execute):
        cmd.append("--execute")
    if bool(args.allow_repeat_as_of):
        cmd.append("--allow-repeat-as-of")
    cmd.extend(sec_cycle_args)
    _run(cmd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
