#!/usr/bin/env python3
"""
Crypto Research Universe Builder

Builds tiered research universes from the local CoinGecko analytics/profile exports.
The intent is to separate:

- high-signal case studies
- a broader but still quality-controlled research core
- a wider research-broad tier for scaling downstream context enrichment
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_CONTEXT_SCRIPT = _HERE.with_name("crypto_research_context.py")

DEFAULT_ANALYTICS = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_analytics_clean.csv"
DEFAULT_PROFILES = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_profiles_clean.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_research_universe_report.md"

BUCKET_PATTERNS = {
    "stablecoin": [
        "stablecoin",
        "usd stablecoin",
        "fiat-backed stablecoin",
        "crypto-backed stablecoin",
        "stablecoin issuer",
    ],
    "rwa": [
        "real world assets",
        "tokenized assets",
        "tokenized gold",
        "tokenized fund",
        "tokenized money market",
        "commodity-backed",
    ],
    "exchange": [
        "exchange-based tokens",
        "centralized exchange (cex) token",
        "exchange-based",
    ],
    "ai_depin": [
        "artificial intelligence (ai)",
        "depin",
    ],
    "privacy": [
        "privacy blockchain",
        "privacy",
    ],
    "payments": [
        "payment solutions",
    ],
    "defi": [
        "decentralized finance (defi)",
        "decentralized exchange (dex)",
        "automated market maker (amm)",
        "yield farming",
        "governance",
    ],
    "meme": [
        "meme",
        "dog-themed",
    ],
    "interoperability": [
        "infrastructure",
        "oracle",
    ],
}

RESEARCH_CORE_BUCKET_LIMITS = [
    ("stablecoin", 15),
    ("rwa", 15),
    ("exchange", 12),
    ("ai_depin", 12),
    ("privacy", 8),
    ("payments", 8),
    ("defi", 15),
    ("meme", 10),
    ("interoperability", 10),
]

RESEARCH_CORE_EMERGING_LIMITS = [
    ("stablecoin", 6),
    ("rwa", 6),
    ("ai_depin", 5),
    ("meme", 5),
    ("payments", 4),
]

RESEARCH_BROAD_BUCKET_LIMITS = [
    ("stablecoin", 22),
    ("rwa", 22),
    ("exchange", 16),
    ("ai_depin", 18),
    ("privacy", 10),
    ("payments", 10),
    ("defi", 20),
    ("meme", 14),
    ("interoperability", 14),
]

RESEARCH_BROAD_EMERGING_LIMITS = [
    ("stablecoin", 10),
    ("rwa", 8),
    ("ai_depin", 6),
    ("meme", 6),
    ("payments", 5),
]


def _load_context_tools() -> Any:
    spec = importlib.util.spec_from_file_location("crypto_research_context", _CONTEXT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load context helpers from {_CONTEXT_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parse_categories(raw: Any) -> list[str]:
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _prepare_frame(analytics_csv: Path, profiles_csv: Path) -> pd.DataFrame:
    analytics = pd.read_csv(analytics_csv)
    profiles = pd.read_csv(profiles_csv)
    merged = analytics.merge(
        profiles[["coingecko_id", "categories", "homepage"]],
        on="coingecko_id",
        how="left",
    )
    merged["rank_idx"] = range(1, len(merged) + 1)
    merged["categories_list"] = merged["categories"].map(_parse_categories)
    merged["cat_count"] = merged["categories_list"].map(len)
    merged["has_homepage"] = merged["homepage"].fillna("").astype(str).str.strip().ne("")

    for bucket, patterns in BUCKET_PATTERNS.items():
        merged[bucket] = merged["categories_list"].map(
            lambda cats: any(any(pattern in cat.lower() for pattern in patterns) for cat in cats)
        )

    return merged


def _build_case_study_focus(df: pd.DataFrame, ctx: Any) -> tuple[list[str], dict[str, str]]:
    analytics_rows = ctx._read_csv(DEFAULT_ANALYTICS)
    analytics_by_id = ctx._index_by(analytics_rows, "coingecko_id")
    ids = ctx._build_case_study_coin_ids(analytics_rows, analytics_by_id, top_n=85)
    available = set(df["coingecko_id"].tolist())
    out = [coin_id for coin_id in ids if coin_id in available]
    reasons = {coin_id: "existing_case_study_focus" for coin_id in out}
    return out, reasons


def _build_tier(
    df: pd.DataFrame,
    *,
    core_rank_limit: int,
    broad_rank_limit: int,
    bucket_limits: list[tuple[str, int]],
    emerging_limits: list[tuple[str, int]],
    emerging_rank_limit: int,
    emerging_history_min: int,
) -> tuple[list[str], dict[str, str]]:
    quality = df[(df["has_homepage"]) & (df["cat_count"] >= 3)]
    mature = quality[quality["days_of_history"].fillna(0) >= 365]
    emerging = quality[
        (quality["days_of_history"].fillna(0) >= emerging_history_min)
        & (quality["days_of_history"].fillna(0) < 365)
        & (quality["rank_idx"] <= emerging_rank_limit)
    ]

    selected: list[str] = []
    reasons: dict[str, str] = {}
    seen: set[str] = set()

    def add(frame: pd.DataFrame, reason: str, limit: int | None = None) -> None:
        rows = frame.sort_values("rank_idx")
        if limit is not None:
            rows = rows.head(limit)
        for coin_id in rows["coingecko_id"].tolist():
            if coin_id in seen:
                continue
            seen.add(coin_id)
            selected.append(coin_id)
            reasons[coin_id] = reason

    add(mature[mature["rank_idx"] <= core_rank_limit], f"core_rank_{core_rank_limit}")

    for bucket, limit in bucket_limits:
        add(
            mature[(mature[bucket]) & (mature["rank_idx"] <= broad_rank_limit)],
            f"bucket_{bucket}",
            limit,
        )

    for bucket, limit in emerging_limits:
        add(
            emerging[emerging[bucket]],
            f"emerging_{bucket}",
            limit,
        )

    return selected, reasons


def _write_ids(path: Path, coin_ids: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(coin_ids) + "\n", encoding="utf-8")


def _write_selection_csv(
    path: Path,
    df: pd.DataFrame,
    case_focus: list[str],
    case_reasons: dict[str, str],
    research_core: list[str],
    core_reasons: dict[str, str],
    research_broad: list[str],
    broad_reasons: dict[str, str],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "coingecko_id",
        "symbol",
        "name",
        "rank_idx",
        "days_of_history",
        "cat_count",
        "has_homepage",
        "case_study_focus",
        "case_study_reason",
        "research_core",
        "research_core_reason",
        "research_broad",
        "research_broad_reason",
        "bucket_matches",
        "categories_preview",
    ]

    focus_set = set(case_focus)
    core_set = set(research_core)
    broad_set = set(research_broad)

    rows = df[df["coingecko_id"].isin(broad_set | core_set | focus_set)].copy()
    rows = rows.sort_values("rank_idx")

    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for _, row in rows.iterrows():
            coin_id = str(row["coingecko_id"])
            bucket_matches = [bucket for bucket in BUCKET_PATTERNS if bool(row[bucket])]
            writer.writerow(
                {
                    "coingecko_id": coin_id,
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "rank_idx": int(row["rank_idx"]),
                    "days_of_history": int(row["days_of_history"]),
                    "cat_count": int(row["cat_count"]),
                    "has_homepage": int(bool(row["has_homepage"])),
                    "case_study_focus": int(coin_id in focus_set),
                    "case_study_reason": case_reasons.get(coin_id, ""),
                    "research_core": int(coin_id in core_set),
                    "research_core_reason": core_reasons.get(coin_id, ""),
                    "research_broad": int(coin_id in broad_set),
                    "research_broad_reason": broad_reasons.get(coin_id, ""),
                    "bucket_matches": " | ".join(bucket_matches),
                    "categories_preview": " | ".join(row["categories_list"][:6]),
                }
            )


def _tier_bucket_counts(df: pd.DataFrame, ids: list[str]) -> list[tuple[str, int]]:
    subset = df[df["coingecko_id"].isin(set(ids))]
    counts: list[tuple[str, int]] = []
    for bucket in BUCKET_PATTERNS:
        counts.append((bucket, int(subset[bucket].sum())))
    return counts


def _build_report(
    df: pd.DataFrame,
    case_focus: list[str],
    research_core: list[str],
    research_broad: list[str],
    core_reasons: dict[str, str],
    broad_reasons: dict[str, str],
) -> str:
    quality = df[(df["has_homepage"]) & (df["cat_count"] >= 3)]
    mature = quality[quality["days_of_history"].fillna(0) >= 365]
    case_set = set(case_focus)
    core_set = set(research_core)
    broad_set = set(research_broad)

    core_counter = Counter(core_reasons.values())
    broad_counter = Counter(broad_reasons.values())

    lines: list[str] = []
    lines.append("# Crypto Research Universe Report")
    lines.append("")
    lines.append("This report separates the crypto universe into tiers instead of forcing one brittle selector to do every job.")
    lines.append("")
    lines.append("## Quality Floor")
    lines.append("")
    lines.append("- Base quality filter: homepage present and at least 3 parsed category labels.")
    lines.append("- Mature lane: at least 365 days of history.")
    lines.append("- Emerging strategic lane: 120 to 364 days of history and strong rank position.")
    lines.append("- Category heuristics are used for coverage, not as perfect taxonomy labels.")
    lines.append("")
    lines.append("## Universe Sizes")
    lines.append("")
    lines.append(f"- Total analytics rows: {len(df)}")
    lines.append(f"- Quality-filtered rows: {len(quality)}")
    lines.append(f"- Quality + mature rows: {len(mature)}")
    lines.append(f"- Case-study focus tier: {len(case_focus)}")
    lines.append(f"- Research core tier: {len(research_core)}")
    lines.append(f"- Research broad tier: {len(research_broad)}")
    lines.append("")
    lines.append("## Why The Old 88 Was Too Narrow")
    lines.append("")
    lines.append("- The old selector was basically `top ranked assets + manual addons`.")
    lines.append("- That was good for a first context pass, but it was not an explicit research-universe definition.")
    lines.append("- The new tiers separate precision-oriented case studies from broader coverage-oriented research sets.")
    lines.append("")
    lines.append("## Research Core Criteria")
    lines.append("")
    lines.append("- Core lane: top 140 quality-filtered mature assets by local rank ordering.")
    lines.append("- Bucket top-ups inside rank 260: stablecoin 15, rwa 15, exchange 12, ai_depin 12, privacy 8, payments 8, defi 15, meme 10, interoperability 10.")
    lines.append("- Emerging strategic additions inside rank 160: stablecoin 6, rwa 6, ai_depin 5, meme 5, payments 4.")
    lines.append("")
    lines.append("## Research Broad Criteria")
    lines.append("")
    lines.append("- Core lane: top 180 quality-filtered mature assets by local rank ordering.")
    lines.append("- Bucket top-ups inside rank 360: stablecoin 22, rwa 22, exchange 16, ai_depin 18, privacy 10, payments 10, defi 20, meme 14, interoperability 14.")
    lines.append("- Emerging strategic additions inside rank 200: stablecoin 10, rwa 8, ai_depin 6, meme 6, payments 5.")
    lines.append("")
    lines.append("## Core Tier Reason Mix")
    lines.append("")
    for reason, count in core_counter.most_common():
        lines.append(f"- {reason}: {count}")
    lines.append("")
    lines.append("## Broad Tier Reason Mix")
    lines.append("")
    for reason, count in broad_counter.most_common():
        lines.append(f"- {reason}: {count}")
    lines.append("")

    for label, ids in [
        ("Case-Study Focus Bucket Coverage", case_focus),
        ("Research Core Bucket Coverage", research_core),
        ("Research Broad Bucket Coverage", research_broad),
    ]:
        lines.append(f"## {label}")
        lines.append("")
        for bucket, count in _tier_bucket_counts(df, ids):
            lines.append(f"- {bucket}: {count}")
        lines.append("")

    lines.append("## Tier Relations")
    lines.append("")
    lines.append(f"- Focus in core: {len(case_set & core_set)}")
    lines.append(f"- Focus in broad: {len(case_set & broad_set)}")
    lines.append(f"- Core in broad: {len(core_set & broad_set)}")
    lines.append(f"- Core-only additions beyond focus: {len(core_set - case_set)}")
    lines.append(f"- Broad-only additions beyond core: {len(broad_set - core_set)}")
    lines.append("")

    broad_only = df[df["coingecko_id"].isin(broad_set - core_set)].sort_values("rank_idx").head(25)
    if not broad_only.empty:
        lines.append("## Broad-Only Examples")
        lines.append("")
        for _, row in broad_only.iterrows():
            lines.append(
                "- "
                f"{row['coingecko_id']} ({row['symbol']}, {row['name']}), "
                f"rank {int(row['rank_idx'])}, days {int(row['days_of_history'])}, "
                f"categories {' | '.join(row['categories_list'][:4])}"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build tiered crypto research universes from local analytics/profile exports.")
    ap.add_argument("--analytics-csv", type=Path, default=DEFAULT_ANALYTICS)
    ap.add_argument("--profiles-csv", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    ctx = _load_context_tools()
    df = _prepare_frame(args.analytics_csv.resolve(), args.profiles_csv.resolve())

    case_focus, case_reasons = _build_case_study_focus(df, ctx)
    research_core, core_reasons = _build_tier(
        df,
        core_rank_limit=140,
        broad_rank_limit=260,
        bucket_limits=RESEARCH_CORE_BUCKET_LIMITS,
        emerging_limits=RESEARCH_CORE_EMERGING_LIMITS,
        emerging_rank_limit=160,
        emerging_history_min=120,
    )
    research_broad, broad_reasons = _build_tier(
        df,
        core_rank_limit=180,
        broad_rank_limit=360,
        bucket_limits=RESEARCH_BROAD_BUCKET_LIMITS,
        emerging_limits=RESEARCH_BROAD_EMERGING_LIMITS,
        emerging_rank_limit=200,
        emerging_history_min=90,
    )

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    selection_csv = output_dir / "research_universe_selection.csv"
    case_ids_path = output_dir / "case_study_focus_ids.txt"
    core_ids_path = output_dir / "research_core_ids.txt"
    broad_ids_path = output_dir / "research_broad_ids.txt"

    _write_selection_csv(
        selection_csv,
        df,
        case_focus,
        case_reasons,
        research_core,
        core_reasons,
        research_broad,
        broad_reasons,
    )
    _write_ids(case_ids_path, case_focus)
    _write_ids(core_ids_path, research_core)
    _write_ids(broad_ids_path, research_broad)
    args.report_path.resolve().write_text(
        _build_report(df, case_focus, research_core, research_broad, core_reasons, broad_reasons),
        encoding="utf-8",
    )

    print(f"[ok] wrote {selection_csv}")
    print(f"[ok] wrote {case_ids_path}")
    print(f"[ok] wrote {core_ids_path}")
    print(f"[ok] wrote {broad_ids_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
