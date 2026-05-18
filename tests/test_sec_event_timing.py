from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.sec_event_alpha_backtest import _available_trading_date


TRADING_INDEX = pd.DatetimeIndex(["2026-01-08", "2026-01-09", "2026-01-12"])


def test_premarket_filing_is_tradeable_same_session():
    out = _available_trading_date(
        filing_date=pd.Timestamp("2026-01-08"),
        acceptance_dt=pd.Timestamp("2026-01-08T13:00:00Z"),
        trading_index=TRADING_INDEX,
        event_timing_mode="strict_acceptance",
    )
    assert out == pd.Timestamp("2026-01-08")


def test_regular_hours_filing_waits_until_next_session():
    out = _available_trading_date(
        filing_date=pd.Timestamp("2026-01-08"),
        acceptance_dt=pd.Timestamp("2026-01-08T20:00:00Z"),
        trading_index=TRADING_INDEX,
        event_timing_mode="strict_acceptance",
    )
    assert out == pd.Timestamp("2026-01-09")


def test_missing_acceptance_time_uses_conservative_next_session():
    out = _available_trading_date(
        filing_date=pd.Timestamp("2026-01-08"),
        acceptance_dt=pd.NaT,
        trading_index=TRADING_INDEX,
        event_timing_mode="strict_acceptance",
    )
    assert out == pd.Timestamp("2026-01-09")


def test_legacy_mode_uses_same_filing_date():
    out = _available_trading_date(
        filing_date=pd.Timestamp("2026-01-08"),
        acceptance_dt=pd.Timestamp("2026-01-08T22:00:00Z"),
        trading_index=TRADING_INDEX,
        event_timing_mode="legacy_date",
    )
    assert out == pd.Timestamp("2026-01-08")
