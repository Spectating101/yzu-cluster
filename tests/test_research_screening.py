from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.research.screening import (
    ScreenConfig,
    screen_universe,
    suggest_allocation,
)


@pytest.fixture
def synthetic_panel(tmp_path: Path):
    """3 tickers, 4 years daily — A strong uptrend, B sideways, C downtrend."""
    rng = np.random.default_rng(0)
    n = 1000
    dates = pd.date_range("2022-01-01", periods=n, freq="D")
    a = 100 * np.cumprod(1 + rng.normal(0.0015, 0.012, n))   # ~46% annualized
    b = 100 * np.cumprod(1 + rng.normal(0.0000, 0.012, n))   # ~0
    c = 100 * np.cumprod(1 + rng.normal(-0.001, 0.012, n))   # negative
    rows = []
    for tkr, series in [("A", a), ("B", b), ("C", c)]:
        for d, px in zip(dates, series):
            rows.append({"Instrument": tkr, "Date": d, "Price_Close": px, "Volume": 1e6})
    p = tmp_path / "panel.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return p


def test_screen_universe_ranks_uptrend_first(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel)
    assert list(res.table.index)[0] == "A"
    assert list(res.table.index)[-1] == "C"
    assert res.table.loc["A", "composite_score"] > res.table.loc["B", "composite_score"]
    assert res.table.loc["B", "composite_score"] > res.table.loc["C", "composite_score"]


def test_screen_universe_respects_universe_filter(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel, universe=["A", "B"])
    assert set(res.table.index) == {"A", "B"}
    assert "C" not in res.table.index


def test_screen_universe_rejects_unknown_tickers(synthetic_panel):
    with pytest.raises(ValueError, match="no tickers"):
        screen_universe(panel_csv=synthetic_panel, universe=["XXX", "YYY"])


def test_suggest_allocation_balanced(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel)
    # Use a permissive per-name cap so balanced isn't bound by it; cash ticker
    # is intentionally OUTSIDE the screened universe (it's pinned by the floor).
    weights = suggest_allocation(res, top_n=2, profile="balanced",
                                  max_single_weight=1.0,
                                  cash_floor=0.10, cash_ticker="CASH")
    assert weights.sum() == pytest.approx(1.0, abs=1e-9)
    assert weights["CASH"] == pytest.approx(0.10, abs=1e-9)
    # The 90% risky sleeve splits evenly between the top 2 → ~45% each
    risky = weights.drop("CASH")
    assert all(0.40 < w < 0.50 for w in risky)


def test_suggest_allocation_growth_score_weighted(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel)
    w = suggest_allocation(res, top_n=2, profile="growth",
                            cash_floor=0.0, cash_ticker="Z")  # no cash
    # Top-scoring (A) must outweigh the second-place one
    sorted_w = w.sort_values(ascending=False)
    assert sorted_w.iloc[0] > sorted_w.iloc[1]


def test_suggest_allocation_respects_max_single_weight(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel)
    w = suggest_allocation(res, top_n=2, profile="growth",
                            max_single_weight=0.30, cash_floor=0.10, cash_ticker="Z")
    non_cash = w.drop("Z") if "Z" in w.index else w
    # No name (except cash) can exceed the per-name cap
    assert all(non_cash <= 0.30 + 1e-9)


def test_suggest_allocation_rejects_bad_profile(synthetic_panel):
    res = screen_universe(panel_csv=synthetic_panel)
    with pytest.raises(ValueError, match="unknown profile"):
        suggest_allocation(res, top_n=2, profile="lunatic")
