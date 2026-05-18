from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.research.transaction_costs import (
    CostConfig,
    cost_adjust_ledger,
    estimate_trade_cost,
    spread_bps,
)


def test_spread_bps_known_tickers():
    assert spread_bps("BIL") == 1.0
    assert spread_bps("SPY") == 1.5
    assert spread_bps("BTC-USD") == 25.0


def test_spread_bps_unknown_falls_back_to_class():
    # Crypto pattern: ends in -USD
    assert spread_bps("XRP-USD") == 25.0
    # Cash ETF in fallback table
    assert spread_bps("SHY") == 1.5
    # Unknown -> "unknown" class default
    assert spread_bps("ZZZZ") == 8.0


def test_spread_bps_override():
    assert spread_bps("SPY", overrides={"SPY": 0.5}) == 0.5


def test_estimate_trade_cost_zero_notional():
    c = estimate_trade_cost(
        ticker="SPY", notional=0.0, price=400.0, sigma_daily=0.01,
        adv_dollars=1e9, config=CostConfig(),
    )
    assert c.total_cost == 0.0


def test_estimate_trade_cost_spread_dominates_for_small_orders():
    """Small trade in liquid name → cost ≈ spread, impact ~0."""
    c = estimate_trade_cost(
        ticker="SPY", notional=10_000.0, price=400.0, sigma_daily=0.01,
        adv_dollars=10e9, config=CostConfig(impact_coefficient=1.0),
    )
    # spread = 10_000 * 1.5 bps = $1.50
    assert c.spread_cost == pytest.approx(1.50, rel=1e-9)
    # impact = 1.0 * 0.01 * sqrt(10_000/10e9) * 10_000 = 1.0 * 0.01 * 1e-3 * 10_000 = $0.10
    assert c.impact_cost < 0.5
    assert c.total_cost == pytest.approx(c.spread_cost + c.impact_cost, abs=1e-9)


def test_estimate_trade_cost_impact_dominates_for_large_orders_in_thin_assets():
    """Large trade in thin asset → impact dominates spread."""
    c = estimate_trade_cost(
        ticker="ZZZZ", notional=1_000_000.0, price=10.0, sigma_daily=0.05,
        adv_dollars=500_000.0, config=CostConfig(impact_coefficient=1.0),
    )
    # Spread bps for unknown = 8 bps → $800. Impact: 1.0 * 0.05 * sqrt(2.0) * 1e6
    # = 0.05 * 1.414 * 1e6 = $70_700. Should dominate.
    assert c.impact_cost > c.spread_cost
    assert c.impact_cost > 10_000.0


def test_estimate_trade_cost_impact_coef_zero_disables_impact():
    c = estimate_trade_cost(
        ticker="ZZZZ", notional=1_000_000.0, price=10.0, sigma_daily=0.05,
        adv_dollars=500_000.0, config=CostConfig(impact_coefficient=0.0),
    )
    assert c.impact_cost == 0.0
    assert c.spread_cost > 0.0


def test_estimate_trade_cost_min_charge_floor():
    cfg = CostConfig(min_charge_bps=50.0, impact_coefficient=0.0)
    c = estimate_trade_cost(
        ticker="SPY", notional=10_000.0, price=400.0, sigma_daily=0.01,
        adv_dollars=10e9, config=cfg,
    )
    # spread = $1.50; floor = 10_000 * 50bps = $50 → floor wins
    assert c.total_cost == pytest.approx(50.0, abs=1e-9)


@pytest.fixture
def synthetic_world(tmp_path: Path):
    """Build a 30-day ledger with one rebalance to drive cost_adjust_ledger."""
    dates = pd.date_range("2026-01-02", periods=20, freq="B")
    # Panel: SPY and BTC-USD with simple price walks + volumes
    spy_px = 400 + np.cumsum(np.full(20, 0.5))
    btc_px = 50000 + np.cumsum(np.full(20, 100.0))
    panel = pd.concat(
        [
            pd.DataFrame({"Instrument": "SPY", "Date": dates, "Price_Close": spy_px,
                          "Volume": 1e8}),
            pd.DataFrame({"Instrument": "BTC-USD", "Date": dates, "Price_Close": btc_px,
                          "Volume": 1e6}),
        ]
    )
    panel_csv = tmp_path / "panel.csv"
    panel.to_csv(panel_csv, index=False)

    # Two signals: first all SPY, then 60/40 SPY/BTC (forces a rebalance)
    sig1 = {"strategy": "t", "as_of_month": "2025-12-31", "weights": {"SPY": 1.0}}
    sig2 = {"strategy": "t", "as_of_month": "2026-01-09", "weights": {"SPY": 0.6, "BTC-USD": 0.4}}
    p1 = tmp_path / "sig1.json"
    p2 = tmp_path / "sig2.json"
    p1.write_text(json.dumps(sig1))
    p2.write_text(json.dumps(sig2))

    # Ledger: first 5 rows use sig1, then switches to sig2 with new as_of.
    # daily_return values are arbitrary positive walks (test focuses on cost
    # mechanics, not return accuracy).
    daily_ret = 0.001  # 10 bps/day
    eq = [10000.0]
    for _ in range(len(dates) - 1):
        eq.append(eq[-1] * (1 + daily_ret))
    as_of = ["2025-12-31"] * 5 + ["2026-01-09"] * 15
    ledger = pd.DataFrame(
        {
            "date": dates,
            "as_of": as_of,
            "equity": eq,
            "daily_return": [0.0] + [daily_ret] * 19,
            "drawdown": 0.0,
            "n_holdings": 2,
        }
    )
    ledger_csv = tmp_path / "ledger.csv"
    ledger.to_csv(ledger_csv, index=False)
    return ledger_csv, panel_csv, p1, p2


def test_cost_adjust_ledger_detects_rebalances(synthetic_world):
    ledger_csv, panel_csv, p1, p2 = synthetic_world
    res = cost_adjust_ledger(
        ledger_csv=ledger_csv, panel_csv=panel_csv,
        signal_paths=[p1, p2],
    )
    # Two as_of values → two rebalance dates
    assert res.summary["n_rebalances"] == 2
    # Net total return must be <= gross (costs eat returns)
    assert res.summary["net_total_return"] <= res.summary["gross_total_return"]
    assert res.summary["cost_drag"] >= 0.0
    # The second rebalance moves 40% to BTC-USD: 40% turnover → real cost
    second = res.per_rebalance_costs.iloc[-1]
    assert second["turnover_weight"] == pytest.approx(0.8, abs=1e-9)  # 0.4 sell SPY + 0.4 buy BTC
    assert second["total_cost_$"] > 0


def test_cost_adjust_ledger_no_rebalance_no_cost(tmp_path: Path):
    """Ledger with a single as_of value: cost is only from the initial allocation."""
    dates = pd.date_range("2026-01-02", periods=10, freq="B")
    panel = pd.DataFrame(
        {"Instrument": "SPY", "Date": dates, "Price_Close": 400.0, "Volume": 1e8}
    )
    panel_csv = tmp_path / "panel.csv"
    panel.to_csv(panel_csv, index=False)
    sig = {"strategy": "t", "as_of_month": "2025-12-31", "weights": {"SPY": 1.0}}
    sig_p = tmp_path / "sig.json"
    sig_p.write_text(json.dumps(sig))
    ledger = pd.DataFrame(
        {
            "date": dates,
            "as_of": "2025-12-31",
            "equity": 10000.0 * (1.001) ** np.arange(10),
            "daily_return": [0.0] + [0.001] * 9,
            "drawdown": 0.0,
            "n_holdings": 1,
        }
    )
    ledger_csv = tmp_path / "ledger.csv"
    ledger.to_csv(ledger_csv, index=False)

    res = cost_adjust_ledger(
        ledger_csv=ledger_csv, panel_csv=panel_csv, signal_paths=[sig_p]
    )
    # Only one rebalance (the initial fill) — and SPY is tight-spread
    assert res.summary["n_rebalances"] == 1
    assert res.summary["cost_drag"] > 0  # initial fill still costs something
    # The cost drag from a single ~1.5bps fill of $10k is ~$1.50 / $10k = 1.5bps
    assert 0 < res.summary["cost_drag"] < 0.001  # < 10bps total
