#!/usr/bin/env python3
"""
Daily decision trading cycle (paper-only):
  1) Build/update a tidy price panel from a data provider (default: yfinance).
  2) Run the spy-beater paper bot to generate orders + update paper state.

This is designed for "decide tonight, trade tomorrow" workflows (EOD/daily bars),
not true intraday HFT.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from trading.data.providers.base import BarsRequest  # noqa: E402
from trading.data.providers.refinitiv_offline_provider import RefinitivOfflineProvider  # noqa: E402
from trading.data.providers.yfinance_provider import YFinanceProvider  # noqa: E402
from spy_beater_paper_bot import main as paper_bot_main  # noqa: E402


def _parse_tickers_file(path: Path) -> list[str]:
    tickers: list[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.append(line.split()[0].strip())
    return sorted(dict.fromkeys([t for t in tickers if t]))


def build_tidy_panel_from_bars(bars: pd.DataFrame) -> pd.DataFrame:
    bars = bars.copy()
    bars["Date"] = pd.to_datetime(bars["timestamp"], errors="coerce").dt.tz_localize(None)
    out = pd.DataFrame(
        {
            "Instrument": bars["symbol"].astype(str),
            "Date": bars["Date"],
            "Price_Close": pd.to_numeric(bars["close"], errors="coerce"),
            "Volume": pd.to_numeric(bars.get("volume"), errors="coerce") if "volume" in bars.columns else pd.NA,
        }
    ).dropna(subset=["Instrument", "Date", "Price_Close"])
    out = out.sort_values(["Instrument", "Date"]).reset_index(drop=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Daily decision cycle (paper-only).")
    ap.add_argument("--provider", choices=["yfinance", "refinitiv_offline"], default="yfinance")
    ap.add_argument("--tickers-file", type=Path, required=True)
    ap.add_argument("--panel-out", type=Path, default=Path("data_lake/daily_decision_panel.csv"))

    ap.add_argument("--refinitiv-panel", type=Path, default=Path("data_lake/refinitiv_sp500_daily_tidy.csv"))
    ap.add_argument("--interval", type=str, default="1d")
    ap.add_argument("--lookback-days", type=int, default=365 * 5)

    ap.add_argument("--strategy-config", type=Path, required=True, help="Strategy JSON (e.g. config/spy_beater_best.json).")
    ap.add_argument("--paper-state", type=Path, default=Path("backtests/outputs/spy_beater/paper_state.json"))
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater/daily_cycle"))
    args = ap.parse_args()

    tickers = _parse_tickers_file(args.tickers_file)
    if not tickers:
        print("No tickers parsed from file.")
        return 2

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=int(args.lookback_days))

    if args.provider == "yfinance":
        provider = YFinanceProvider()
    else:
        provider = RefinitivOfflineProvider(panel_csv=args.refinitiv_panel)

    bars = provider.fetch_bars(BarsRequest(symbols=tickers, start=start, end=end, interval=str(args.interval)))
    if bars.empty:
        print(f"No bars returned from provider={provider.name}")
        return 2

    panel = build_tidy_panel_from_bars(bars)
    args.panel_out.parent.mkdir(parents=True, exist_ok=True)
    panel.to_csv(args.panel_out, index=False)

    # Delegate to the paper bot for order generation/state updates.
    argv = [
        "spy_beater_paper_bot",
        "--panel",
        str(args.panel_out),
        "--config-json",
        str(args.strategy_config),
        "--state",
        str(args.paper_state),
        "--out-dir",
        str(args.out_dir),
    ]
    sys.argv = argv
    return int(paper_bot_main())


if __name__ == "__main__":
    raise SystemExit(main())
