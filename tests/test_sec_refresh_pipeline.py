from __future__ import annotations

import os
import sys
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.sec_edge_refresh_cycle import main as sec_edge_refresh_cycle_main
from scripts.sec_fetch_submissions import _should_refresh


def test_should_refresh_respects_missing_existing_and_stale_days(tmp_path: Path):
    missing = tmp_path / "missing.json"
    assert _should_refresh(missing, refresh_existing=False, stale_days=0) is True

    existing = tmp_path / "cached.json"
    existing.write_text("{}\n")
    assert _should_refresh(existing, refresh_existing=False, stale_days=0) is False
    assert _should_refresh(existing, refresh_existing=True, stale_days=0) is True

    stale_seconds = 2 * 86400
    ts = time.time() - stale_seconds
    os.utime(existing, (ts, ts))
    assert _should_refresh(existing, refresh_existing=False, stale_days=1) is True
    assert _should_refresh(existing, refresh_existing=False, stale_days=3) is False


def test_refresh_cycle_builds_refresh_then_run_commands(monkeypatch, tmp_path: Path):
    calls = []

    def fake_run(cmd, check, cwd):
        calls.append((list(cmd), cwd, check))
        class _Done:
            returncode = 0
        return _Done()

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "sec_edge_refresh_cycle.py",
            "--tickers-file",
            str(tmp_path / "tickers.txt"),
            "--mapping",
            str(tmp_path / "company_tickers.json"),
            "--submissions-dir",
            str(tmp_path / "submissions"),
            "--events-out",
            str(tmp_path / "events.csv"),
            "--prices-out",
            str(tmp_path / "prices.csv"),
            "--paper-out-root",
            str(tmp_path / "paper"),
            "--execute",
            "--allow-repeat-as-of",
            "--max-panel-staleness-days",
            "10",
        ],
    )

    rc = sec_edge_refresh_cycle_main()
    assert rc == 0
    assert len(calls) == 5
    assert calls[0][0][1].endswith("sec_fetch_company_tickers.py")
    assert calls[1][0][1].endswith("sec_fetch_submissions.py")
    assert "--stale-days" in calls[1][0]
    assert calls[2][0][1].endswith("sec_extract_filing_events.py")
    assert calls[3][0][1].endswith("fetch_yfinance_tidy_panel.py")
    assert calls[4][0][1].endswith("sec_edge_paper_cycle.py")
    assert "--execute" in calls[4][0]
    assert "--allow-repeat-as-of" in calls[4][0]
    assert "--max-panel-staleness-days" in calls[4][0]
