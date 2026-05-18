from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.research.attribution import (
    SignalSnapshot,
    _active_signal_for,
    attribute,
    attribution_summary,
    brinson,
)


@pytest.fixture
def fake_world(tmp_path: Path):
    """A small synthetic ledger + panel + signal trio with known answers."""
    dates = pd.date_range("2026-01-02", periods=5, freq="B")  # 5 business days

    # Two instruments, known daily returns
    panel = pd.DataFrame(
        {
            "Instrument": ["A"] * 6 + ["B"] * 6,
            "Date": list(pd.date_range("2026-01-01", periods=6, freq="B")) * 2,
            "Price_Close": [100, 101, 102, 100, 105, 110, 50, 51, 50, 52, 51, 55],
        }
    )
    panel_csv = tmp_path / "panel.csv"
    panel.to_csv(panel_csv, index=False)

    # Signal: 60% A, 40% B starting 2026-01-01
    sig = {
        "strategy": "test",
        "as_of_month": "2025-12-31",
        "weights": {"A": 0.6, "B": 0.4},
    }
    sig_path = tmp_path / "sig.json"
    sig_path.write_text(json.dumps(sig))

    # Ledger: just need date + daily_return columns
    # Compute the "true" daily return as 0.6*r_A + 0.4*r_B
    px = panel.pivot(index="Date", columns="Instrument", values="Price_Close")
    px.index = pd.to_datetime(px.index)
    rets = px.pct_change().dropna()
    ledger_ret = 0.6 * rets["A"] + 0.4 * rets["B"]
    eq = (1 + ledger_ret).cumprod() * 10000
    ledger = pd.DataFrame(
        {
            "date": rets.index,
            "as_of": "2025-12-31",
            "equity": eq.values,
            "daily_return": ledger_ret.values,
            "drawdown": 0.0,
            "n_holdings": 2,
        }
    )
    ledger_csv = tmp_path / "ledger.csv"
    ledger.to_csv(ledger_csv, index=False)

    return ledger_csv, panel_csv, sig_path


def test_attribute_reconstructs_ledger_returns(fake_world):
    ledger_csv, panel_csv, sig_path = fake_world
    res = attribute(ledger_csv=ledger_csv, panel_csv=panel_csv, signal_paths=[sig_path])
    # Synthetic ledger return == 0.6*r_A + 0.4*r_B, attribution recovers exactly that
    assert res.explained_r_squared == pytest.approx(1.0, abs=1e-6)
    assert res.n_days == 5
    # Each ticker has nonzero contribution
    assert "A" in res.by_ticker_total
    assert "B" in res.by_ticker_total
    # Sum of by-ticker contributions equals sum of daily returns
    assert res.by_ticker_total.sum() == pytest.approx(res.daily_actual.sum(), abs=1e-9)


def test_attribute_picks_active_signal_by_date(tmp_path: Path):
    # Two signals: Jan signal weights all in A; Feb signal weights all in B
    panel = pd.DataFrame(
        {
            "Instrument": ["A"] * 4 + ["B"] * 4,
            "Date": list(pd.date_range("2026-01-29", periods=4, freq="D")) * 2,
            "Price_Close": [100, 101, 50, 51, 200, 202, 100, 99],
        }
    )
    panel_csv = tmp_path / "panel.csv"
    panel.to_csv(panel_csv, index=False)

    sig_jan = {"strategy": "t", "as_of_month": "2026-01-31", "weights": {"A": 1.0}}
    sig_feb = {"strategy": "t", "as_of_month": "2026-02-29", "weights": {"B": 1.0}}
    p1 = tmp_path / "sig_jan.json"
    p2 = tmp_path / "sig_feb.json"
    p1.write_text(json.dumps(sig_jan))
    p2.write_text(json.dumps(sig_feb))

    px = panel.pivot(index="Date", columns="Instrument", values="Price_Close")
    px.index = pd.to_datetime(px.index)
    rets = px.pct_change().dropna()

    # Build ledger with daily returns matching the signal-active rule:
    # 2026-01-30 uses sig_jan (only A signal exists <= 2026-01-30)
    # 2026-01-31 uses sig_jan (sig_jan as_of = 2026-01-31)
    # 2026-02-01 uses sig_jan (sig_feb as_of=2026-02-29 not yet <= date)
    # We just need *some* ledger with these dates; daily_return value isn't
    # checked in this test (we only assert the chosen signal).
    ledger = pd.DataFrame(
        {
            "date": rets.index,
            "as_of": "x",
            "equity": 10000.0,
            "daily_return": 0.0,
            "drawdown": 0.0,
            "n_holdings": 1,
        }
    )
    ledger_csv = tmp_path / "ledger.csv"
    ledger.to_csv(ledger_csv, index=False)

    res = attribute(ledger_csv=ledger_csv, panel_csv=panel_csv, signal_paths=[p1, p2])
    # All dates fall within sig_jan window (no date >= 2026-02-29 in panel)
    assert len(res.active_signals_used) == 1
    assert "sig_jan.json" in res.active_signals_used[0]


def test_active_signal_selector_prefers_latest_eligible():
    snaps = [
        SignalSnapshot(pd.Timestamp("2026-01-31"), "s1", {"A": 1.0}, "p1"),
        SignalSnapshot(pd.Timestamp("2026-02-28"), "s2", {"B": 1.0}, "p2"),
        SignalSnapshot(pd.Timestamp("2026-03-31"), "s3", {"C": 1.0}, "p3"),
    ]
    assert _active_signal_for(pd.Timestamp("2026-01-01"), snaps) is None
    assert _active_signal_for(pd.Timestamp("2026-01-31"), snaps).strategy == "s1"
    assert _active_signal_for(pd.Timestamp("2026-02-15"), snaps).strategy == "s1"
    assert _active_signal_for(pd.Timestamp("2026-04-01"), snaps).strategy == "s3"


def test_attribution_summary_shape(fake_world):
    ledger_csv, panel_csv, sig_path = fake_world
    res = attribute(ledger_csv=ledger_csv, panel_csv=panel_csv, signal_paths=[sig_path])
    s = attribution_summary(res)
    assert s["period"]["n_days"] == 5
    assert len(s["top_5_winners"]) <= 5
    assert len(s["top_5_losers"]) <= 5
    assert s["explained_r_squared"] is not None
    assert "A" in s["by_ticker_contribution_sum"]


def test_brinson_decomposes_to_total_active():
    pw = {"A": 0.6, "B": 0.4}
    bw = {"A": 0.5, "B": 0.5}
    r = {"A": 0.02, "B": -0.01}
    res = brinson(portfolio_weights=pw, benchmark_weights=bw, asset_returns=r)
    # When portfolio holds the same assets as benchmark, sel + inter == 0
    assert res.selection == pytest.approx(0.0)
    assert res.interaction == pytest.approx(0.0)
    # Allocation: tilt 10% toward A (which went +2%) and away from B (-1%) →
    # active alloc = 0.10 * 0.02 + (-0.10) * (-0.01) = 0.002 + 0.001 = 0.003
    assert res.allocation == pytest.approx(0.003, abs=1e-9)
    assert res.total_active == pytest.approx(0.003, abs=1e-9)


def test_brinson_with_distinct_returns():
    """If portfolio and benchmark hold same names but with different per-asset
    returns (e.g., sub-class selection inside a sector), selection turns on."""
    pw = {"A": 0.5}
    bw = {"A": 0.5}
    res = brinson(
        portfolio_weights=pw,
        benchmark_weights=bw,
        asset_returns={"A": 0.05},
        benchmark_returns_by_asset={"A": 0.02},
    )
    # Allocation = 0 (same weights), selection = 0.5*(0.05-0.02) = 0.015
    assert res.allocation == pytest.approx(0.0)
    assert res.selection == pytest.approx(0.015)
    assert res.interaction == pytest.approx(0.0)
