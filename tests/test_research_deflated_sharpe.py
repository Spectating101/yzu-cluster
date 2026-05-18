from __future__ import annotations

import math

import numpy as np
import pytest

from src.research.deflated_sharpe import (
    deflated_sharpe,
    expected_max_sharpe_under_null,
    per_period_sharpe,
    probability_of_backtest_overfitting,
    psr,
    sharpe_se,
)


def test_per_period_sharpe_basic():
    rng = np.random.default_rng(0)
    r = rng.normal(0.01, 0.02, size=500)
    sr = per_period_sharpe(r)
    # mean/std ratio is finite and roughly mu/sigma = 0.5
    assert math.isfinite(sr)
    assert 0.2 < sr < 0.8


def test_sharpe_se_matches_normal_lo_formula():
    """For Normal returns, sigma(SR) ≈ sqrt((1 + 0.5*SR^2)/(N-1))."""
    rng = np.random.default_rng(1)
    r = rng.normal(0.001, 0.01, size=2000)
    sr = per_period_sharpe(r)
    se = sharpe_se(r)
    expected = math.sqrt((1.0 + 0.5 * sr * sr) / (len(r) - 1))
    assert se == pytest.approx(expected, rel=0.20)  # skew/kurt sample noise


def test_psr_bounds_and_monotone():
    rng = np.random.default_rng(2)
    r_pos = rng.normal(0.005, 0.01, size=400)  # SR ≈ 0.5/period — strong
    r_zero = rng.normal(0.0, 0.01, size=400)
    p_pos = psr(r_pos, sr_benchmark=0.0)
    p_zero = psr(r_zero, sr_benchmark=0.0)
    # bounds
    assert 0.0 <= p_pos <= 1.0
    assert 0.0 <= p_zero <= 1.0
    # positive-mean series should clearly beat mean-zero series in PSR(SR*=0)
    assert p_pos > p_zero
    assert p_pos > 0.9
    # PSR(SR*=very high) should be near zero even for the positive-mean series
    assert psr(r_pos, sr_benchmark=10.0) < 0.05


def test_expected_max_grows_in_trials():
    v = 0.1
    e2 = expected_max_sharpe_under_null(2, v)
    e100 = expected_max_sharpe_under_null(100, v)
    e10000 = expected_max_sharpe_under_null(10_000, v)
    assert 0.0 <= e2 < e100 < e10000


def test_expected_max_zero_when_no_variance():
    assert expected_max_sharpe_under_null(100, 0.0) == 0.0


def test_deflated_sharpe_deflates_with_more_trials():
    """DSR for a fixed winning strategy should drop as we report more failed trials.

    Pick a weak-but-positive winner so the deflation actually moves the needle
    (a 5-sigma winner saturates DSR ≈ 1 regardless of trial count).
    """
    rng = np.random.default_rng(3)
    winner = rng.normal(0.001, 0.02, size=300)  # weak edge, ~0.05 per-period SR
    few_trials = [per_period_sharpe(rng.normal(0, 0.02, 300)) for _ in range(5)]
    few_trials.append(per_period_sharpe(winner))
    many_trials = [per_period_sharpe(rng.normal(0, 0.02, 300)) for _ in range(5000)]
    many_trials.append(per_period_sharpe(winner))

    res_few = deflated_sharpe(winner, all_trial_sharpes=few_trials)
    res_many = deflated_sharpe(winner, all_trial_sharpes=many_trials)
    # Expected null-max grows in trials → DSR shrinks.
    assert res_many.expected_max_sr_under_null > res_few.expected_max_sr_under_null
    assert res_many.dsr < res_few.dsr
    assert 0.0 <= res_many.dsr <= 1.0
    assert 0.0 <= res_few.dsr <= 1.0


def test_deflated_sharpe_result_fields():
    rng = np.random.default_rng(4)
    winner = rng.normal(0.005, 0.02, size=150)
    trials = [per_period_sharpe(rng.normal(0, 0.02, 150)) for _ in range(20)]
    trials.append(per_period_sharpe(winner))
    res = deflated_sharpe(winner, all_trial_sharpes=trials)
    assert res.n_trials == 21
    assert math.isfinite(res.sr_observed)
    assert math.isfinite(res.sharpe_se)
    assert 0.0 <= res.dsr <= 1.0
    assert 0.0 <= res.psr <= 1.0


def test_pbo_random_noise_is_near_half():
    """All strategies pure noise → PBO should be close to 0.5 (IS winner has no edge)."""
    rng = np.random.default_rng(5)
    T, N = 96, 30  # 96 months, 30 strategies
    M = rng.normal(0.0, 0.02, size=(T, N))
    res = probability_of_backtest_overfitting(M, n_splits=8)
    assert 0.30 < res.pbo < 0.70
    assert res.n_combinations == 70  # C(8,4)
    assert res.logits.shape == (70,)


def test_pbo_strong_signal_lowers_pbo():
    """One strategy with a large genuine edge → IS winner usually wins OOS → low PBO."""
    rng = np.random.default_rng(6)
    T, N = 96, 12
    M = rng.normal(0.0, 0.02, size=(T, N))
    M[:, 0] += 0.02  # strategy 0 dominates
    res = probability_of_backtest_overfitting(M, n_splits=8)
    assert res.pbo < 0.30


def test_pbo_rejects_odd_splits():
    with pytest.raises(ValueError):
        probability_of_backtest_overfitting(np.zeros((10, 3)), n_splits=7)


def test_pbo_requires_min_strategies():
    with pytest.raises(ValueError):
        probability_of_backtest_overfitting(np.zeros((10, 1)), n_splits=4)
