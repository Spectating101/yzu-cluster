from __future__ import annotations

import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.sec_edge_cycle import _assess_edge


def _result(cagr, bench_cagr, active_sharpe, sharpe=1.1, mdd=-0.2):
    return {
        "metrics": {
            "cagr": cagr,
            "benchmark_cagr": bench_cagr,
            "active_sharpe": active_sharpe,
            "sharpe": sharpe,
            "mdd": mdd,
        }
    }


def test_assess_edge_ready_when_full_and_recent_hold_up():
    report = _assess_edge(
        {
            "best": _result(0.25, 0.15, 0.70),
            "recent_3y": _result(0.35, 0.24, 1.00),
            "lag2_cd10": _result(0.10, 0.15, -0.35),
            "all_forms": _result(0.22, 0.15, 0.63),
            "no_momentum": _result(0.24, 0.15, 0.20),
        }
    )
    assert report["status"] == "ready"
    assert report["checks"]["lag1_better_than_lag2_cd10"] is True


def test_assess_edge_blocked_when_recent_window_fails():
    report = _assess_edge(
        {
            "best": _result(0.25, 0.15, 0.70),
            "recent_3y": _result(0.20, 0.24, -0.10),
            "lag2_cd10": _result(0.10, 0.15, -0.35),
            "all_forms": _result(0.22, 0.15, 0.63),
            "no_momentum": _result(0.24, 0.15, 0.20),
        }
    )
    assert report["status"] == "blocked"
    assert report["checks"]["recent_beats_spy_cagr"] is False
