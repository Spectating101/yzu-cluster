#!/usr/bin/env python3
"""
Fetch a tidy daily panel from yfinance (network required).

Outputs a CSV in the same tidy schema used by the offline backtests:
  Instrument, Date, Price_Close, Volume

Example:
  python scripts/fetch_yfinance_tidy_panel.py --tickers BTC-USD ETH-USD SPY QQQ AAPL MSFT NVDA \\
    --period 5y --out data_lake/yfinance_panel.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def fetch_one(ticker: str, period: str, interval: str) -> pd.DataFrame:
    import yfinance as yf

    df = yf.download(ticker, period=period, interval=interval, auto_adjust=False, progress=False)
    if df is None or df.empty:
        return pd.DataFrame()

    # yfinance may return MultiIndex columns even for a single ticker.
    if isinstance(df.columns, pd.MultiIndex):
        try:
            if ticker in df.columns.get_level_values(-1):
                df = df.xs(ticker, axis=1, level=-1, drop_level=True)
            else:
                # Fall back to the first ticker level.
                df = df.xs(df.columns.get_level_values(-1)[0], axis=1, level=-1, drop_level=True)
        except Exception:
            # As a last resort, flatten the first level.
            df.columns = [c[0] for c in df.columns.to_list()]

    df = df.reset_index()
    date_col = "Date" if "Date" in df.columns else ("Datetime" if "Datetime" in df.columns else None)
    if date_col is None:
        return pd.DataFrame()

    close_col = "Close" if "Close" in df.columns else None
    if close_col is None:
        return pd.DataFrame()

    close_series = df[close_col]
    if isinstance(close_series, pd.DataFrame):
        close_series = close_series.iloc[:, 0]

    volume_series = df["Volume"] if "Volume" in df.columns else pd.Series([pd.NA] * len(df))
    if isinstance(volume_series, pd.DataFrame):
        volume_series = volume_series.iloc[:, 0]

    out = pd.DataFrame(
        {
            "Instrument": ticker,
            "Date": pd.to_datetime(df[date_col], errors="coerce"),
            "Price_Close": pd.to_numeric(close_series, errors="coerce"),
            "Volume": pd.to_numeric(volume_series, errors="coerce"),
        }
    ).dropna(subset=["Date", "Price_Close"])
    return out


def fetch_many(tickers: list[str], period: str, interval: str) -> pd.DataFrame:
    import yfinance as yf

    df = yf.download(
        tickers,
        period=period,
        interval=interval,
        auto_adjust=False,
        group_by="ticker",
        threads=True,
        progress=False,
    )
    if df is None or df.empty:
        return pd.DataFrame()

    frames: list[pd.DataFrame] = []
    if isinstance(df.columns, pd.MultiIndex):
        # Expected: (Field, Ticker) OR (Ticker, Field) depending on yfinance versions.
        lvl0 = [str(x) for x in df.columns.get_level_values(0)]
        lvl1 = [str(x) for x in df.columns.get_level_values(1)]
        ticker_first = any(t in set(lvl0) for t in tickers)
        for t in tickers:
            try:
                sub = df.xs(t, axis=1, level=0 if ticker_first else 1, drop_level=True)
            except Exception:
                continue
            if sub is None or sub.empty:
                continue
            sub = sub.reset_index()
            date_col = "Date" if "Date" in sub.columns else ("Datetime" if "Datetime" in sub.columns else None)
            if date_col is None or "Close" not in sub.columns:
                continue
            out = pd.DataFrame(
                {
                    "Instrument": t,
                    "Date": pd.to_datetime(sub[date_col], errors="coerce"),
                    "Price_Close": pd.to_numeric(sub["Close"], errors="coerce"),
                    "Volume": pd.to_numeric(sub["Volume"], errors="coerce") if "Volume" in sub.columns else pd.NA,
                }
            ).dropna(subset=["Date", "Price_Close"])
            if not out.empty:
                frames.append(out)
    else:
        # Single ticker as flat columns.
        if len(tickers) == 1:
            return fetch_one(tickers[0], period, interval)

    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch tidy panel from yfinance.")
    parser.add_argument("--tickers", nargs="*", default=[])
    parser.add_argument(
        "--tickers-file",
        type=Path,
        action="append",
        default=[],
        help="Optional newline-separated ticker list (can be provided multiple times)",
    )
    parser.add_argument("--period", default="5y")
    parser.add_argument("--interval", default="1d")
    parser.add_argument("--out", type=Path, default=Path("data_lake/yfinance_panel.csv"))
    parser.add_argument("--batch-size", type=int, default=1, help="Download tickers in batches (faster, uses more memory)")
    args = parser.parse_args()

    tickers = list(args.tickers)
    for file_path in args.tickers_file or []:
        if file_path is None or not file_path.exists():
            continue
        for raw in file_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            # Allow inline comments and extra columns in ticker files, e.g.:
            #   TQQQ  # 3x QQQ
            # Keep the first token before any comment marker.
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            ticker = line.split()[0].strip()
            if ticker:
                tickers.append(ticker)
    tickers = sorted(dict.fromkeys(tickers))
    if not tickers:
        print("No tickers provided. Use --tickers or --tickers-file.")
        return 1

    frames = []
    batch = int(max(1, args.batch_size))
    for i in range(0, len(tickers), batch):
        chunk = tickers[i : i + batch]
        if len(chunk) == 1:
            df = fetch_one(chunk[0], args.period, args.interval)
        else:
            df = fetch_many(chunk, args.period, args.interval)
        if df.empty:
            print(f"⚠️ No data for batch {i}-{i+len(chunk)-1}")
            continue
        frames.append(df)
        ok = sorted(df["Instrument"].unique().tolist())[:5]
        print(f"✅ batch {i}-{i+len(chunk)-1}: {len(df)} rows ({len(df['Instrument'].unique())} tickers, e.g. {ok})")

    if not frames:
        print("No data fetched.")
        return 1

    panel = pd.concat(frames, ignore_index=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    panel.to_csv(args.out, index=False)
    print(f"✅ Wrote {len(panel)} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
