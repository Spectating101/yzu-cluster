#!/usr/bin/env python3
"""
Create readable exports from price_panel_clean.csv.

Modes:
1) single-file      (default): one consolidated long-format file/workbook
2) per-coin-files            : one file per coin
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
DEFAULT_PANEL = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "price_panel_clean.csv"
DEFAULT_PROFILES = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_profiles_clean.csv"
DEFAULT_OUT = _REPO / "data_lake" / "crypto_pipeline" / "exports"
DEFAULT_PER_COIN_DIR = DEFAULT_OUT / "price_panel_clean_by_coin"
READABLE_CSV_NAME = "price_panel_clean_readable_long.csv"
READABLE_XLSX_NAME = "price_panel_clean_readable_long.xlsx"
EXCEL_MAX_ROWS = 1_000_000


def _require_pandas():
    try:
        import pandas as pd
        return pd
    except ImportError:
        print("ERROR: pandas is required. pip install pandas", file=sys.stderr)
        raise SystemExit(1)


def _safe_filename(raw: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", raw.strip())
    safe = safe.strip("._")
    return safe or "unknown_coin"


def _load_profile_map(profiles_path: Path, pd) -> dict[str, tuple[str, str]]:
    if not profiles_path.exists():
        return {}
    cols = ["coingecko_id", "symbol", "name"]
    prof = pd.read_csv(profiles_path, usecols=cols)
    prof = prof.dropna(subset=["coingecko_id"])
    out: dict[str, tuple[str, str]] = {}
    for row in prof.itertuples(index=False):
        out[str(row.coingecko_id)] = (
            "" if row.symbol is None else str(row.symbol),
            "" if row.name is None else str(row.name),
        )
    return out


def _load_profile_frame(profiles_path: Path, pd):
    if not profiles_path.exists():
        return pd.DataFrame(columns=["coingecko_id", "symbol", "name"])
    cols = ["coingecko_id", "symbol", "name"]
    prof = pd.read_csv(profiles_path, usecols=cols)
    return prof.dropna(subset=["coingecko_id"]).copy()


def export_price_panel_readable_single(
    panel_path: Path,
    out_dir: Path,
    profiles_path: Path,
    export_format: str = "xlsx",
) -> tuple[int, int]:
    pd = _require_pandas()
    panel = pd.read_csv(panel_path)
    if "date" not in panel.columns:
        raise ValueError("Input panel must contain a 'date' column.")

    panel["date"] = pd.to_datetime(panel["date"], errors="coerce")
    long_df = panel.melt(
        id_vars=["date"],
        var_name="coingecko_id",
        value_name="price_usd",
    )
    long_df = long_df.dropna(subset=["date", "price_usd"]).copy()
    long_df["date"] = long_df["date"].dt.date.astype(str)

    profiles = _load_profile_frame(profiles_path, pd)
    if not profiles.empty:
        long_df = long_df.merge(profiles, on="coingecko_id", how="left")
    else:
        long_df["symbol"] = ""
        long_df["name"] = ""

    long_df = long_df[["coingecko_id", "symbol", "name", "date", "price_usd"]]
    long_df = long_df.sort_values(["coingecko_id", "date"]).reset_index(drop=True)

    out_dir.mkdir(parents=True, exist_ok=True)

    if export_format in {"csv", "both"}:
        long_df.to_csv(out_dir / READABLE_CSV_NAME, index=False)

    if export_format in {"xlsx", "both"}:
        xlsx_path = out_dir / READABLE_XLSX_NAME
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            sheet_idx = 1
            for start in range(0, len(long_df), EXCEL_MAX_ROWS):
                chunk = long_df.iloc[start : start + EXCEL_MAX_ROWS]
                chunk.to_excel(writer, sheet_name=f"prices_{sheet_idx}", index=False)
                sheet_idx += 1

    return int(long_df["coingecko_id"].nunique()), int(len(long_df))


def export_price_panel_by_coin(
    panel_path: Path,
    out_dir: Path,
    profiles_path: Path,
    export_format: str = "xlsx",
    limit: int = 0,
) -> int:
    pd = _require_pandas()
    panel = pd.read_csv(panel_path)
    if "date" not in panel.columns:
        raise ValueError("Input panel must contain a 'date' column.")

    panel["date"] = pd.to_datetime(panel["date"], errors="coerce")
    coins = [c for c in panel.columns if c != "date"]
    if limit > 0:
        coins = coins[:limit]

    profile_map = _load_profile_map(profiles_path, pd)
    out_dir.mkdir(parents=True, exist_ok=True)

    for i, coin_id in enumerate(coins, start=1):
        per_coin = panel[["date", coin_id]].rename(columns={coin_id: "price_usd"})
        per_coin = per_coin.dropna(subset=["date", "price_usd"]).copy()
        symbol, name = profile_map.get(coin_id, ("", ""))
        per_coin.insert(0, "coingecko_id", coin_id)
        per_coin.insert(1, "symbol", symbol)
        per_coin.insert(2, "name", name)
        per_coin["date"] = per_coin["date"].dt.date.astype(str)

        stem = _safe_filename(coin_id)
        if export_format in {"csv", "both"}:
            per_coin.to_csv(out_dir / f"{stem}.csv", index=False)
        if export_format in {"xlsx", "both"}:
            per_coin.to_excel(out_dir / f"{stem}.xlsx", index=False, sheet_name="prices")

        if i % 100 == 0 or i == len(coins):
            print(f"[export] {i}/{len(coins)} coins", flush=True)

    return len(coins)


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Create readable exports from price_panel_clean.csv."
    )
    ap.add_argument("--panel", type=Path, default=DEFAULT_PANEL)
    ap.add_argument("--profiles", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--format",
        dest="export_format",
        choices=["csv", "xlsx", "both"],
        default="xlsx",
        help="Output format.",
    )
    ap.add_argument(
        "--mode",
        choices=["single-file", "per-coin-files"],
        default="single-file",
        help="single-file = one consolidated long-format output; per-coin-files = one file per coin.",
    )
    ap.add_argument(
        "--per-coin-dir",
        type=Path,
        default=DEFAULT_PER_COIN_DIR,
        help="Output folder for --mode per-coin-files.",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional coin limit for quick test runs (0 = all).",
    )
    return ap


def main() -> int:
    args = _parser().parse_args()
    if not args.panel.exists():
        print(f"ERROR: panel not found: {args.panel}", file=sys.stderr)
        return 1

    if args.mode == "single-file":
        n_coins, n_rows = export_price_panel_readable_single(
            panel_path=args.panel,
            out_dir=args.out_dir,
            profiles_path=args.profiles,
            export_format=args.export_format,
        )
        outputs = []
        if args.export_format in {"csv", "both"}:
            outputs.append(str(args.out_dir / READABLE_CSV_NAME))
        if args.export_format in {"xlsx", "both"}:
            outputs.append(str(args.out_dir / READABLE_XLSX_NAME))
        print(
            f"✅ Exported readable panel: coins={n_coins}, rows={n_rows}, files={', '.join(outputs)}",
            flush=True,
        )
    else:
        exported = export_price_panel_by_coin(
            panel_path=args.panel,
            out_dir=args.per_coin_dir,
            profiles_path=args.profiles,
            export_format=args.export_format,
            limit=args.limit,
        )
        print(f"✅ Exported {exported} per-coin files to {args.per_coin_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
