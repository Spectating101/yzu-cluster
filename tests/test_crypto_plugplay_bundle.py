from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.crypto_plugplay_bundle import _coin_frame, _format_date, _sheet_name


def test_format_date_matches_professor_style():
    s = pd.to_datetime(pd.Series(["2020-01-01", "2020-12-31"]))
    out = _format_date(s, pd)
    assert out.tolist() == ["2020/1/1", "2020/12/31"]


def test_sheet_name_is_excel_safe_length():
    name = _sheet_name(7, "this-is-a-very-long-coin-id-name")
    assert len(name) <= 31
    assert name.startswith("07_")


def test_coin_frame_emits_expected_columns_and_rows():
    price = pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"]),
            "ethereum": [100.0, None, 105.0],
        }
    )
    mcap = pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"]),
            "ethereum": [1000.0, 1001.0, 1002.0],
        }
    )
    vol = pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"]),
            "ethereum": [10.0, 11.0, 12.0],
        }
    )
    out = _coin_frame("ethereum", price, mcap, vol, {"ethereum": "Ethereum"}, pd)
    assert list(out.columns) == [
        "id",
        "name",
        "date",
        "currency",
        "current_price",
        "market_cap",
        "total_volume",
    ]
    assert out["id"].unique().tolist() == ["ethereum"]
    assert out["name"].unique().tolist() == ["Ethereum"]
    assert out["current_price"].tolist() == [100.0, 105.0]
