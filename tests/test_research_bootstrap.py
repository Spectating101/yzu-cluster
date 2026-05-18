from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.research.bootstrap import (
    block_bootstrap_period_indices,
    bootstrap_ridge_coefficients,
)


def test_block_bootstrap_returns_correct_length():
    blocks = list(block_bootstrap_period_indices(20, block_size=4, n_iter=10, seed=0))
    assert len(blocks) == 10
    for b in blocks:
        assert b.shape == (20,)
        # All indices in valid range
        assert b.min() >= 0
        assert b.max() < 20


def test_block_bootstrap_uses_contiguous_blocks():
    """Within a sample, adjacent indices in a block should be consecutive
    (mod n_periods)."""
    [b] = list(block_bootstrap_period_indices(20, block_size=5, n_iter=1, seed=0))
    # In 4 contiguous 5-blocks, transitions at position 4, 9, 14 must be
    # either +1 (within block) or some jump (between blocks). Within-block
    # gaps must be 1 (or -19 for wrap).
    for i in range(20):
        if i % 5 == 4:
            continue  # block boundary
        diff = int(b[i + 1] - b[i]) if i + 1 < 20 else 0
        assert diff in (1, -19), f"non-contiguous within block at i={i}: {diff}"


def test_block_bootstrap_rejects_bad_inputs():
    with pytest.raises(ValueError, match="block_size"):
        next(block_bootstrap_period_indices(20, block_size=0, n_iter=10))
    with pytest.raises(ValueError, match="n_periods"):
        next(block_bootstrap_period_indices(3, block_size=10, n_iter=1))
    with pytest.raises(ValueError, match="n_iter"):
        next(block_bootstrap_period_indices(20, block_size=5, n_iter=0))


def _panel_with_signal(rng, n_periods=60, n_assets=25, betas=(0.5, -0.3, 0.0)):
    """Panel where ret_fwd_1m = β1*f1 + β2*f2 + β3*f3 + noise."""
    rows = []
    for t in range(n_periods):
        date = pd.Timestamp("2020-01-01") + pd.DateOffset(months=t)
        for a in range(n_assets):
            f1 = rng.normal()
            f2 = rng.normal()
            f3 = rng.normal()
            y = betas[0] * f1 + betas[1] * f2 + betas[2] * f3 + rng.normal(scale=0.5)
            rows.append({"date": date, "instrument": f"A{a}",
                         "f1": f1, "f2": f2, "f3": f3, "ret_fwd_1m": y})
    return pd.DataFrame(rows)


def test_bootstrap_ridge_recovers_true_signs():
    rng = np.random.default_rng(0)
    panel = _panel_with_signal(rng, betas=(0.5, -0.3, 0.0))
    res = bootstrap_ridge_coefficients(
        panel, feature_cols=["f1", "f2", "f3"],
        lam=0.1, n_iter=200, block_size=3, seed=0,
    )
    s = res.summary()
    # True positive coef
    assert s.loc["f1", "point_estimate"] > 0
    assert s.loc["f1", "significant_5pct"]
    # True negative coef
    assert s.loc["f2", "point_estimate"] < 0
    assert s.loc["f2", "significant_5pct"]
    # True zero coef — should NOT be significant
    assert not s.loc["f3", "significant_5pct"]


def test_bootstrap_ci_widens_for_smaller_panel():
    """A smaller training panel should produce wider bootstrap CIs."""
    rng = np.random.default_rng(1)
    big = _panel_with_signal(rng, n_periods=80, n_assets=30, betas=(0.5, 0.0, 0.0))
    small = big[big["date"] >= big["date"].unique()[60]].copy()  # ~20 periods

    big_res = bootstrap_ridge_coefficients(big, feature_cols=["f1", "f2", "f3"],
                                            lam=0.1, n_iter=200, block_size=3, seed=0)
    small_res = bootstrap_ridge_coefficients(small, feature_cols=["f1", "f2", "f3"],
                                              lam=0.1, n_iter=200, block_size=3, seed=0)
    big_se = big_res.summary().loc["f1", "bootstrap_se"]
    small_se = small_res.summary().loc["f1", "bootstrap_se"]
    assert small_se > big_se


def test_bootstrap_summary_columns():
    rng = np.random.default_rng(2)
    panel = _panel_with_signal(rng, betas=(0.5, -0.3, 0.0))
    res = bootstrap_ridge_coefficients(
        panel, feature_cols=["f1", "f2", "f3"],
        lam=0.1, n_iter=50, block_size=3, seed=0,
    )
    s = res.summary()
    expected = {"point_estimate", "bootstrap_mean", "bootstrap_se",
                "ci_lo", "ci_median", "ci_hi", "significant_5pct"}
    assert expected.issubset(set(s.columns))


def test_bootstrap_alpha_level_widens_ci():
    rng = np.random.default_rng(3)
    panel = _panel_with_signal(rng, betas=(0.5, 0.0, 0.0))
    res = bootstrap_ridge_coefficients(
        panel, feature_cols=["f1", "f2", "f3"],
        lam=0.1, n_iter=300, block_size=3, seed=0,
    )
    s95 = res.summary(alpha=0.05)
    s99 = res.summary(alpha=0.01)
    # 99% CI must be wider than 95% CI for every feature
    for f in res.feature_names:
        width_95 = s95.loc[f, "ci_hi"] - s95.loc[f, "ci_lo"]
        width_99 = s99.loc[f, "ci_hi"] - s99.loc[f, "ci_lo"]
        assert width_99 >= width_95
