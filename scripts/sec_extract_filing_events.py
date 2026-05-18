#!/usr/bin/env python3
"""
Extract filing events (8-K/10-Q/10-K/etc.) from cached SEC submissions JSON.

Outputs a tidy events CSV with timestamp context:
  Date, Ticker, Form, AcceptanceDateTime, FilingSession
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import pandas as pd
from zoneinfo import ZoneInfo


ET = ZoneInfo("America/New_York")


def _filing_session(ts: pd.Timestamp | None) -> str:
    if ts is None or pd.isna(ts):
        return "unknown"
    ts_et = ts.tz_convert(ET) if ts.tzinfo is not None else ts.tz_localize("UTC").tz_convert(ET)
    hhmm = ts_et.hour * 60 + ts_et.minute
    if hhmm < (9 * 60 + 30):
        return "premarket"
    if hhmm >= (16 * 60):
        return "after_close"
    return "regular_hours"


def _extract_one(ticker: str, path: Path, allowed_forms: set[str]) -> List[Dict]:
    obj = json.loads(path.read_text())
    recent = (((obj or {}).get("filings") or {}).get("recent") or {})
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    accepted = recent.get("acceptanceDateTime") or []
    out: List[Dict] = []
    n = min(len(forms), len(dates)) if accepted == [] else min(len(forms), len(dates), len(accepted))
    for i in range(n):
        f = forms[i]
        d = dates[i]
        a = accepted[i] if i < len(accepted) else None
        if not f or not d:
            continue
        form = str(f).strip().upper()
        if allowed_forms and form not in allowed_forms:
            continue
        dt = pd.to_datetime(d, errors="coerce")
        if pd.isna(dt):
            continue
        acc = pd.to_datetime(a, errors="coerce", utc=True) if a else pd.NaT
        out.append(
            {
                "Date": pd.Timestamp(dt.date()),
                "Ticker": ticker,
                "Form": form,
                "AcceptanceDateTime": (acc.isoformat() if not pd.isna(acc) else ""),
                "FilingSession": _filing_session(acc if not pd.isna(acc) else None),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract SEC filing events from cached submissions.")
    ap.add_argument("--submissions-dir", type=Path, default=Path("data_lake/sec/submissions"))
    ap.add_argument("--out", type=Path, default=Path("data_lake/sec/filing_events.csv"))
    ap.add_argument("--forms", nargs="*", default=["8-K", "10-Q", "10-K"], help="Forms to include.")
    args = ap.parse_args()

    allowed = {str(x).strip().upper() for x in (args.forms or []) if str(x).strip()}

    rows: List[Dict] = []
    for p in sorted(args.submissions_dir.glob("*.json")):
        t = p.stem.upper()
        rows.extend(_extract_one(t, p, allowed))

    if not rows:
        print("No events extracted.")
        return 2
    df = pd.DataFrame(rows).dropna().drop_duplicates().sort_values(["Date", "Ticker"]).reset_index(drop=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(json.dumps({"out": str(args.out), "n": int(len(df)), "tickers": int(df["Ticker"].nunique())}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
