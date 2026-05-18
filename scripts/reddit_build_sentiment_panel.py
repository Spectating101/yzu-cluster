#!/usr/bin/env python3
"""
Build a daily ticker sentiment panel from Reddit JSONL exports.

Input JSONL: one object per line, with any of these fields:
  - created_utc (seconds) OR created (ISO) OR createdAt (ISO)
  - title, selftext, body (text)
  - score (int), ups (int), num_comments (int)
  - subreddit (str)

Output CSV schema:
  Date, Ticker, Mentions, Weight, Sentiment

This does NOT fetch from Reddit; it converts existing exports so we can backtest.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Set, Tuple

import numpy as np
import pandas as pd


TICKER_RE = re.compile(r"\b[A-Z]{1,5}\b")


def _parse_tickers_file(path: Path) -> Set[str]:
    tickers: Set[str] = set()
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.add(line.split()[0].strip().upper())
    return tickers


def _parse_dt(obj: Dict) -> Optional[pd.Timestamp]:
    if "created_utc" in obj and obj["created_utc"] is not None:
        try:
            return pd.Timestamp(datetime.fromtimestamp(float(obj["created_utc"]), tz=timezone.utc)).tz_convert(None)
        except Exception:
            pass
    for k in ["created", "createdAt", "created_at", "datetime", "date"]:
        if k in obj and obj[k]:
            try:
                return pd.to_datetime(obj[k], utc=True, errors="coerce").tz_convert(None)
            except Exception:
                continue
    return None


def _text(obj: Dict) -> str:
    parts = []
    for k in ["title", "selftext", "body", "text"]:
        v = obj.get(k)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    return "\n".join(parts)


def _weight(obj: Dict) -> float:
    score = obj.get("score", obj.get("ups", 0))
    comments = obj.get("num_comments", obj.get("comments", 0))
    try:
        s = max(0.0, float(score))
    except Exception:
        s = 0.0
    try:
        c = max(0.0, float(comments))
    except Exception:
        c = 0.0
    # Heavy-tailed dampening.
    return float(np.log1p(s) + 0.5 * np.log1p(c))


_POS = {
    "buy",
    "bull",
    "moon",
    "mooning",
    "rocket",
    "pump",
    "calls",
    "green",
    "breakout",
    "rip",
    "ripping",
    "undervalued",
    "long",
    "strong",
}
_NEG = {
    "sell",
    "bear",
    "dump",
    "puts",
    "red",
    "crash",
    "rug",
    "short",
    "weak",
    "overvalued",
    "dead",
}


def _simple_sentiment(text: str) -> float:
    # Crude polarity proxy: (pos-neg)/sqrt(n_tokens)
    if not text:
        return 0.0
    tokens = re.findall(r"[A-Za-z]+", text.lower())
    if not tokens:
        return 0.0
    pos = sum(1 for t in tokens if t in _POS)
    neg = sum(1 for t in tokens if t in _NEG)
    return float((pos - neg) / max(1.0, np.sqrt(len(tokens))))


def iter_jsonl(path: Path) -> Iterator[Dict]:
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if isinstance(obj, dict):
                yield obj


def main() -> int:
    ap = argparse.ArgumentParser(description="Build daily ticker sentiment panel from Reddit JSONL.")
    ap.add_argument("--in-jsonl", type=Path, required=True)
    ap.add_argument("--tickers-file", type=Path, required=True, help="Universe tickers to match mentions against.")
    ap.add_argument("--out", type=Path, default=Path("data_lake/reddit_sentiment_panel.csv"))
    ap.add_argument("--min-weight", type=float, default=0.0, help="Drop events with weight below this.")
    ap.add_argument("--max-lines", type=int, default=0, help="Cap lines for speed (0=all).")
    args = ap.parse_args()

    universe = _parse_tickers_file(args.tickers_file)
    if not universe:
        print("Empty universe tickers.")
        return 2

    rows = []
    n = 0
    for obj in iter_jsonl(args.in_jsonl):
        n += 1
        if int(args.max_lines) > 0 and n > int(args.max_lines):
            break
        dt = _parse_dt(obj)
        if dt is None or pd.isna(dt):
            continue
        text = _text(obj)
        if not text:
            continue
        w = _weight(obj)
        if w < float(args.min_weight):
            continue
        sent = _simple_sentiment(text)

        tickers = set(TICKER_RE.findall(text))
        tickers = {t for t in tickers if t in universe}
        if not tickers:
            continue

        day = pd.Timestamp(dt.date())
        for t in tickers:
            rows.append((day, t, 1, w, sent))

    if not rows:
        print("No rows emitted.")
        return 2

    df = pd.DataFrame(rows, columns=["Date", "Ticker", "Mentions", "Weight", "Sentiment"])
    agg = (
        df.groupby(["Date", "Ticker"], as_index=False)
        .agg({"Mentions": "sum", "Weight": "sum", "Sentiment": "mean"})
        .sort_values(["Date", "Ticker"])
        .reset_index(drop=True)
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    agg.to_csv(args.out, index=False)
    print(f"✅ wrote {len(agg)} rows ({agg['Ticker'].nunique()} tickers) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

