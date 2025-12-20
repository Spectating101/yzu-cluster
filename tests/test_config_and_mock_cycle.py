import os

import pytest

from main import SharpeSystem


def test_config_loads_in_mock_mode():
    os.environ["MODE"] = "mock"
    system = SharpeSystem()
    assert system.config is not None
    assert "market" in system.config


@pytest.mark.asyncio
async def test_mock_cycle_runs_quickly():
    os.environ["MODE"] = "mock"
    system = SharpeSystem(mode="mock", tickers=["AAPL"])
    # Should not raise; memo generation falls back to mock when no key
    await system.run_daily_cycle()
