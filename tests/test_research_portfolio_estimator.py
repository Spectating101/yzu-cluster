from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.research.portfolio_estimator import (
    EstimatorConfig,
    estimate_portfolio,
    estimate_summary,
)


@pytest.fixture
def synthetic_panel(tmp_path: Path):
    rng = np.random.default_rng(0)
    n = 252 * 6
    dates = pd.date_range("2020-01-01", periods=n, freq="D")
    spy = 100 * np.cumprod(1 + rng.normal(0.0005, 0.012, n))
    eem = 100 * np.cumprod(1 + rng.normal(0.0003, 0.018, n))
    bil = 100 * np.cumprod(1 + rng.normal(0.00005, 0.0005, n))
    rows = []
    for tkr, series in [("SPY", spy), ("EEM", eem), ("BIL", bil)]:
        for d, px in zip(dates, series):
            rows.append({"Instrument": tkr, "Date": d, "Price_Close": px})
    p = tmp_path / "panel.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return p


def test_estimate_portfolio_basic_shape(synthetic_panel):
    w = pd.Series({"SPY": 0.6, "EEM": 0.3, "BIL": 0.1})
    est = estimate_portfolio(weights=w, panel_csv=synthetic_panel)
    # Portfolio metrics are finite
    assert np.isfinite(est.portfolio_exp_return)
    assert np.isfinite(est.portfolio_vol)
    assert est.portfolio_vol > 0
    # Percentile order
    assert est.return_p05 < est.return_p50 < est.return_p95
    assert est.expected_max_dd_p05 < est.expected_max_dd_p50 < est.expected_max_dd_p95
    # Drawdown numbers are non-positive (they're losses)
    assert est.expected_max_dd_p50 <= 0
    # Weights renormalized to sum to 1
    assert est.weights.sum() == pytest.approx(1.0, abs=1e-9)


def test_estimate_portfolio_higher_eem_increases_vol(synthetic_panel):
    """A book tilted to higher-vol EEM should have higher portfolio vol than one tilted to BIL."""
    w_risky = pd.Series({"SPY": 0.5, "EEM": 0.5, "BIL": 0.0})
    w_safe = pd.Series({"SPY": 0.5, "EEM": 0.0, "BIL": 0.5})
    est_risky = estimate_portfolio(weights=w_risky, panel_csv=synthetic_panel)
    est_safe = estimate_portfolio(weights=w_safe, panel_csv=synthetic_panel)
    assert est_risky.portfolio_vol > est_safe.portfolio_vol
    # Risky book has worse (more negative) p05 drawdown
    assert est_risky.expected_max_dd_p05 < est_safe.expected_max_dd_p05


def test_estimate_portfolio_shrinkage_at_one_uses_capm(synthetic_panel):
    """With lambda=1 the expected return == CAPM-implied return (rf + β·premium)."""
    cfg = EstimatorConfig(shrinkage_lambda=1.0, equity_premium_annual=0.05,
                          risk_free_annual=0.03, market_proxy="SPY")
    w = pd.Series({"SPY": 1.0})
    est = estimate_portfolio(weights=w, panel_csv=synthetic_panel, config=cfg)
    # SPY's β to itself = 1 → CAPM gives 0.03 + 1*0.05 = 0.08
    assert est.per_ticker_exp_return["SPY"] == pytest.approx(0.08, abs=1e-9)


def test_estimate_portfolio_shrinkage_at_zero_uses_historical(synthetic_panel):
    cfg = EstimatorConfig(shrinkage_lambda=0.0)
    w = pd.Series({"SPY": 1.0})
    est = estimate_portfolio(weights=w, panel_csv=synthetic_panel, config=cfg)
    # historical_mean_ann recovered from data (~12% with μ=0.05% daily)
    assert 0.05 < est.per_ticker_exp_return["SPY"] < 0.30


def test_estimate_portfolio_rejects_empty_weights(synthetic_panel):
    with pytest.raises(ValueError, match="no weighted tickers"):
        estimate_portfolio(weights=pd.Series({"NONEXISTENT": 1.0}), panel_csv=synthetic_panel)


def test_estimate_portfolio_rejects_zero_sum_weights(synthetic_panel):
    with pytest.raises(ValueError, match="sum to zero"):
        estimate_portfolio(weights=pd.Series({"SPY": 0.0, "EEM": 0.0}), panel_csv=synthetic_panel)


def test_estimate_summary_serializable(synthetic_panel):
    import json
    w = pd.Series({"SPY": 0.5, "BIL": 0.5})
    est = estimate_portfolio(weights=w, panel_csv=synthetic_panel)
    s = estimate_summary(est)
    # Must round-trip JSON
    json.dumps(s, default=str)
    # Required sections present
    for key in ("portfolio", "weights", "per_ticker", "stress", "caveats"):
        assert key in s


def test_stress_scenarios_compute_when_data_available(synthetic_panel):
    """Panel only spans 2020-2026; 2020 COVID and 2022 should compute; older won't."""
    w = pd.Series({"SPY": 0.5, "EEM": 0.5})
    est = estimate_portfolio(weights=w, panel_csv=synthetic_panel)
    stress = est.stress
    assert "2020 COVID crash (Feb-Mar 2020)" in stress.index
    assert bool(stress.loc["2020 COVID crash (Feb-Mar 2020)", "available"])
    # 2008 is outside panel range → unavailable
    assert not bool(stress.loc["2008 GFC peak loss (Sep-Nov 2008)", "available"])
