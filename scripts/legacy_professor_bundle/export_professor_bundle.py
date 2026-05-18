#!/usr/bin/env python3
"""
Export professor bundle — three deliverables in one zip.

Outputs (in Sharpe-Renaissance/Sharpe-Renaissance/output/):
  professor_crypto_panel.csv      — all coins, long format (id/name/date/currency/price/mcap/vol)
  professor_crypto_top50.xlsx     — top-50 coins by volume, one sheet each + INDEX tab
  per_coin/bitcoin.csv            — one CSV per coin, exact Ethereum.csv format (1062 files)
  professor_crypto_bundle.zip     — all of the above zipped for sending

Column format matches professor's Ethereum.csv exactly:
  id, name, date, currency, current_price, market_cap, total_volume
  Date format: YYYY/M/D  (no zero-padding, matching professor's script)
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parent
_EXPORTS = _REPO / "data_lake" / "crypto_pipeline" / "exports"
_OUT = _HERE / "output"

PRICE_PANEL  = _EXPORTS / "price_panel_clean.csv"
MCAP_PANEL   = _EXPORTS / "mcap_panel_wide.csv"
VOL_PANEL    = _EXPORTS / "volume_panel_wide.csv"
PROFILES_CSV  = _EXPORTS / "coin_profiles_clean.csv"
ANALYTICS_CSV = _EXPORTS / "coin_analytics_clean.csv"

FULL_CSV_NAME   = "professor_crypto_panel.csv"
TOP50_XLSX_NAME = "professor_crypto_top50.xlsx"
PER_COIN_DIR    = "per_coin"
BUNDLE_ZIP_NAME = "professor_crypto_bundle.zip"

TOP_N = 50
# Coins with suspiciously inflated volume (data artefacts) — exclude from top-N ranking
_VOLUME_OUTLIERS = {"switcheo", "airswap", "allbridge-bridged-sol-near-protocol", "aave-usdc-v1", "aave-link-v1"}


def _require_pandas():
    try:
        import pandas as pd
        return pd
    except ImportError:
        print("ERROR: pandas required.  pip install pandas", file=sys.stderr)
        raise SystemExit(1)


def _require_openpyxl():
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        print("ERROR: openpyxl required.  pip install openpyxl", file=sys.stderr)
        raise SystemExit(1)


def _load_wide(path: Path, pd):
    """Load a wide panel CSV; return DataFrame with 'date' as first column."""
    df = pd.read_csv(path, low_memory=False)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df


def _format_date(dt_series, pd):
    """Convert datetime64 series to YYYY/M/D strings (no zero-padding), matching professor format."""
    return dt_series.apply(
        lambda d: f"{d.year}/{d.month}/{d.day}" if pd.notna(d) else ""
    )


def build_long_panel(pd) -> "pd.DataFrame":
    """Merge price + mcap + volume into professor's long format."""
    print("Loading price panel...", flush=True)
    price = _load_wide(PRICE_PANEL, pd)
    print("Loading market cap panel...", flush=True)
    mcap  = _load_wide(MCAP_PANEL, pd)
    print("Loading volume panel...", flush=True)
    vol   = _load_wide(VOL_PANEL, pd)

    # Coins we have prices for
    coins = [c for c in price.columns if c != "date"]
    mcap_coins  = set(mcap.columns) - {"date"}
    vol_coins   = set(vol.columns) - {"date"}

    # Load name map
    name_map: dict[str, str] = {}
    if PROFILES_CSV.exists():
        prof = pd.read_csv(PROFILES_CSV, usecols=["coingecko_id", "name"])
        for row in prof.itertuples(index=False):
            if pd.notna(row.coingecko_id):
                name_map[str(row.coingecko_id)] = str(row.name) if pd.notna(row.name) else ""

    print(f"Building long panel for {len(coins)} coins...", flush=True)

    chunks: list = []
    for i, coin in enumerate(coins, 1):
        # Price series
        p = price[["date", coin]].rename(columns={coin: "current_price"})
        p = p.dropna(subset=["current_price"])

        if p.empty:
            continue

        # Market cap (optional)
        if coin in mcap_coins:
            m = mcap[["date", coin]].rename(columns={coin: "market_cap"})
            p = p.merge(m, on="date", how="left")
        else:
            p["market_cap"] = float("nan")

        # Volume (optional)
        if coin in vol_coins:
            v = vol[["date", coin]].rename(columns={coin: "total_volume"})
            p = p.merge(v, on="date", how="left")
        else:
            p["total_volume"] = float("nan")

        p.insert(0, "id", coin)
        p.insert(1, "name", name_map.get(coin, ""))
        p.insert(3, "currency", "usd")
        p["date"] = _format_date(p["date"], pd)
        p = p[["id", "name", "date", "currency", "current_price", "market_cap", "total_volume"]]

        chunks.append(p)

        if i % 100 == 0 or i == len(coins):
            print(f"  {i}/{len(coins)} coins processed", flush=True)

    return pd.concat(chunks, ignore_index=True)


def select_top_n(pd, n: int, restrict_to: set[str] | None = None) -> list[str]:
    """Return top-N coin IDs ranked by avg daily volume (from analytics), excluding outliers.

    restrict_to: if provided, only consider coins in this set (e.g. price panel coins).
    """
    if not ANALYTICS_CSV.exists():
        return []
    analytics = pd.read_csv(ANALYTICS_CSV, usecols=["coingecko_id", "avg_daily_volume_usd"])
    analytics = analytics[~analytics["coingecko_id"].isin(_VOLUME_OUTLIERS)]
    analytics = analytics.dropna(subset=["avg_daily_volume_usd"])
    if restrict_to is not None:
        analytics = analytics[analytics["coingecko_id"].isin(restrict_to)]
    ranked = analytics.sort_values("avg_daily_volume_usd", ascending=False)
    return list(ranked["coingecko_id"].head(n))


def export_full_csv(long_df, out_path: Path):
    print(f"Writing full CSV -> {out_path} ({len(long_df):,} rows)...", flush=True)
    long_df.to_csv(out_path, index=False)
    print(f"  Done. Size: {out_path.stat().st_size / 1e6:.1f} MB", flush=True)


def export_top50_excel(long_df, top_ids: list[str], out_path: Path, pd):
    print(f"Writing top-{len(top_ids)} Excel -> {out_path}...", flush=True)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        # Index sheet
        index_rows = []
        for rank, coin_id in enumerate(top_ids, 1):
            subset = long_df[long_df["id"] == coin_id]
            name = subset["name"].iloc[0] if not subset.empty else ""
            n_rows = len(subset)
            avg_vol  = subset["total_volume"].mean()
            avg_mcap = subset["market_cap"].mean()
            index_rows.append({
                "rank": rank,
                "id": coin_id,
                "name": name,
                "data_rows": n_rows,
                "avg_daily_volume_usd": round(avg_vol)  if pd.notna(avg_vol)  else "",
                "avg_market_cap_usd":   round(avg_mcap) if pd.notna(avg_mcap) else "",
                "sheet_name": _sheet_name(rank, coin_id),
            })
        pd.DataFrame(index_rows).to_excel(writer, sheet_name="INDEX", index=False)

        # One sheet per coin
        for rank, coin_id in enumerate(top_ids, 1):
            subset = long_df[long_df["id"] == coin_id].copy()
            sheet = _sheet_name(rank, coin_id)
            subset.to_excel(writer, sheet_name=sheet, index=False)
            if rank % 10 == 0:
                print(f"  {rank}/{len(top_ids)} sheets written", flush=True)

    print(f"  Done. Size: {out_path.stat().st_size / 1e6:.1f} MB", flush=True)


def _sheet_name(rank: int, coin_id: str) -> str:
    """Excel sheet names: max 31 chars."""
    raw = f"{rank:02d}_{coin_id}"
    return raw[:31]


def export_per_coin(long_df, out_dir: Path, pd) -> int:
    """Write one CSV per coin in the professor's exact Ethereum.csv format."""
    import re

    def _safe(name: str) -> str:
        s = re.sub(r"[^A-Za-z0-9._-]+", "_", name.strip()).strip("._")
        return s or "unknown"

    out_dir.mkdir(parents=True, exist_ok=True)
    coins = long_df["id"].unique()
    for i, coin_id in enumerate(coins, 1):
        subset = long_df[long_df["id"] == coin_id].copy()
        subset.to_csv(out_dir / f"{_safe(coin_id)}.csv", index=False)
        if i % 200 == 0 or i == len(coins):
            print(f"  per-coin: {i}/{len(coins)}", flush=True)
    return len(coins)


def create_bundle_zip(files: list[Path], per_coin_dir: Path, zip_path: Path):
    print(f"Creating zip -> {zip_path}...", flush=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)
        if per_coin_dir.exists():
            coin_files = sorted(per_coin_dir.glob("*.csv"))
            for cf in coin_files:
                zf.write(cf, f"per_coin/{cf.name}")
            print(f"  Added {len(coin_files)} per-coin CSV files", flush=True)
    print(f"  Done. Size: {zip_path.stat().st_size / 1e6:.1f} MB", flush=True)


def main() -> int:
    pd = _require_pandas()
    _require_openpyxl()

    _OUT.mkdir(parents=True, exist_ok=True)

    long_df = build_long_panel(pd)
    print(f"\nTotal rows: {len(long_df):,}, coins: {long_df['id'].nunique()}", flush=True)

    full_csv_path   = _OUT / FULL_CSV_NAME
    top50_xlsx_path = _OUT / TOP50_XLSX_NAME
    bundle_zip_path = _OUT / BUNDLE_ZIP_NAME

    export_full_csv(long_df, full_csv_path)

    present = set(long_df["id"].unique())
    top_ids = select_top_n(pd, TOP_N, restrict_to=present)
    export_top50_excel(long_df, top_ids, top50_xlsx_path, pd)

    per_coin_path = _OUT / PER_COIN_DIR
    print(f"Writing per-coin CSVs -> {per_coin_path}/...", flush=True)
    n_coins = export_per_coin(long_df, per_coin_path, pd)
    print(f"  Done. {n_coins} files.", flush=True)

    create_bundle_zip([full_csv_path, top50_xlsx_path], per_coin_path, bundle_zip_path)

    print(f"""
Done! Output in {_OUT}/
  {FULL_CSV_NAME:<40} — all {long_df['id'].nunique()} coins, long format
  {TOP50_XLSX_NAME:<40} — top {TOP_N} coins, one sheet each (INDEX + data)
  {"per_coin/":<40} — {n_coins} individual CSVs (professor's exact format)
  {BUNDLE_ZIP_NAME:<40} — everything zipped for sending
""", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
