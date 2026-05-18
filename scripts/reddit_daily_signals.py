#!/usr/bin/env python3
"""
Build a daily Reddit ticker signals panel (backtestable features).

Inputs:
  - Reddit submissions JSONL (from reddit_fetch_listing_jsonl.py or similar)
  - A universe tickers file (one ticker per line)

Output (Parquet):
  Date, Ticker,
    mention_posts, mention_occurrences,
    unique_authors,
    upvote_weighted_mentions,
    sentiment_mean, sentiment_upvote_weighted,
    novelty_30d_ratio, novelty_30d_z

Notes:
  - This uses public listing JSON exports => recent history only unless you run it daily and accumulate.
  - "Novelty" is computed relative to trailing 30 days of the *existing output panel* if present.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Set, Tuple

import numpy as np
import pandas as pd


TICKER_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])\$?([A-Z]{1,5})(?![A-Za-z0-9])")
URL_RE = re.compile(r"https?://\\S+")

_POS = {
    "buy",
    "bull",
    "bullish",
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
    "beat",
    "beats",
    "upside",
}
_NEG = {
    "sell",
    "bear",
    "bearish",
    "dump",
    "puts",
    "red",
    "crash",
    "rug",
    "short",
    "weak",
    "overvalued",
    "fraud",
    "dead",
    "miss",
    "misses",
    "downside",
}


def iter_jsonl(path: Path) -> Iterator[Dict[str, Any]]:
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


def _parse_tickers_file(path: Path) -> Set[str]:
    tickers: Set[str] = set()
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        tickers.add(line.split()[0].strip().upper())
    return tickers


def _parse_dt(obj: Dict[str, Any]) -> Optional[pd.Timestamp]:
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


def _text(obj: Dict[str, Any]) -> str:
    parts: List[str] = []
    for k in ["title", "selftext", "body", "text"]:
        v = obj.get(k)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    return "\n".join(parts)


def _simple_sentiment(text: str) -> float:
    if not text:
        return 0.0
    # Remove URLs to reduce noise.
    text = URL_RE.sub(" ", text)
    tokens = re.findall(r"[A-Za-z]+", text.lower())
    if not tokens:
        return 0.0
    pos = sum(1 for t in tokens if t in _POS)
    neg = sum(1 for t in tokens if t in _NEG)
    return float((pos - neg) / max(1.0, math.sqrt(len(tokens))))


def _safe_int(x: Any) -> int:
    try:
        return int(x)
    except Exception:
        return 0


def _extract_mentions(text: str, universe: Set[str]) -> Dict[str, int]:
    if not text:
        return {}
    out: Dict[str, int] = {}
    for m in TICKER_TOKEN_RE.findall(text):
        t = m.upper()
        if t in universe:
            out[t] = out.get(t, 0) + 1
    return out


def _load_existing_panel(panel_path: Path) -> Optional[pd.DataFrame]:
    if not panel_path.exists():
        return None
    try:
        if panel_path.suffix.lower() in {".parquet", ".pq"}:
            return pd.read_parquet(panel_path)
        if panel_path.suffix.lower() in {".csv"}:
            return pd.read_csv(panel_path, parse_dates=["Date"])
    except Exception:
        return None
    return None


def _compute_novelty(
    new_panel: pd.DataFrame,
    *,
    existing_panel: Optional[pd.DataFrame],
    lookback_days: int = 30,
) -> pd.DataFrame:
    out = new_panel.copy()
    out["novelty_30d_ratio"] = np.nan
    out["novelty_30d_z"] = np.nan
    if existing_panel is None or existing_panel.empty:
        return out

    hist = existing_panel.copy()
    if "Date" not in hist.columns:
        return out
    hist["Date"] = pd.to_datetime(hist["Date"], errors="coerce")
    hist = hist.dropna(subset=["Date", "Ticker"]).copy()
    hist["Ticker"] = hist["Ticker"].astype(str)

    # Use mention_posts as the baseline series when available, else fall back.
    base_col = "mention_posts" if "mention_posts" in hist.columns else ("Mentions" if "Mentions" in hist.columns else None)
    if base_col is None:
        return out
    hist[base_col] = pd.to_numeric(hist[base_col], errors="coerce").fillna(0.0)

    # Rolling mean/std per ticker over prior days (exclude current day).
    hist = hist.sort_values(["Ticker", "Date"])
    g = hist.groupby("Ticker", group_keys=False)
    hist["lb_mean"] = g[base_col].transform(lambda s: s.shift(1).rolling(lookback_days, min_periods=5).mean())
    hist["lb_std"] = g[base_col].transform(lambda s: s.shift(1).rolling(lookback_days, min_periods=5).std(ddof=0))

    key = hist[["Date", "Ticker", "lb_mean", "lb_std"]].dropna(subset=["Date", "Ticker"])
    merged = out.merge(key, on=["Date", "Ticker"], how="left")
    x = pd.to_numeric(merged["mention_posts"], errors="coerce").fillna(0.0)
    mu = pd.to_numeric(merged["lb_mean"], errors="coerce")
    sig = pd.to_numeric(merged["lb_std"], errors="coerce")

    merged["novelty_30d_ratio"] = x / (mu.fillna(0.0) + 1.0)
    merged["novelty_30d_z"] = (x - mu) / (sig.replace(0.0, np.nan))
    merged = merged.drop(columns=["lb_mean", "lb_std"], errors="ignore")
    return merged


def main() -> int:
    ap = argparse.ArgumentParser(description="Build daily Reddit ticker signals panel.")
    ap.add_argument("--in-jsonl", type=Path, required=True, nargs="+", help="One or more JSONL files (posts and/or comments).")
    ap.add_argument("--tickers-file", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("data_lake/sentiment/reddit_daily_signals.parquet"))
    ap.add_argument("--append", action="store_true", help="Append/merge into existing out file if present.")
    ap.add_argument("--lookback-days", type=int, default=30)
    ap.add_argument("--max-lines", type=int, default=0, help="Cap lines for speed (0=all).")
    ap.add_argument("--min-upvotes", type=int, default=0, help="Drop events with score below this.")
    ap.add_argument("--exclude-authors", nargs="*", default=["AutoModerator", "VisualMod"], help="Drop events from these authors.")
    ap.add_argument("--comment-score-mult", type=float, default=0.5, help="Multiply comment scores by this for weighting.")
    ap.add_argument(
        "--require-dollar-short-tickers",
        action="store_true",
        help="If set, tickers of length <=2 must be prefixed with '$' in text to count as mentions.",
    )
    args = ap.parse_args()

    universe = _parse_tickers_file(args.tickers_file)
    if not universe:
        print("Empty universe tickers.")
        return 2

    exclude_authors = {str(a).strip() for a in (args.exclude_authors or []) if str(a).strip()}
    rows: List[Tuple[pd.Timestamp, str, str, int, int, int, float, int]] = []
    n = 0
    for in_path in args.in_jsonl:
        for obj in iter_jsonl(Path(in_path)):
            n += 1
            if int(args.max_lines) > 0 and n > int(args.max_lines):
                break
            dt = _parse_dt(obj)
            if dt is None or pd.isna(dt):
                continue
            score = _safe_int(obj.get("score", obj.get("ups", 0)))
            if score < int(args.min_upvotes):
                continue

            text = _text(obj)
            if not text:
                continue
            # Optional strictness: short tickers can be very noisy (I, IT, ON, ...).
            if args.require_dollar_short_tickers:
                mentions: Dict[str, int] = {}
                for m in TICKER_TOKEN_RE.findall(text):
                    t = m.upper()
                    if t not in universe:
                        continue
                    # Re-scan for exact token with optional '$' prefix.
                    if len(t) <= 2:
                        if f"${t}" not in text:
                            continue
                    mentions[t] = mentions.get(t, 0) + 1
            else:
                mentions = _extract_mentions(text, universe)
            if not mentions:
                continue

            author = str(obj.get("author") or obj.get("user") or "")
            if author and author in exclude_authors:
                continue
            subreddit = str(obj.get("subreddit") or "")
            _ = subreddit  # kept for future per-subreddit slicing
            sent = _simple_sentiment(text)

            is_comment = 1 if (isinstance(obj.get("body"), str) and not isinstance(obj.get("title"), str)) else 0
            eff_score = score
            if is_comment:
                eff_score = int(round(float(score) * float(args.comment_score_mult)))

            day = pd.Timestamp(dt.date())
            for ticker, occ in mentions.items():
                rows.append((day, ticker, author, eff_score, occ, 1, sent, is_comment))
        if int(args.max_lines) > 0 and n > int(args.max_lines):
            break

    if not rows:
        print("No rows emitted.")
        return 2

    df = pd.DataFrame(
        rows,
        columns=[
            "Date",
            "Ticker",
            "author",
            "score",
            "mention_occurrences",
            "mention_posts",
            "sentiment",
            "is_comment",
        ],
    )

    # Aggregate per Date/Ticker.
    df["score"] = pd.to_numeric(df["score"], errors="coerce").fillna(0.0).clip(lower=0.0)
    df["score_x_occ"] = df["score"] * pd.to_numeric(df["mention_occurrences"], errors="coerce").fillna(0.0).clip(lower=0.0)
    agg = (
        df.groupby(["Date", "Ticker"], as_index=False)
        .agg(
            mention_posts=("mention_posts", "sum"),
            mention_occurrences=("mention_occurrences", "sum"),
            mention_comments=("is_comment", "sum"),
            unique_authors=("author", lambda s: int(len({a for a in s if a}))),
            upvote_weighted_mentions=("score_x_occ", "sum"),
            sentiment_mean=("sentiment", "mean"),
            sentiment_upvote_weighted=(
                "sentiment",
                lambda s: float(
                    np.average(
                        pd.to_numeric(s, errors="coerce").fillna(0.0),
                        weights=np.maximum(1.0, df.loc[s.index, "score_x_occ"].astype(float)),
                    )
                ),
            ),
        )
        .sort_values(["Date", "Ticker"])
        .reset_index(drop=True)
    )
    agg["comment_frac"] = (pd.to_numeric(agg["mention_comments"], errors="coerce").fillna(0.0) / pd.to_numeric(agg["mention_posts"], errors="coerce").replace(0.0, np.nan)).fillna(0.0)

    out_path: Path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    existing = _load_existing_panel(out_path) if args.append else None

    if args.append and existing is not None and not existing.empty:
        combined = pd.concat([existing, agg], ignore_index=True)
        combined["Date"] = pd.to_datetime(combined["Date"], errors="coerce")
        combined["Ticker"] = combined["Ticker"].astype(str)
        # Prefer the newest row per (Date,Ticker) (idempotent re-runs).
        combined = combined.sort_values(["Date", "Ticker"]).drop_duplicates(["Date", "Ticker"], keep="last")
        agg = combined.sort_values(["Date", "Ticker"]).reset_index(drop=True)

    # Compute novelty against the panel we are about to write (safe: uses trailing window via shift(1)).
    agg = _compute_novelty(agg, existing_panel=agg, lookback_days=int(args.lookback_days))

    if out_path.suffix.lower() not in {".parquet", ".pq"}:
        out_path = out_path.with_suffix(".parquet")

    agg.to_parquet(out_path, index=False)
    # Also write a CSV alongside for easy inspection.
    agg.to_csv(out_path.with_suffix(".csv"), index=False)

    print(f"✅ wrote {len(agg)} rows ({agg['Ticker'].nunique()} tickers) to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
