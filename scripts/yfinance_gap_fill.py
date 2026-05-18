#!/usr/bin/env python3
"""
Fill the data gap in the price/volume panels using yfinance (free, no rate limits).

Uses yfinance batch download — fetches all coins in chunks of 100 tickers per call.
Much faster than CoinGecko free API (no per-coin rate limits).

Note: market cap is NOT available from yfinance; mcap_panel_wide.csv is left unchanged.

Usage:
  python3 scripts/yfinance_gap_fill.py
  python3 scripts/yfinance_gap_fill.py --start 2026-03-20 --end 2026-04-15
  python3 scripts/yfinance_gap_fill.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_EXP  = _REPO / "data_lake" / "crypto_pipeline" / "exports"

PRICE_PANEL  = _EXP / "price_panel_clean.csv"
VOL_PANEL    = _EXP / "volume_panel_wide.csv"
PROFILES_CSV = _EXP / "coin_profiles_clean.csv"


def _require(pkg: str):
    try:
        return __import__(pkg)
    except ImportError:
        print(f"ERROR: {pkg} required.  pip install {pkg}", file=sys.stderr)
        raise SystemExit(1)


def build_ticker_map(pd) -> dict[str, str]:
    """Returns {yfinance_ticker: coingecko_id}, e.g. {'BTC-USD': 'bitcoin'}.

    When multiple coins share the same symbol (e.g. 11 coins called 'BTC'),
    we pick the one with the lowest CoinGecko rank (most well-known coin).
    Coins without a rank are treated as rank=999999.
    """
    cols = ["coingecko_id", "symbol", "rank"]
    profiles = pd.read_csv(PROFILES_CSV, usecols=cols)
    profiles = profiles.dropna(subset=["coingecko_id", "symbol"])
    profiles["rank"] = pd.to_numeric(profiles["rank"], errors="coerce").fillna(999999)
    profiles["symbol_upper"] = profiles["symbol"].str.upper().str.strip()

    # For each symbol, keep only the row with the lowest rank
    best = profiles.sort_values("rank").drop_duplicates(subset="symbol_upper", keep="first")

    result: dict[str, str] = {}
    for row in best.itertuples(index=False):
        sym = row.symbol_upper
        if sym:
            result[f"{sym}-USD"] = str(row.coingecko_id)
    return result


def fetch_batch(tickers: list[str], start: str, end: str, yf, pd) -> pd.DataFrame:
    """Batch-download OHLCV for a list of yfinance tickers. Returns wide DataFrame."""
    raw = yf.download(
        tickers,
        start=start,
        end=end,
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=True,
    )
    if raw is None or raw.empty:
        return pd.DataFrame()
    return raw


def run(start_date: date, end_date: date, dry_run: bool = False):
    pd = _require("pandas")
    yf = _require("yfinance")

    # Load panels
    print("Loading panels...", flush=True)
    price_df = pd.read_csv(PRICE_PANEL, low_memory=False)
    price_df["date"] = pd.to_datetime(price_df["date"]).dt.date
    price_df = price_df.set_index("date")

    vol_df = pd.read_csv(VOL_PANEL, low_memory=False)
    vol_df["date"] = pd.to_datetime(vol_df["date"]).dt.date
    vol_df = vol_df.set_index("date")

    panel_last = price_df.index.max()
    print(f"Panel last date : {panel_last}", flush=True)
    print(f"Fill range      : {start_date} → {end_date}", flush=True)

    if dry_run:
        print("DRY RUN — no changes made.", flush=True)
        return

    # Ticker map
    ticker_map = build_ticker_map(pd)   # {YF_TICKER: coingecko_id}
    panel_coins = set(price_df.columns)

    # Only fetch tickers whose coingecko_id is in the price panel
    relevant = {t: cid for t, cid in ticker_map.items() if cid in panel_coins}
    tickers   = list(relevant.keys())
    print(f"Tickers to fetch: {len(tickers)} (mapped from {len(panel_coins)} panel coins)", flush=True)

    # Batch fetch in chunks of 100
    chunk_size = 100
    new_price:  dict[date, dict[str, float]] = {}
    new_volume: dict[date, dict[str, float]] = {}
    skipped = 0

    start_str = start_date.isoformat()
    # yfinance end is exclusive, so add 1 day
    end_str   = (end_date + timedelta(days=1)).isoformat()

    for chunk_start in range(0, len(tickers), chunk_size):
        chunk = tickers[chunk_start : chunk_start + chunk_size]
        chunk_num = chunk_start // chunk_size + 1
        total_chunks = -(-len(tickers) // chunk_size)
        print(f"  Batch {chunk_num}/{total_chunks}: {len(chunk)} tickers...", flush=True)

        raw = fetch_batch(chunk, start_str, end_str, yf, pd)
        if raw.empty:
            print(f"    No data returned.", flush=True)
            skipped += len(chunk)
            continue

        # raw has MultiIndex columns: (field, ticker) when >1 ticker
        # or flat columns (field) when =1 ticker
        if isinstance(raw.columns, pd.MultiIndex):
            close_all  = raw["Close"]  if "Close"  in raw.columns.get_level_values(0) else None
            volume_all = raw["Volume"] if "Volume" in raw.columns.get_level_values(0) else None
        else:
            # Single-ticker case — wrap in a DataFrame with ticker as column name
            close_all  = raw[["Close"]].rename(columns={"Close":  chunk[0]}) if "Close"  in raw.columns else None
            volume_all = raw[["Volume"]].rename(columns={"Volume": chunk[0]}) if "Volume" in raw.columns else None

        if close_all is None:
            skipped += len(chunk)
            continue

        close_all.index  = pd.to_datetime(close_all.index).date

        for yf_ticker in chunk:
            cid = relevant[yf_ticker]
            if yf_ticker not in close_all.columns:
                skipped += 1
                continue
            prices = close_all[yf_ticker].dropna()
            for d, v in prices.items():
                if start_date <= d <= end_date:
                    new_price.setdefault(d, {})[cid] = float(v)

        if volume_all is not None:
            volume_all.index = pd.to_datetime(volume_all.index).date
            for yf_ticker in chunk:
                cid = relevant[yf_ticker]
                if yf_ticker not in volume_all.columns:
                    continue
                vols = volume_all[yf_ticker].dropna()
                for d, v in vols.items():
                    if start_date <= d <= end_date:
                        new_volume.setdefault(d, {})[cid] = float(v)

    print(f"\nCollected {len(new_price)} new dates, {skipped} tickers had no data.", flush=True)

    if not new_price:
        print("No new data collected — panels unchanged.", flush=True)
        return

    # Append to panels
    def _append(panel: pd.DataFrame, new_data: dict) -> pd.DataFrame:
        new_rows = pd.DataFrame.from_dict(new_data, orient="index")
        new_rows.index = list(new_rows.index)
        new_rows = new_rows.reindex(columns=panel.columns)
        # Drop existing rows for these dates, then append fresh data (no duplicates)
        panel = panel[~panel.index.isin(new_rows.index)]
        return pd.concat([panel, new_rows]).sort_index()

    print("Updating price panel...", flush=True)
    price_df = _append(price_df, new_price)

    print("Updating volume panel...", flush=True)
    vol_df = _append(vol_df, new_volume)

    def _save(df: pd.DataFrame, path: Path):
        df.index = df.index.astype(str)
        df.index.name = "date"
        df.to_csv(path)
        print(f"  Saved {path.name}  ({len(df)} rows)", flush=True)

    _save(price_df, PRICE_PANEL)
    _save(vol_df,   VOL_PANEL)

    print(f"\nGap fill complete. New rows added: {len(new_price)}", flush=True)
    print("Note: mcap_panel_wide.csv was NOT updated (yfinance has no market cap data).", flush=True)


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default=None, help="Start date YYYY-MM-DD (default: day after panel's last date)")
    ap.add_argument("--end",   default=None, help="End date YYYY-MM-DD (default: yesterday)")
    ap.add_argument("--dry-run", action="store_true")
    return ap


def main() -> int:
    args = _parser().parse_args()

    pd = _require("pandas")
    panel = pd.read_csv(PRICE_PANEL, usecols=["date"])
    panel["date"] = pd.to_datetime(panel["date"]).dt.date
    panel_last = panel["date"].max()

    start = date.fromisoformat(args.start) if args.start else panel_last + timedelta(days=1)
    end   = date.fromisoformat(args.end)   if args.end   else date.today() - timedelta(days=1)

    if start > end:
        print(f"Nothing to do: start {start} > end {end}", flush=True)
        return 0

    run(start, end, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
