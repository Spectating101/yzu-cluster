#!/usr/bin/env python3
"""
Build a plug-and-play crypto dataset bundle from clean export panels.

Output folder (default):
  data_lake/crypto_pipeline/exports/plug_and_play_bundle/

Files:
  crypto_panel_full.csv       # Canonical long dataset (API/Ethereum-compatible schema)
  crypto_top50.xlsx           # Top-N coins (one sheet per coin + INDEX)
  ethereum.csv                # Single-coin sample matching professor format
  data_dictionary.csv         # Field descriptions
  manifest.json               # Row counts, date range, generation metadata
  crypto_plugplay_bundle.zip  # All files zipped
"""

from __future__ import annotations

import argparse
import csv
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_EXPORTS = _REPO / "data_lake" / "crypto_pipeline" / "exports"

PRICE_PANEL = _EXPORTS / "price_panel_clean.csv"
MCAP_PANEL = _EXPORTS / "mcap_panel_wide.csv"
VOLUME_PANEL = _EXPORTS / "volume_panel_wide.csv"
PROFILES_CSV = _EXPORTS / "coin_profiles_clean.csv"
ANALYTICS_CSV = _EXPORTS / "coin_analytics_clean.csv"

DEFAULT_OUT = _EXPORTS / "plug_and_play_bundle"
CSV_NAME = "crypto_panel_full.csv"
TOP_XLSX_NAME = "crypto_top50.xlsx"
ETH_NAME = "ethereum.csv"
DICT_NAME = "data_dictionary.csv"
MANIFEST_NAME = "manifest.json"
ZIP_NAME = "crypto_plugplay_bundle.zip"


def _require_pandas():
    import pandas as pd

    return pd


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_date(dt_series, pd):
    return dt_series.apply(lambda d: f"{d.year}/{d.month}/{d.day}" if pd.notna(d) else "")


def _sheet_name(rank: int, coin_id: str) -> str:
    return f"{rank:02d}_{coin_id}"[:31]


def _load_wide(path: Path, pd):
    df = pd.read_csv(path, low_memory=False)
    if "date" not in df.columns:
        raise ValueError(f"{path} missing required 'date' column.")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df


def _load_name_map(pd) -> dict[str, str]:
    if not PROFILES_CSV.exists():
        return {}
    prof = pd.read_csv(PROFILES_CSV, usecols=["coingecko_id", "name"])
    out: dict[str, str] = {}
    for row in prof.itertuples(index=False):
        if pd.notna(row.coingecko_id):
            out[str(row.coingecko_id)] = str(row.name) if pd.notna(row.name) else ""
    return out


def _select_top_ids(pd, n: int, present_ids: set[str]) -> list[str]:
    if not ANALYTICS_CSV.exists() or n <= 0:
        return []
    analytics = pd.read_csv(ANALYTICS_CSV, usecols=["coingecko_id", "avg_daily_volume_usd"])
    analytics = analytics.dropna(subset=["avg_daily_volume_usd"])
    analytics = analytics[analytics["coingecko_id"].isin(present_ids)]
    ranked = analytics.sort_values("avg_daily_volume_usd", ascending=False)
    return list(ranked["coingecko_id"].head(n))


def _coin_frame(coin: str, price, mcap, volume, name_map: dict[str, str], pd):
    frame = price[["date", coin]].rename(columns={coin: "current_price"})
    frame = frame.dropna(subset=["current_price"]).copy()
    if frame.empty:
        return frame

    if coin in mcap.columns:
        m = mcap[["date", coin]].rename(columns={coin: "market_cap"})
        frame = frame.merge(m, on="date", how="left")
    else:
        frame["market_cap"] = float("nan")

    if coin in volume.columns:
        v = volume[["date", coin]].rename(columns={coin: "total_volume"})
        frame = frame.merge(v, on="date", how="left")
    else:
        frame["total_volume"] = float("nan")

    frame.insert(0, "id", coin)
    frame.insert(1, "name", name_map.get(coin, ""))
    frame.insert(3, "currency", "usd")
    frame["date"] = _format_date(frame["date"], pd)
    return frame[["id", "name", "date", "currency", "current_price", "market_cap", "total_volume"]]


def _write_dictionary(path: Path):
    rows = [
        ("column", "description"),
        ("id", "CoinGecko coin ID"),
        ("name", "Coin name"),
        ("date", "Observation date (YYYY/M/D)"),
        ("currency", "Quote currency (usd)"),
        ("current_price", "Daily closing price in USD"),
        ("market_cap", "Daily market capitalization in USD"),
        ("total_volume", "Daily total trading volume in USD"),
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)


def _write_top_excel(path: Path, top_frames: dict[str, object], top_ids: list[str], pd):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        index_rows = []
        for rank, coin_id in enumerate(top_ids, 1):
            df = top_frames.get(coin_id, pd.DataFrame())
            name = df["name"].iloc[0] if not df.empty else ""
            avg_vol = df["total_volume"].mean() if not df.empty else None
            avg_mcap = df["market_cap"].mean() if not df.empty else None
            index_rows.append(
                {
                    "rank": rank,
                    "id": coin_id,
                    "name": name,
                    "rows": len(df),
                    "avg_daily_volume_usd": round(avg_vol) if pd.notna(avg_vol) else "",
                    "avg_market_cap_usd": round(avg_mcap) if pd.notna(avg_mcap) else "",
                    "sheet_name": _sheet_name(rank, coin_id),
                }
            )
        pd.DataFrame(index_rows).to_excel(writer, sheet_name="INDEX", index=False)

        for rank, coin_id in enumerate(top_ids, 1):
            top_frames[coin_id].to_excel(writer, sheet_name=_sheet_name(rank, coin_id), index=False)


def _write_zip(path: Path, files: list[Path]):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, arcname=f.name)


def build_bundle(out_dir: Path, top_n: int) -> dict:
    pd = _require_pandas()
    out_dir.mkdir(parents=True, exist_ok=True)

    price = _load_wide(PRICE_PANEL, pd)
    mcap = _load_wide(MCAP_PANEL, pd)
    volume = _load_wide(VOLUME_PANEL, pd)
    name_map = _load_name_map(pd)

    coins = [c for c in price.columns if c != "date"]
    top_ids = _select_top_ids(pd, top_n, set(coins))

    csv_path = out_dir / CSV_NAME
    eth_path = out_dir / ETH_NAME
    top_path = out_dir / TOP_XLSX_NAME
    dict_path = out_dir / DICT_NAME
    manifest_path = out_dir / MANIFEST_NAME
    zip_path = out_dir / ZIP_NAME

    top_frames: dict[str, object] = {}
    eth_df = None
    total_rows = 0
    min_date = None
    max_date = None

    first = True
    for i, coin in enumerate(coins, 1):
        frame = _coin_frame(coin, price, mcap, volume, name_map, pd)
        if frame.empty:
            continue

        if first:
            frame.to_csv(csv_path, index=False)
            first = False
        else:
            frame.to_csv(csv_path, mode="a", index=False, header=False)

        total_rows += len(frame)
        coin_min = frame["date"].min()
        coin_max = frame["date"].max()
        min_date = coin_min if min_date is None else min(min_date, coin_min)
        max_date = coin_max if max_date is None else max(max_date, coin_max)

        if coin in top_ids:
            top_frames[coin] = frame.copy()
        if coin == "ethereum":
            eth_df = frame.copy()

        if i % 100 == 0 or i == len(coins):
            print(f"[bundle] {i}/{len(coins)} coins processed", flush=True)

    if eth_df is not None and not eth_df.empty:
        eth_df.to_csv(eth_path, index=False)

    if top_ids:
        _write_top_excel(top_path, top_frames, top_ids, pd)

    _write_dictionary(dict_path)

    files_for_zip = [csv_path, dict_path]
    if eth_path.exists():
        files_for_zip.append(eth_path)
    if top_path.exists():
        files_for_zip.append(top_path)

    manifest = {
        "generated_at_utc": _utc_now(),
        "source_files": {
            "price_panel_clean": str(PRICE_PANEL),
            "mcap_panel_wide": str(MCAP_PANEL),
            "volume_panel_wide": str(VOLUME_PANEL),
            "coin_profiles_clean": str(PROFILES_CSV),
            "coin_analytics_clean": str(ANALYTICS_CSV),
        },
        "output_files": [f.name for f in files_for_zip] + [ZIP_NAME],
        "panel_summary": {
            "coins": len(coins),
            "rows": total_rows,
            "date_min": min_date,
            "date_max": max_date,
        },
        "top_n_excel": top_n,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    files_for_zip.append(manifest_path)

    _write_zip(zip_path, files_for_zip)
    return manifest


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build a plug-and-play crypto dataset bundle.")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--top-n", type=int, default=50, help="Top-N coins for Excel workbook.")
    return ap


def main() -> int:
    args = _parser().parse_args()
    manifest = build_bundle(args.out_dir, args.top_n)
    print(
        f"✅ Bundle ready: {args.out_dir} (coins={manifest['panel_summary']['coins']}, rows={manifest['panel_summary']['rows']})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
