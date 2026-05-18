from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import pytest


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from trading.execution.file_broker import FileBroker
from trading.execution.live_signal_executor import SafetyConfig, compute_rebalance_orders


@pytest.fixture
def panel_csv(tmp_path: Path) -> Path:
    rows = [
        {"Instrument": "AAA", "Date": "2026-01-10", "Price_Close": 100.0},
        {"Instrument": "AAA", "Date": "2026-01-12", "Price_Close": 101.0},
    ]
    path = tmp_path / "panel.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


@pytest.fixture
def state_json(tmp_path: Path) -> Path:
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"cash": 10_000.0, "positions": {}}))
    return path


def _broker(state_json: Path, panel_csv: Path) -> FileBroker:
    return FileBroker(state_json=state_json, panel_csv=panel_csv, cash_symbol="BIL")


def test_reference_date_allows_historical_paper_execution(state_json: Path, panel_csv: Path, tmp_path: Path):
    notes, orders = compute_rebalance_orders(
        broker=_broker(state_json, panel_csv),
        signal={"as_of": "2026-01-10", "weights": {"AAA": 1.0}, "regime": "risk_on"},
        safety=SafetyConfig(stale_signal_days=3, reference_date="2026-01-12"),
        live_state_path=tmp_path / "live_state.json",
        execute=False,
        allow_repeat_as_of=False,
    )
    assert notes == []
    assert len(orders) == 1
    assert orders[0].symbol == "AAA"


def test_reference_date_still_enforces_staleness(state_json: Path, panel_csv: Path, tmp_path: Path):
    with pytest.raises(RuntimeError, match="Signal is stale"):
        compute_rebalance_orders(
            broker=_broker(state_json, panel_csv),
            signal={"as_of": "2026-01-10", "weights": {"AAA": 1.0}, "regime": "risk_on"},
            safety=SafetyConfig(stale_signal_days=3, reference_date="2026-01-20"),
            live_state_path=tmp_path / "live_state.json",
            execute=False,
            allow_repeat_as_of=False,
        )
