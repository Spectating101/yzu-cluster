from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.sec_edge_paper_cycle import main as sec_edge_paper_cycle_main
from scripts.sec_event_alpha_backtest import build_latest_signal, load_events, load_prices


def test_build_latest_signal_respects_strict_timing_and_cash_buffer(tmp_path: Path):
    prices = tmp_path / "prices.csv"
    events = tmp_path / "events.csv"

    pd.DataFrame(
        [
            {"Instrument": "SPY", "Date": "2026-03-09", "Price_Close": 500.0},
            {"Instrument": "SPY", "Date": "2026-03-10", "Price_Close": 501.0},
            {"Instrument": "SPY", "Date": "2026-03-11", "Price_Close": 502.0},
            {"Instrument": "AAA", "Date": "2026-03-09", "Price_Close": 100.0},
            {"Instrument": "AAA", "Date": "2026-03-10", "Price_Close": 101.0},
            {"Instrument": "AAA", "Date": "2026-03-11", "Price_Close": 102.0},
        ]
    ).to_csv(prices, index=False)
    pd.DataFrame(
        [
            {
                "Date": "2026-03-11",
                "Ticker": "AAA",
                "Form": "8-K",
                "AcceptanceDateTime": "2026-03-11T13:00:00Z",
            }
        ]
    ).to_csv(events, index=False)

    signal = build_latest_signal(
        load_prices(prices),
        load_events(events),
        benchmark="SPY",
        top_n=5,
        hold_days=1,
        trade_lag=1,
        gross=1.0,
        cost_bps=10.0,
        mom_days=5,
        mom_weight=1.5,
        form_weights={"8-K": 1.0, "10-Q": 0.0, "10-K": 0.0},
        target_vol=0.0,
        event_timing_mode="strict_acceptance",
        cash_symbol="BIL",
        execution_max_gross=0.60,
    )

    assert signal["as_of"] == "2026-03-11"
    assert signal["weights"]["AAA"] == 0.60
    assert signal["weights"]["BIL"] == 0.40
    assert signal["diagnostics"]["selected"] == ["AAA"]
    assert signal["diagnostics"]["forms"] == {"8-K": 1}


def test_sec_edge_paper_cycle_executes_and_writes_artifacts(tmp_path: Path, monkeypatch):
    prices = tmp_path / "prices.csv"
    events = tmp_path / "events.csv"
    out_root = tmp_path / "sec_paper"

    pd.DataFrame(
        [
            {"Instrument": "SPY", "Date": "2026-03-09", "Price_Close": 500.0},
            {"Instrument": "SPY", "Date": "2026-03-10", "Price_Close": 501.0},
            {"Instrument": "SPY", "Date": "2026-03-11", "Price_Close": 502.0},
            {"Instrument": "AAA", "Date": "2026-03-09", "Price_Close": 100.0},
            {"Instrument": "AAA", "Date": "2026-03-10", "Price_Close": 101.0},
            {"Instrument": "AAA", "Date": "2026-03-11", "Price_Close": 102.0},
        ]
    ).to_csv(prices, index=False)
    pd.DataFrame(
        [
            {
                "Date": "2026-03-11",
                "Ticker": "AAA",
                "Form": "8-K",
                "AcceptanceDateTime": "2026-03-11T13:00:00Z",
            }
        ]
    ).to_csv(events, index=False)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "sec_edge_paper_cycle.py",
            "--prices",
            str(prices),
            "--events",
            str(events),
            "--out-root",
            str(out_root),
            "--execute",
            "--allow-repeat-as-of",
            "--order-type",
            "market",
            "--max-panel-staleness-days",
            "1000",
            "--target-vol",
            "0.0",
            "--top-n",
            "5",
            "--hold-days",
            "1",
            "--execution-max-gross",
            "0.75",
        ],
    )

    rc = sec_edge_paper_cycle_main()
    assert rc == 0

    state = json.loads((out_root / "state.json").read_text())
    assert float(state["cash"]) < 10_000.0
    assert float(state["positions"]["AAA"]) > 0.0

    today_dirs = sorted([p for p in out_root.iterdir() if p.is_dir() and p.name[:4].isdigit()])
    assert today_dirs, "expected dated run directory"
    run_dir = today_dirs[-1]

    assert (run_dir / "strategy" / "signal.json").exists()
    assert (run_dir / "execution" / "orders_proposed.json").exists()
    assert (run_dir / "execution" / "orders_submitted.json").exists()
    assert (run_dir / "report" / "sec_edge_paper_cycle_report.json").exists()
    assert (out_root / "ledger.csv").exists()
    assert (out_root / "scorecard" / "scorecard_latest.json").exists()
    assert (out_root / "edge_readiness_latest.json").exists()
