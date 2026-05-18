from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.research.factor_attribution import (
    load_factors_csv,
    regress_on_factors,
    regression_summary,
    strategy_monthly_returns_from_ledger,
)


@pytest.fixture
def fake_factors():
    """Synthetic 60-month FF5+Mom factor series with known properties."""
    rng = np.random.default_rng(42)
    n = 60
    dates = pd.date_range("2020-01-31", periods=n, freq="ME")
    mkt = rng.normal(0.005, 0.04, n)
    smb = rng.normal(0.001, 0.02, n)
    hml = rng.normal(0.001, 0.02, n)
    rmw = rng.normal(0.002, 0.015, n)
    cma = rng.normal(0.001, 0.015, n)
    mom = rng.normal(0.003, 0.03, n)
    rf = np.full(n, 0.002)  # 0.2%/month = ~2.4%/yr
    return pd.DataFrame(
        {"Mkt-RF": mkt, "SMB": smb, "HML": hml, "RMW": rmw, "CMA": cma, "RF": rf, "Mom": mom},
        index=dates,
    )


def test_regression_recovers_known_alpha_and_betas(fake_factors):
    """Build a strategy = α + 0.8·Mkt + 0.3·Mom + RF + noise. Check we recover α≈α0 and betas."""
    rng = np.random.default_rng(0)
    alpha_true = 0.005  # 50bps/month
    beta_mkt = 0.8
    beta_mom = 0.3
    rf = fake_factors["RF"].values
    noise = rng.normal(0, 0.005, len(fake_factors))
    strat = (
        rf
        + alpha_true
        + beta_mkt * fake_factors["Mkt-RF"].values
        + beta_mom * fake_factors["Mom"].values
        + noise
    )
    strat_s = pd.Series(strat, index=fake_factors.index)
    res = regress_on_factors(strat_s, fake_factors)
    # Alpha within 2 standard errors of truth
    assert abs(res.alpha_monthly - alpha_true) < 0.003
    # Market beta close to 0.8
    assert abs(res.factor_betas["Mkt-RF"] - beta_mkt) < 0.15
    # Momentum beta close to 0.3
    assert abs(res.factor_betas["Mom"] - beta_mom) < 0.15
    # Significant exposures
    assert abs(res.factor_tstats["Mkt-RF"]) > 5
    # R² high (signal much stronger than noise)
    assert res.r_squared > 0.7


def test_regression_no_alpha_when_strategy_is_just_factors(fake_factors):
    rng = np.random.default_rng(1)
    rf = fake_factors["RF"].values
    strat = rf + fake_factors["Mkt-RF"].values + rng.normal(0, 0.001, len(fake_factors))
    res = regress_on_factors(pd.Series(strat, index=fake_factors.index), fake_factors)
    # Alpha should be statistically indistinguishable from zero
    assert abs(res.alpha_tstat) < 2.5


def test_regression_drop_momentum(fake_factors):
    rng = np.random.default_rng(2)
    rf = fake_factors["RF"].values
    strat = rf + rng.normal(0.003, 0.01, len(fake_factors))
    res = regress_on_factors(
        pd.Series(strat, index=fake_factors.index),
        fake_factors,
        use_momentum=False,
    )
    assert "Mom" not in res.factor_betas
    assert res.factors_used == ["Mkt-RF", "SMB", "HML", "RMW", "CMA"]


def test_regression_rejects_too_few_obs(fake_factors):
    short = fake_factors.head(5)
    strat = pd.Series([0.01] * 5, index=short.index)
    with pytest.raises(ValueError, match="aligned monthly obs"):
        regress_on_factors(strat, short)


def test_regression_summary_shape(fake_factors):
    rng = np.random.default_rng(3)
    rf = fake_factors["RF"].values
    strat = rf + rng.normal(0.002, 0.01, len(fake_factors))
    res = regress_on_factors(pd.Series(strat, index=fake_factors.index), fake_factors)
    s = regression_summary(res)
    assert "alpha" in s
    assert "annualized" in s["alpha"]
    assert "tstat_hac" in s["alpha"]
    assert "is_significant_5pct" in s["alpha"]
    assert "Mkt-RF" in s["betas"]
    assert "information_ratio_annualized" in s


def test_load_factors_csv(tmp_path: Path):
    n = 30
    df = pd.DataFrame(
        {
            "date": pd.date_range("2020-01-31", periods=n, freq="ME"),
            "Mkt-RF": [0.01] * n,
            "SMB": [0.001] * n,
            "HML": [0.0] * n,
            "RMW": [0.002] * n,
            "CMA": [0.0] * n,
            "RF": [0.002] * n,
            "Mom": [0.003] * n,
        }
    )
    p = tmp_path / "factors.csv"
    df.to_csv(p, index=False)
    loaded = load_factors_csv(p)
    assert len(loaded) == n
    assert "Mkt-RF" in loaded.columns


def test_load_factors_csv_rejects_missing_columns(tmp_path: Path):
    df = pd.DataFrame({"date": pd.date_range("2020-01-31", periods=5, freq="ME"),
                       "Mkt-RF": [0.01] * 5})
    p = tmp_path / "bad.csv"
    df.to_csv(p, index=False)
    with pytest.raises(ValueError, match="missing columns"):
        load_factors_csv(p)


def test_strategy_monthly_returns_from_ledger(tmp_path: Path):
    dates = pd.date_range("2026-01-02", periods=90, freq="D")
    equity = 10000 * (1.0005) ** np.arange(90)
    ledger = pd.DataFrame(
        {
            "date": dates,
            "as_of": "2025-12-31",
            "equity": equity,
            "daily_return": [0.0005] * 90,
            "drawdown": 0.0,
            "n_holdings": 1,
        }
    )
    p = tmp_path / "ledger.csv"
    ledger.to_csv(p, index=False)
    monthly = strategy_monthly_returns_from_ledger(p)
    # 90 days starting Jan 2 → 4 month-end marks (Jan/Feb/Mar/Apr), 3 returns
    assert len(monthly) >= 2
    # Whole-month returns (Feb, Mar) should be near 1.4-1.6%; the partial-month
    # tail (Apr) just gets one day of growth = 5bps. Floor the whole-month check
    # at a generous lower bound to avoid being seed-sensitive.
    full_month_rets = monthly.iloc[:2]
    assert all(0.005 < r < 0.020 for r in full_month_rets.values)
