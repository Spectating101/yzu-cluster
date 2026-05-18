from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.price_panel_clean_per_coin import (
    _safe_filename,
    export_price_panel_by_coin,
    export_price_panel_readable_single,
)


def test_safe_filename_normalizes_unsafe_chars():
    assert _safe_filename("btc/usd") == "btc_usd"
    assert _safe_filename("  .:.  ") == "unknown_coin"


def test_export_price_panel_by_coin_writes_csv_files(tmp_path: Path):
    panel = tmp_path / "price_panel_clean.csv"
    pd.DataFrame(
        [
            {"date": "2026-01-01", "bitcoin": 100.0, "ethereum": 50.0},
            {"date": "2026-01-02", "bitcoin": 101.0, "ethereum": None},
            {"date": "2026-01-03", "bitcoin": None, "ethereum": 55.0},
        ]
    ).to_csv(panel, index=False)

    profiles = tmp_path / "coin_profiles_clean.csv"
    pd.DataFrame(
        [
            {"coingecko_id": "bitcoin", "symbol": "BTC", "name": "Bitcoin"},
            {"coingecko_id": "ethereum", "symbol": "ETH", "name": "Ethereum"},
        ]
    ).to_csv(profiles, index=False)

    out_dir = tmp_path / "per_coin"
    exported = export_price_panel_by_coin(
        panel_path=panel,
        out_dir=out_dir,
        profiles_path=profiles,
        export_format="csv",
    )

    assert exported == 2
    btc = pd.read_csv(out_dir / "bitcoin.csv")
    eth = pd.read_csv(out_dir / "ethereum.csv")

    assert list(btc.columns) == ["coingecko_id", "symbol", "name", "date", "price_usd"]
    assert btc["price_usd"].tolist() == [100.0, 101.0]
    assert eth["price_usd"].tolist() == [50.0, 55.0]


def test_export_price_panel_readable_single_writes_single_csv(tmp_path: Path):
    panel = tmp_path / "price_panel_clean.csv"
    pd.DataFrame(
        [
            {"date": "2026-01-01", "bitcoin": 100.0, "ethereum": 50.0},
            {"date": "2026-01-02", "bitcoin": 101.0, "ethereum": None},
            {"date": "2026-01-03", "bitcoin": None, "ethereum": 55.0},
        ]
    ).to_csv(panel, index=False)

    profiles = tmp_path / "coin_profiles_clean.csv"
    pd.DataFrame(
        [
            {"coingecko_id": "bitcoin", "symbol": "BTC", "name": "Bitcoin"},
            {"coingecko_id": "ethereum", "symbol": "ETH", "name": "Ethereum"},
        ]
    ).to_csv(profiles, index=False)

    out_dir = tmp_path / "single_file"
    n_coins, n_rows = export_price_panel_readable_single(
        panel_path=panel,
        out_dir=out_dir,
        profiles_path=profiles,
        export_format="csv",
    )

    assert n_coins == 2
    assert n_rows == 4

    out = pd.read_csv(out_dir / "price_panel_clean_readable_long.csv")
    assert list(out.columns) == ["coingecko_id", "symbol", "name", "date", "price_usd"]
    assert out["coingecko_id"].tolist() == ["bitcoin", "bitcoin", "ethereum", "ethereum"]
