#!/usr/bin/env python3
"""
Convert Refinitiv "wide" CSV (Date index, columns like TICKER.FIELD) into the
tidy panel schema used across Sharpe-Renaissance backtests:

  Instrument, Date, Price_Close, Volume

This is an OFFLINE converter (no Refinitiv API calls).
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd


def _parse_tickers_file(path: Path) -> List[str]:
    tickers: List[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.append(line.split()[0].strip())
    return sorted(dict.fromkeys([t for t in tickers if t]))


def _norm_field(value: str) -> str:
    return "".join(ch.lower() for ch in str(value) if ch.isalnum())


def _select_col_pairs(columns: List[Tuple[str, str]], ticker: str, field: str) -> Optional[Tuple[str, str]]:
    want_t = str(ticker)
    want_f = _norm_field(field)
    exact = [c for c in columns if str(c[0]) == want_t and _norm_field(c[1]) == want_f]
    return exact[0] if exact else None


def _detect_multiheader(wide_csv: Path) -> bool:
    # If the second line looks like descriptive fields (e.g. "Price Close"), we treat as multi-header.
    try:
        lines = wide_csv.read_text(errors="ignore").splitlines()
        if len(lines) < 2:
            return False
        return "Price Close" in lines[1] or "Volume" in lines[1] or "TR." in lines[1]
    except Exception:
        return False


def wide_to_tidy(
    wide_csv: Path,
    *,
    tickers: List[str],
    price_field: str = "Price Close",
    volume_field: str = "Volume",
    chunksize: int = 20000,
) -> pd.DataFrame:
    """
    Stream the wide CSV in chunks and produce a tidy panel for the requested tickers.
    """
    if not tickers:
        raise ValueError("No tickers provided")

    frames: List[pd.DataFrame] = []

    if _detect_multiheader(wide_csv):
        # Two-row header: row0=tickers, row1=fields. We synthesize a flat header then stream chunks.
        hdr = pd.read_csv(wide_csv, header=None, nrows=3)
        if hdr.shape[1] < 2:
            raise ValueError("Wide CSV must include a Date index column plus data columns")

        tick_row = ["" if pd.isna(x) else str(x) for x in hdr.iloc[0].tolist()]
        field_row = ["" if pd.isna(x) else str(x) for x in hdr.iloc[1].tolist()]
        skiprows = 2
        if hdr.shape[0] >= 3:
            first = hdr.iloc[2, 0]
            if isinstance(first, str) and first.strip().lower() == "date":
                skiprows = 3
        names: List[str] = ["Date"]
        for i in range(1, len(tick_row)):
            t = tick_row[i].strip()
            f = field_row[i].strip()
            names.append(f"{t}.{f}" if t else f"col{i}")

        # Determine which synthesized columns to read.
        all_cols = names
        col_map3: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
        for t in tickers:
            px = f"{t}.{price_field}"
            vol = f"{t}.{volume_field}"
            col_map3[t] = (px if px in all_cols else None, vol if vol in all_cols else None)

        usecols = ["Date"]
        for _, (px, vol) in col_map3.items():
            if px:
                usecols.append(px)
            if vol:
                usecols.append(vol)

        for chunk in pd.read_csv(
            wide_csv,
            header=None,
            skiprows=skiprows,
            names=names,
            usecols=usecols,
            chunksize=chunksize,
            low_memory=False,
        ):
            dt = pd.to_datetime(chunk["Date"], errors="coerce")
            keep = dt.notna()
            if not keep.any():
                continue
            dt = dt[keep]

            out_rows: List[pd.DataFrame] = []
            for t, (px, vol) in col_map3.items():
                if not px or px not in chunk.columns:
                    continue
                price = pd.to_numeric(chunk.loc[keep, px], errors="coerce")
                if vol and vol in chunk.columns:
                    volume = pd.to_numeric(chunk.loc[keep, vol], errors="coerce")
                else:
                    volume = pd.Series([pd.NA] * len(price), index=price.index)

                sub = pd.DataFrame(
                    {
                        "Instrument": t,
                        "Date": dt.values,
                        "Price_Close": price.values,
                        "Volume": volume.values,
                    }
                ).dropna(subset=["Price_Close"])
                if not sub.empty:
                    out_rows.append(sub)
            if out_rows:
                frames.append(pd.concat(out_rows, ignore_index=True))
    else:
        # Single-row header: columns like TICKER.FIELD
        header = pd.read_csv(wide_csv, nrows=0)
        if len(header.columns) < 2:
            raise ValueError("Wide CSV must include a Date index column plus data columns")

        date_col = header.columns[0]
        cols = list(header.columns)

        def _select_flat(ticker: str, field: str) -> Optional[str]:
            want = f"{ticker}.{field}"
            if want in cols:
                return want
            starts = [c for c in cols if str(c).startswith(want)]
            return sorted(starts)[0] if starts else None

        col_map2: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
        for t in tickers:
            px = _select_flat(t, price_field)
            vol = _select_flat(t, volume_field)
            col_map2[t] = (px, vol)

        usecols = [date_col]
        for _, (px, vol) in col_map2.items():
            if px:
                usecols.append(px)
            if vol:
                usecols.append(vol)
        usecols = sorted(dict.fromkeys(usecols))

        for chunk in pd.read_csv(wide_csv, usecols=usecols, chunksize=chunksize):
            chunk = chunk.rename(columns={date_col: "Date"})
            chunk["Date"] = pd.to_datetime(chunk["Date"], errors="coerce")
            chunk = chunk.dropna(subset=["Date"])
            if chunk.empty:
                continue

            out_rows = []
            for t, (px, vol) in col_map2.items():
                if not px or px not in chunk.columns:
                    continue
                sub = pd.DataFrame(
                    {
                        "Instrument": t,
                        "Date": chunk["Date"],
                        "Price_Close": pd.to_numeric(chunk[px], errors="coerce"),
                        "Volume": pd.to_numeric(chunk[vol], errors="coerce") if vol and vol in chunk.columns else pd.NA,
                    }
                ).dropna(subset=["Price_Close"])
                if not sub.empty:
                    out_rows.append(sub)
            if out_rows:
                frames.append(pd.concat(out_rows, ignore_index=True))

    if not frames:
        return pd.DataFrame(columns=["Instrument", "Date", "Price_Close", "Volume"])
    out = pd.concat(frames, ignore_index=True)
    out = out.sort_values(["Instrument", "Date"]).reset_index(drop=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert Refinitiv wide CSV to tidy panel.")
    ap.add_argument("--wide-csv", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--tickers", nargs="*", default=[])
    ap.add_argument("--tickers-file", type=Path, default=None)
    ap.add_argument("--price-field", type=str, default="Price Close")
    ap.add_argument("--volume-field", type=str, default="Volume")
    ap.add_argument("--chunksize", type=int, default=20000)
    args = ap.parse_args()

    tickers = list(args.tickers)
    if args.tickers_file is not None and args.tickers_file.exists():
        tickers.extend(_parse_tickers_file(args.tickers_file))
    tickers = sorted(dict.fromkeys([t for t in tickers if t]))
    if not tickers:
        print("No tickers provided. Use --tickers or --tickers-file.")
        return 2

    df = wide_to_tidy(
        args.wide_csv,
        tickers=tickers,
        price_field=str(args.price_field),
        volume_field=str(args.volume_field),
        chunksize=int(args.chunksize),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"✅ wrote {len(df)} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
