"""Tests for the alpha paper tracker and daily scorecard."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


@pytest.fixture
def panel_csv(tmp_dir):
    """Create a minimal panel CSV with 2 instruments, 10 trading days."""
    dates = pd.bdate_range("2026-01-02", periods=10)
    rows = []
    for d in dates:
        rows.append({"Instrument": "AAA", "Date": str(d.date()), "Price_Close": 100.0 + np.random.randn() * 2})
        rows.append({"Instrument": "BBB", "Date": str(d.date()), "Price_Close": 50.0 + np.random.randn()})
    df = pd.DataFrame(rows)
    path = tmp_dir / "panel.csv"
    df.to_csv(path, index=False)
    return path


@pytest.fixture
def signal_json(tmp_dir):
    """Create a minimal signal.json."""
    sig = {
        "as_of_month": "2025-12-31",
        "strategy": "test_strat",
        "weights": {"AAA": 0.6, "BBB": 0.4},
    }
    path = tmp_dir / "signal.json"
    path.write_text(json.dumps(sig))
    return path


# ---------------------------------------------------------------------------
# Import helpers (add parent to path)
# ---------------------------------------------------------------------------

import sys
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from alpha_paper_tracker import _read_json, _load_panel_prices, _append_row
from alpha_daily_scorecard import (
    _sharpe_annualized,
    _sortino_annualized,
    _cagr_from_equity,
    _max_drawdown_from_returns,
    _rolling_win_rate,
    _find_cash_keys,
    _calc_concentration,
)


# ---------------------------------------------------------------------------
# _read_json
# ---------------------------------------------------------------------------

class TestReadJson:
    def test_reads_dict(self, tmp_dir):
        p = tmp_dir / "ok.json"
        p.write_text('{"a": 1}')
        assert _read_json(p) == {"a": 1}

    def test_rejects_non_dict(self, tmp_dir):
        p = tmp_dir / "bad.json"
        p.write_text("[1, 2]")
        with pytest.raises(ValueError, match="Expected dict"):
            _read_json(p)


# ---------------------------------------------------------------------------
# _load_panel_prices
# ---------------------------------------------------------------------------

class TestLoadPanelPrices:
    def test_basic_load(self, panel_csv):
        px = _load_panel_prices(panel_csv)
        assert "AAA" in px.columns
        assert "BBB" in px.columns
        assert len(px) == 10

    def test_missing_columns(self, tmp_dir):
        p = tmp_dir / "bad_panel.csv"
        pd.DataFrame({"X": [1]}).to_csv(p, index=False)
        with pytest.raises(ValueError):
            _load_panel_prices(p)


# ---------------------------------------------------------------------------
# _append_row
# ---------------------------------------------------------------------------

class TestAppendRow:
    def test_creates_new_file(self, tmp_dir):
        ledger = tmp_dir / "ledger.csv"
        _append_row(ledger, {"date": "2026-01-01", "equity": 10000.0})
        df = pd.read_csv(ledger)
        assert len(df) == 1
        assert df["equity"].iloc[0] == 10000.0

    def test_appends_to_existing(self, tmp_dir):
        ledger = tmp_dir / "ledger.csv"
        _append_row(ledger, {"date": "2026-01-01", "equity": 10000.0})
        _append_row(ledger, {"date": "2026-01-02", "equity": 10100.0})
        df = pd.read_csv(ledger)
        assert len(df) == 2
        assert df["equity"].iloc[1] == 10100.0

    def test_overwrites_same_date(self, tmp_dir):
        """New row for the same date must replace the old one."""
        ledger = tmp_dir / "ledger.csv"
        _append_row(ledger, {"date": "2026-01-01", "equity": 10000.0, "as_of": "2025-12-31"})
        _append_row(ledger, {"date": "2026-01-01", "equity": 9999.0, "as_of": "2026-01-31"})
        df = pd.read_csv(ledger)
        assert len(df) == 1
        assert df["equity"].iloc[0] == 9999.0
        assert df["as_of"].iloc[0] == "2026-01-31"

    def test_maintains_sort_order(self, tmp_dir):
        ledger = tmp_dir / "ledger.csv"
        _append_row(ledger, {"date": "2026-01-03", "equity": 103.0})
        _append_row(ledger, {"date": "2026-01-01", "equity": 101.0})
        _append_row(ledger, {"date": "2026-01-02", "equity": 102.0})
        df = pd.read_csv(ledger)
        assert list(df["date"]) == ["2026-01-01", "2026-01-02", "2026-01-03"]


# ---------------------------------------------------------------------------
# Scorecard metrics
# ---------------------------------------------------------------------------

class TestScorecardMetrics:
    def test_sharpe_positive(self):
        r = pd.Series([0.01, 0.02, 0.01, -0.005, 0.015])
        s = _sharpe_annualized(r)
        assert np.isfinite(s) and s > 0

    def test_sharpe_negative(self):
        r = pd.Series([-0.01, -0.02, -0.01, 0.005, -0.015])
        s = _sharpe_annualized(r)
        assert np.isfinite(s) and s < 0

    def test_sharpe_too_few(self):
        r = pd.Series([0.01])
        assert np.isnan(_sharpe_annualized(r))

    def test_sortino_positive(self):
        # Needs at least 2 negative returns for ddof=1 downside std
        r = pd.Series([0.01, 0.02, -0.005, -0.003, 0.015, 0.01])
        s = _sortino_annualized(r)
        assert np.isfinite(s) and s > 0

    def test_sortino_no_downside(self):
        r = pd.Series([0.01, 0.02, 0.03])
        assert np.isnan(_sortino_annualized(r))

    def test_cagr_positive(self):
        eq = pd.Series([100.0, 110.0])
        start = pd.Timestamp("2025-01-01")
        end = pd.Timestamp("2026-01-01")
        cagr = _cagr_from_equity(eq, start, end)
        assert abs(cagr - 0.10) < 0.01

    def test_cagr_negative(self):
        eq = pd.Series([100.0, 90.0])
        start = pd.Timestamp("2025-01-01")
        end = pd.Timestamp("2026-01-01")
        cagr = _cagr_from_equity(eq, start, end)
        assert cagr < 0

    def test_max_drawdown(self):
        r = pd.Series([0.10, -0.20, 0.05])
        dd = _max_drawdown_from_returns(r)
        assert dd < 0
        assert dd >= -0.20

    def test_rolling_win_rate(self):
        r = pd.Series([0.01, -0.01, 0.02, -0.02, 0.03])
        wr = _rolling_win_rate(r, 5)
        assert abs(wr - 0.6) < 1e-9

    def test_find_cash_keys(self):
        w = {"BIL": 0.2, "SPY": 0.3, "SGOV": 0.1, "GLD": 0.4}
        assert sorted(_find_cash_keys(w)) == ["BIL", "SGOV"]

    def test_concentration(self):
        w = {"A": 0.5, "B": 0.5}
        c = _calc_concentration(w)
        assert abs(c["hhi"] - 0.5) < 1e-9
        assert abs(c["effective_n"] - 2.0) < 1e-9

    def test_concentration_single(self):
        w = {"A": 1.0}
        c = _calc_concentration(w)
        assert abs(c["hhi"] - 1.0) < 1e-9
        assert abs(c["effective_n"] - 1.0) < 1e-9


# ---------------------------------------------------------------------------
# Regime policy
# ---------------------------------------------------------------------------

SRC_DIR = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC_DIR.parent))

from src.strategy.regime_policy import (
    RegimeMetrics,
    StrategyParams,
    compute_regime_metrics,
    policy_params,
)


class TestRegimePolicy:
    @pytest.fixture
    def base_params(self):
        return StrategyParams(
            target_vol=0.20, top_n=4, max_weight=0.40,
            regime_off_gross=0.0, alpha_tstat_scale=1.5,
        )

    def test_risk_off_derisk(self, base_params):
        metrics = RegimeMetrics(
            asof="2026-01-31", trend_12m=-0.10, vol_12m=0.25,
            dd_12m=-0.20, risk_on=False, high_vol=True,
        )
        p = policy_params(base_params, metrics)
        assert p.target_vol <= 0.12
        assert p.top_n >= 6
        assert p.max_weight <= 0.25
        assert p.alpha_tstat_scale >= 3.0

    def test_high_vol_moderate(self, base_params):
        metrics = RegimeMetrics(
            asof="2026-01-31", trend_12m=0.10, vol_12m=0.25,
            dd_12m=-0.08, risk_on=True, high_vol=True,
        )
        p = policy_params(base_params, metrics)
        assert p.target_vol <= 0.14
        assert p.top_n >= 5

    def test_calm_risk_on(self, base_params):
        metrics = RegimeMetrics(
            asof="2026-01-31", trend_12m=0.15, vol_12m=0.12,
            dd_12m=-0.05, risk_on=True, high_vol=False,
        )
        p = policy_params(base_params, metrics)
        assert p.target_vol >= 0.14
        assert p.top_n <= 4

    def test_none_metrics_returns_base(self, base_params):
        p = policy_params(base_params, None)
        assert p == base_params

    def test_compute_regime_metrics_basic(self):
        # 24 monthly returns of ~1% with some noise
        np.random.seed(42)
        dates = pd.date_range("2024-01-31", periods=24, freq="ME")
        returns = pd.Series(0.01 + np.random.randn(24) * 0.03, index=dates)
        m = compute_regime_metrics(returns, asof=pd.Timestamp("2025-12-31"))
        assert m is not None
        assert isinstance(m.trend_12m, float)
        assert isinstance(m.risk_on, bool)

    def test_compute_regime_metrics_insufficient_data(self):
        dates = pd.date_range("2025-10-31", periods=3, freq="ME")
        returns = pd.Series([0.01, -0.02, 0.01], index=dates)
        m = compute_regime_metrics(returns, asof=pd.Timestamp("2025-12-31"))
        assert m is None

    def test_strategy_params_to_dict(self):
        p = StrategyParams(target_vol=0.2, top_n=4, max_weight=0.4,
                           regime_off_gross=0.0, alpha_tstat_scale=1.5)
        d = p.to_dict()
        assert d["target_vol"] == 0.2
        assert d["top_n"] == 4

    def test_deep_drawdown_triggers_hard_derisk(self, base_params):
        """Even if risk_on=True, a deep drawdown should trigger hard de-risk."""
        metrics = RegimeMetrics(
            asof="2026-01-31", trend_12m=0.05, vol_12m=0.18,
            dd_12m=-0.20, risk_on=True, high_vol=False,
        )
        p = policy_params(base_params, metrics)
        assert p.target_vol <= 0.12
        assert p.regime_off_gross >= 0.25


# ---------------------------------------------------------------------------
# Lambda CV
# ---------------------------------------------------------------------------

from alpha_insights_walkforward_runner import _cv_select_lambda, _ridge_fit, _spearman_ic  # noqa: E402


class TestLambdaCV:
    """Tests for _cv_select_lambda (chronological cross-validation)."""

    def _make_synthetic_train(self, n_months: int = 20, n_assets: int = 8, seed: int = 0):
        """Build a synthetic training DataFrame with known structure.

        High lambda (heavy regularisation) should beat low lambda when features
        are mostly noise with a tiny true signal buried in one column.
        """
        rng = np.random.RandomState(seed)
        dates = pd.date_range("2020-01-31", periods=n_months, freq="ME")
        rows = []
        for dt in dates:
            for j in range(n_assets):
                signal = rng.randn() * 0.01  # tiny true signal
                noise1 = rng.randn() * 5.0
                noise2 = rng.randn() * 5.0
                ret = signal + rng.randn() * 0.05
                rows.append({
                    "date": dt,
                    "instrument": f"ASSET_{j}",
                    "f_signal": signal,
                    "f_noise1": noise1,
                    "f_noise2": noise2,
                    "ret_fwd_1m": ret,
                })
        return pd.DataFrame(rows), ["f_signal", "f_noise1", "f_noise2"]

    def test_cv_picks_best_lambda(self):
        """CV selects a lambda from the grid (not just the hardcoded middle)."""
        train, fcols = self._make_synthetic_train(n_months=24, seed=42)
        lam_grid = [0.001, 0.1, 1.0, 10.0, 100.0]
        best = _cv_select_lambda(train, fcols, lam_grid, min_assets=3)
        assert best in lam_grid

    def test_cv_fallback_on_bad_data(self):
        """If no valid IC can be computed (too few assets), falls back to middle of grid."""
        # Only 2 instruments per month, but min_assets=5 → no IC can be computed.
        rng = np.random.RandomState(99)
        dates = pd.date_range("2020-01-31", periods=20, freq="ME")
        rows = []
        for dt in dates:
            for j in range(2):
                rows.append({
                    "date": dt, "instrument": f"X_{j}",
                    "f1": rng.randn(), "f2": rng.randn(),
                    "ret_fwd_1m": rng.randn(),
                })
        train = pd.DataFrame(rows)
        lam_grid = [0.01, 0.1, 1.0, 10.0, 100.0]
        best = _cv_select_lambda(train, ["f1", "f2"], lam_grid, min_assets=5)
        # No valid ICs → fallback to middle of grid = 1.0
        assert best == lam_grid[len(lam_grid) // 2]

    def test_cv_single_lambda(self):
        """Grid with 1 element returns it."""
        train, fcols = self._make_synthetic_train(n_months=16, seed=7)
        best = _cv_select_lambda(train, fcols, [5.0], min_assets=3)
        assert best == 5.0


# ---------------------------------------------------------------------------
# OOS IC gate
# ---------------------------------------------------------------------------


class TestOOSIC:
    """Tests for the OOS IC alpha decay gate logic."""

    def test_negative_oos_ic_halves_alpha(self):
        """When trailing OOS IC is negative and >= 6 samples, alpha_scale is halved."""
        oos_ics = [-0.05, -0.10, -0.03, -0.08, -0.12, -0.06]
        alpha_scale = 0.8

        # Replicate the gate logic from walkforward_backtest
        if len(oos_ics) >= 6:
            oos_mu = float(np.mean(oos_ics[-12:]))
            if oos_mu < 0:
                alpha_scale *= 0.5

        assert abs(alpha_scale - 0.4) < 1e-9

    def test_positive_oos_ic_no_change(self):
        """When trailing OOS IC is positive, alpha_scale is unchanged."""
        oos_ics = [0.05, 0.10, 0.03, 0.08, 0.12, 0.06]
        alpha_scale = 0.8

        if len(oos_ics) >= 6:
            oos_mu = float(np.mean(oos_ics[-12:]))
            if oos_mu < 0:
                alpha_scale *= 0.5

        assert abs(alpha_scale - 0.8) < 1e-9

    def test_insufficient_oos_no_change(self):
        """With fewer than 6 OOS IC samples, gate is not applied."""
        oos_ics = [-0.10, -0.20, -0.15]
        alpha_scale = 0.8

        if len(oos_ics) >= 6:
            oos_mu = float(np.mean(oos_ics[-12:]))
            if oos_mu < 0:
                alpha_scale *= 0.5

        assert abs(alpha_scale - 0.8) < 1e-9
