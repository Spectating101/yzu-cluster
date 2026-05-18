from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.alpha_live_cycle import _panel_freshness, _readiness_report


def test_panel_freshness_reports_latest_date(tmp_path: Path):
    panel = tmp_path / "panel.csv"
    pd.DataFrame(
        [
            {"Instrument": "AAA", "Date": "2026-03-08", "Price_Close": 10.0},
            {"Instrument": "BBB", "Date": "2026-03-09", "Price_Close": 20.0},
            {"Instrument": "AAA", "Date": "2026-03-09", "Price_Close": 11.0},
        ]
    ).to_csv(panel, index=False)

    info = _panel_freshness(panel, reference_time=datetime(2026, 3, 11, tzinfo=timezone.utc))

    assert info["latest_date"] == "2026-03-09"
    assert info["age_days"] == 2
    assert info["n_instruments"] == 2


def test_readiness_report_flags_ready_when_checks_pass():
    report = _readiness_report(
        panel_info={"latest_date": "2026-03-09", "age_days": 2, "n_instruments": 6},
        signal={"as_of_month": "2026-02-28", "strategy": "alpha_test", "weights": {"AAA": 0.6, "BBB": 0.4}},
        score={
            "period": {"n_days": 45},
            "performance": {
                "sharpe_daily_252": 1.1,
                "latest_drawdown": -0.04,
                "max_drawdown_from_ledger": -0.10,
                "sortino_daily_252": 1.6,
                "cagr_since_start": 0.15,
                "return_30d": 0.03,
                "win_rate_30d": 0.57,
            },
            "benchmark": {"alpha_30d": 0.01},
            "positioning": {},
        },
        max_panel_staleness_days=5,
        min_ledger_days=30,
        min_sharpe=0.0,
        max_drawdown=0.20,
        min_alpha_30d=-0.02,
    )

    assert report["status"] == "ready"
    assert report["checks"]["panel_fresh"] is True
    assert report["checks"]["positive_sharpe"] is True


def test_readiness_report_blocks_stale_or_weak_setup():
    report = _readiness_report(
        panel_info={"latest_date": "2026-02-20", "age_days": 20, "n_instruments": 6},
        signal={"as_of_month": "2026-02-28", "strategy": "alpha_test", "weights": {"AAA": 1.0}},
        score={
            "period": {"n_days": 8},
            "performance": {
                "sharpe_daily_252": -0.4,
                "latest_drawdown": -0.25,
                "max_drawdown_from_ledger": -0.30,
                "sortino_daily_252": -0.3,
                "cagr_since_start": -0.1,
                "return_30d": -0.05,
                "win_rate_30d": 0.25,
            },
            "benchmark": {"alpha_30d": -0.06},
            "positioning": {},
        },
        max_panel_staleness_days=5,
        min_ledger_days=30,
        min_sharpe=0.0,
        max_drawdown=0.20,
        min_alpha_30d=-0.02,
    )

    assert report["status"] == "blocked"
    assert report["checks"]["panel_fresh"] is False
    assert report["checks"]["enough_ledger_history"] is False
