#!/usr/bin/env python3
"""
Build a tidy factor panel from the Refinitiv wide dump (offline).

Input:
  From-refinitiv/RESCUED_Full_Market_Data_20251215.csv
    - 2-row "wide" header: row0=ticker, row1=field, then (optionally) a third
      row that starts with "Date" before the data begins.

Output (CSV):
  Instrument, Date, Price_Close, Volume, Vol30, Vol360, Skew25, ShortInterest

Notes:
  - This is offline parsing; no Refinitiv API calls.
  - We intentionally only extract a small set of fields needed for
    cross-sectional signals.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd


def _parse_tickers_from_metadata(path: Path) -> List[str]:
    if not path.exists():
        return []
    df = pd.read_csv(path)
    for col in ["InstrumentTicker", "Instrument", "ticker", "Ticker"]:
        if col in df.columns:
            return sorted(dict.fromkeys([str(x).strip() for x in df[col].dropna().tolist() if str(x).strip()]))
    return []


def _normalize_field(value: str) -> str:
    return "".join(ch.lower() for ch in str(value) if ch.isalnum())


def _read_header(wide_csv: Path) -> tuple[list[str], int]:
    """
    Returns:
      names: synthesized flat column names (len = n_cols)
      skiprows: number of rows to skip before data
    """
    hdr = pd.read_csv(wide_csv, header=None, nrows=3)
    if hdr.shape[1] < 2:
        raise ValueError("Wide CSV must include a Date index column plus data columns")

    tick_row = ["" if pd.isna(x) else str(x).strip() for x in hdr.iloc[0].tolist()]
    field_row = ["" if pd.isna(x) else str(x).strip() for x in hdr.iloc[1].tolist()]

    skiprows = 2
    if hdr.shape[0] >= 3:
        first = hdr.iloc[2, 0]
        if isinstance(first, str) and first.strip().lower() == "date":
            skiprows = 3

    names = ["Date"]
    for i in range(1, len(tick_row)):
        t = tick_row[i]
        f = field_row[i]
        names.append(f"{t}.{f}" if t else f"col{i}")
    return names, skiprows


def _tickers_from_header(wide_csv: Path) -> List[str]:
    hdr = pd.read_csv(wide_csv, header=None, nrows=1)
    if hdr.empty:
        return []
    row = ["" if pd.isna(x) else str(x).strip() for x in hdr.iloc[0].tolist()]
    # Keep full ticker tokens, including dots, exactly as in the header (e.g. AAPL.OQ).
    tickers = [t for t in row[1:] if t and not t.startswith("col")]
    tickers = [t for t in tickers if not t.startswith(".")]  # drop .VIX etc by default
    return sorted(dict.fromkeys(tickers))


def _pick_col(names: list[str], ticker: str, field_variants: list[str]) -> Optional[str]:
    for f in field_variants:
        key = f"{ticker}.{f}"
        if key in names:
            return key
    # fallback: normalized match on suffix
    want = [_normalize_field(x) for x in field_variants]
    cands = [c for c in names if c.startswith(f"{ticker}.")]
    for c in cands:
        suffix = c.split(".", 1)[1]
        if _normalize_field(suffix) in want:
            return c
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Build tidy factor panel from Refinitiv wide dump.")
    ap.add_argument("--wide-csv", type=Path, required=True)
    ap.add_argument("--ticker-metadata", type=Path, default=Path("From-refinitiv/1_Ticker_Metadata (1).csv"))
    ap.add_argument("--out", type=Path, default=Path("data_lake/refinitiv_factor_panel.csv"))
    ap.add_argument("--max-tickers", type=int, default=300, help="Cap tickers for speed.")
    ap.add_argument("--chunksize", type=int, default=5000)
    args = ap.parse_args()

    tickers = _parse_tickers_from_metadata(args.ticker_metadata)
    tickers = [t for t in tickers if t and not t.startswith(".")]  # drop .VIX etc unless needed
    # Metadata may be partial; fall back to header tickers if metadata is tiny.
    if len(tickers) < 50:
        tickers = _tickers_from_header(args.wide_csv)
    if int(args.max_tickers) > 0:
        tickers = tickers[: int(args.max_tickers)]
    if not tickers:
        print("No tickers found from metadata.")
        return 2

    names, skiprows = _read_header(args.wide_csv)

    # Field variants observed in the dump header row1.
    price_fields = ["Price Close", "TR.PriceClose"]
    volume_fields = ["Volume", "TR.Volume"]
    vol30_fields = ["Volatility - 30 days", "TR.Volatility30D", "TR.VOLATILITY30D"]
    vol360_fields = ["TR.VOLATILITY360D", "Volatility - 360 days", "TR.Volatility360D"]
    put25_fields = ["TR.IMPVOLPUTDELTA25", "TR.ImpVolPutDelta25"]
    call25_fields = ["TR.IMPVOLDELTA25", "TR.ImpVolDelta25"]
    short_fields = ["TR.SHORTINTERESTRATIO", "TR.ShortInterestRatio"]

    colmap: Dict[str, Dict[str, Optional[str]]] = {}
    for t in tickers:
        colmap[t] = {
            "price": _pick_col(names, t, price_fields),
            "volume": _pick_col(names, t, volume_fields),
            "vol30": _pick_col(names, t, vol30_fields),
            "vol360": _pick_col(names, t, vol360_fields),
            "put25": _pick_col(names, t, put25_fields),
            "call25": _pick_col(names, t, call25_fields),
            "short": _pick_col(names, t, short_fields),
        }

    usecols = {"Date"}
    for m in colmap.values():
        for c in m.values():
            if c:
                usecols.add(c)
    usecols = sorted(usecols)

    frames: list[pd.DataFrame] = []
    for chunk in pd.read_csv(
        args.wide_csv,
        header=None,
        skiprows=skiprows,
        names=names,
        usecols=usecols,
        chunksize=int(args.chunksize),
        low_memory=False,
    ):
        dt = pd.to_datetime(chunk["Date"], errors="coerce")
        keep = dt.notna()
        if not keep.any():
            continue
        dt = dt[keep]

        out_rows: list[pd.DataFrame] = []
        for t, m in colmap.items():
            px_col = m["price"]
            if not px_col or px_col not in chunk.columns:
                continue
            px = pd.to_numeric(chunk.loc[keep, px_col], errors="coerce")
            if px.isna().all():
                continue

            vol = pd.to_numeric(chunk.loc[keep, m["volume"]], errors="coerce") if m["volume"] in chunk.columns else pd.NA
            v30 = pd.to_numeric(chunk.loc[keep, m["vol30"]], errors="coerce") if m["vol30"] in chunk.columns else pd.NA
            v360 = pd.to_numeric(chunk.loc[keep, m["vol360"]], errors="coerce") if m["vol360"] in chunk.columns else pd.NA
            put25 = pd.to_numeric(chunk.loc[keep, m["put25"]], errors="coerce") if m["put25"] in chunk.columns else pd.NA
            call25 = pd.to_numeric(chunk.loc[keep, m["call25"]], errors="coerce") if m["call25"] in chunk.columns else pd.NA
            short = pd.to_numeric(chunk.loc[keep, m["short"]], errors="coerce") if m["short"] in chunk.columns else pd.NA

            skew25 = (put25 - call25) if isinstance(put25, pd.Series) and isinstance(call25, pd.Series) else pd.NA

            sub = pd.DataFrame(
                {
                    "Instrument": t,
                    "Date": dt.values,
                    "Price_Close": px.values,
                    "Volume": vol.values if isinstance(vol, pd.Series) else vol,
                    "Vol30": v30.values if isinstance(v30, pd.Series) else v30,
                    "Vol360": v360.values if isinstance(v360, pd.Series) else v360,
                    "Skew25": skew25.values if isinstance(skew25, pd.Series) else skew25,
                    "ShortInterest": short.values if isinstance(short, pd.Series) else short,
                }
            ).dropna(subset=["Price_Close"])
            if not sub.empty:
                out_rows.append(sub)

        if out_rows:
            frames.append(pd.concat(out_rows, ignore_index=True))

    if not frames:
        print("No rows produced.")
        return 2

    out = pd.concat(frames, ignore_index=True)
    out = out.sort_values(["Instrument", "Date"]).reset_index(drop=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False)
    print(f"✅ wrote {len(out)} rows ({out['Instrument'].nunique()} tickers) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
