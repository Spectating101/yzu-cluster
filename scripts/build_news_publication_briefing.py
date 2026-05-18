#!/usr/bin/env python3
"""Build a professor-facing briefing for the crypto news/publication dataset."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


REPO = Path(__file__).resolve().parents[1]
NEWS_ROOT = REPO / "data_lake/crypto_pipeline/news_context"
RESEARCH = NEWS_ROOT / "research_dataset"
EVENT = NEWS_ROOT / "event_research"
RAW = NEWS_ROOT / "raw_archives"
OUT_DIR = REPO / "data_lake/crypto_pipeline/reports"
OUT_MD = OUT_DIR / "CRYPTO_NEWS_PUBLICATION_SECONDARY_DATASET_BRIEF.md"
OUT_JSON = OUT_DIR / "crypto_news_publication_secondary_dataset_manifest.json"


def file_info(path: Path) -> dict:
    return {
        "path": str(path.relative_to(REPO)),
        "exists": path.exists(),
        "bytes": path.stat().st_size if path.exists() else 0,
    }


def canonical_stats(path: Path) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    rows = 0
    date_min = "9999-99-99"
    date_max = "0000-00-00"
    archives: set[str] = set()
    datasets: set[str] = set()
    record_types: dict[str, int] = {}
    publishers: dict[str, int] = {}
    yearly: dict[str, int] = {}
    non_empty_title = 0
    non_empty_text = 0
    non_empty_url = 0
    sentiment_records = 0
    impact_records = 0

    for chunk in pd.read_csv(path, chunksize=100_000, low_memory=False):
        rows += len(chunk)
        dates = chunk["date"].dropna().astype(str)
        dates = dates[dates.str.match(r"^\d{4}-\d{2}-\d{2}$", na=False)]
        if not dates.empty:
            date_min = min(date_min, str(dates.min()))
            date_max = max(date_max, str(dates.max()))
            for y, n in dates.str[:4].value_counts().items():
                yearly[y] = yearly.get(y, 0) + int(n)
        archives.update(chunk["source_archive"].dropna().astype(str).unique())
        datasets.update(chunk["source_dataset"].dropna().astype(str).unique())
        for col, target in [("record_type", record_types), ("publisher", publishers)]:
            vc = chunk[col].dropna().astype(str).value_counts()
            for k, v in vc.items():
                target[k] = target.get(k, 0) + int(v)
        non_empty_title += int(chunk["title"].fillna("").astype(str).str.len().gt(0).sum())
        non_empty_text += int(chunk["text"].fillna("").astype(str).str.len().gt(0).sum())
        non_empty_url += int(chunk["url"].fillna("").astype(str).str.len().gt(0).sum())
        sentiment_records += int(chunk["sentiment_score"].notna().sum() + chunk["sentiment_label"].notna().sum())
        impact_records += int(chunk["impact_score"].notna().sum())

    source_df = pd.read_csv(RESEARCH / "source_coverage.csv")
    daily_df = pd.read_csv(RESEARCH / "daily_source_panel.csv")
    stats = {
        "rows": rows,
        "date_min": date_min,
        "date_max": date_max,
        "source_archive_count": len(archives),
        "source_archives": sorted(archives),
        "source_dataset_count": len(datasets),
        "non_empty_title": non_empty_title,
        "non_empty_text": non_empty_text,
        "non_empty_url": non_empty_url,
        "sentiment_field_observations": sentiment_records,
        "impact_score_records": impact_records,
        "top_record_types": sorted(record_types.items(), key=lambda kv: kv[1], reverse=True)[:15],
        "top_publishers": sorted(publishers.items(), key=lambda kv: kv[1], reverse=True)[:20],
        "yearly_records": dict(sorted(yearly.items())),
        "daily_panel_rows": int(len(daily_df)),
        "daily_panel_min_date": str(daily_df["date"].dropna().min()),
        "daily_panel_max_date": str(daily_df["date"].dropna().max()),
    }
    return stats, source_df, daily_df


def event_stats() -> dict:
    panel = pd.read_csv(EVENT / "news_social_factor_panel.csv", low_memory=False)
    summary = pd.read_csv(EVENT / "event_study_summary.csv")
    corr = pd.read_csv(EVENT / "factor_return_correlations.csv")
    return {
        "factor_panel_rows": int(len(panel)),
        "factor_panel_columns": int(len(panel.columns)),
        "factor_panel_min_date": str(panel["date"].min()),
        "factor_panel_max_date": str(panel["date"].max()),
        "factor_panel_coins": int(panel["cg_id"].nunique()),
        "event_study_rows": int(len(summary)),
        "top_event_study": summary.sort_values(["t_stat", "n"], ascending=[False, False]).head(10).to_dict("records"),
        "top_correlations": corr.reindex(corr["spearman_corr"].abs().sort_values(ascending=False).index).head(10).to_dict("records"),
    }


def raw_stats() -> dict:
    files = [p for p in RAW.rglob("*") if p.is_file()]
    by_archive: dict[str, int] = {}
    for p in files:
        rel = p.relative_to(RAW)
        key = rel.parts[0] if rel.parts else "unknown"
        by_archive[key] = by_archive.get(key, 0) + p.stat().st_size
    return {
        "raw_file_count": len(files),
        "raw_total_bytes": sum(p.stat().st_size for p in files),
        "raw_bytes_by_archive": dict(sorted(by_archive.items(), key=lambda kv: kv[1], reverse=True)),
    }


def fmt_bytes(n: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(n)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{n} B"


def write_markdown(manifest: dict, source_df: pd.DataFrame) -> None:
    canonical = manifest["canonical"]
    event = manifest["event_research"]
    raw = manifest["raw_archives"]
    files = manifest["files"]

    lines = [
        "# Crypto News / Publication Secondary Dataset Brief",
        "",
        "## Executive Summary",
        "",
        (
            "This is a secondary research dataset linking crypto news, publication archives, "
            "sentiment/impact labels, GDELT mentions, and downstream coin-day event-study features. "
            "It is separate from the CoinGecko price archive and can be presented as an additional "
            "research asset for event studies, narrative analysis, and price-reaction modeling."
        ),
        "",
        "## Core Coverage",
        "",
        f"- Canonical records: {canonical['rows']:,}",
        f"- Canonical period: {canonical['date_min']} to {canonical['date_max']}",
        f"- Source archive families: {canonical['source_archive_count']} ({', '.join(canonical['source_archives'])})",
        f"- Source datasets: {canonical['source_dataset_count']}",
        f"- Raw archive files: {raw['raw_file_count']:,}",
        f"- Raw archive size: {fmt_bytes(raw['raw_total_bytes'])}",
        f"- Canonical dataset size: {fmt_bytes(files['canonical_news_events']['bytes'])}",
        "",
        "## Field Completeness",
        "",
        f"- Non-empty titles: {canonical['non_empty_title']:,}",
        f"- Non-empty text bodies/reasons: {canonical['non_empty_text']:,}",
        f"- Non-empty URLs: {canonical['non_empty_url']:,}",
        f"- Sentiment field observations: {canonical['sentiment_field_observations']:,}",
        f"- Impact-score records: {canonical['impact_score_records']:,}",
        "",
        "## Event Research Layer",
        "",
        f"- Coin-day factor panel rows: {event['factor_panel_rows']:,}",
        f"- Coin-day factor panel columns: {event['factor_panel_columns']:,}",
        f"- Factor panel period: {event['factor_panel_min_date']} to {event['factor_panel_max_date']}",
        f"- Coins in factor panel: {event['factor_panel_coins']:,}",
        f"- Event-study summary rows: {event['event_study_rows']:,}",
        "",
        "## Top Event-Study Signals",
        "",
        "| signal | horizon | n | mean_return | win_rate | t_stat |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in event["top_event_study"][:8]:
        lines.append(
            f"| {row['signal']} | {int(row['horizon'])} | {int(row['n']):,} | "
            f"{float(row['mean_return']):.6f} | {float(row['win_rate']):.3f} | {float(row['t_stat']):.3f} |"
        )

    lines.extend(
        [
            "",
            "## Strongest Factor/Return Rank Correlations",
            "",
            "| factor | horizon | n | spearman_corr |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in event["top_correlations"][:8]:
        lines.append(
            f"| {row['factor']} | {int(row['horizon'])} | {int(row['n']):,} | {float(row['spearman_corr']):.6f} |"
        )

    kept = source_df[source_df["metric"] == "rows_kept"].copy()
    kept["value"] = pd.to_numeric(kept["value"], errors="coerce").fillna(0)
    kept = kept.sort_values("value", ascending=False).head(15)
    lines.extend(["", "## Largest Source Datasets", "", "| source_dataset | rows_kept |", "|---|---:|"])
    for _, row in kept.iterrows():
        lines.append(f"| {row['source_dataset']} | {int(row['value']):,} |")

    lines.extend(
        [
            "",
            "## Main Files",
            "",
            f"- Canonical events: `{files['canonical_news_events']['path']}`",
            f"- Daily source panel: `{files['daily_source_panel']['path']}`",
            f"- Source coverage: `{files['source_coverage']['path']}`",
            f"- Coin-day factor panel: `{files['news_social_factor_panel']['path']}`",
            f"- Event-study summary: `{files['event_study_summary']['path']}`",
            f"- Factor correlations: `{files['factor_return_correlations']['path']}`",
            "",
            "## Caveats",
            "",
            "- This is a consolidated secondary dataset from heterogeneous public archives, not a single licensed news feed.",
            "- Some records are model-labeled sentiment/impact rows rather than full human-written articles.",
            "- URL/date/publisher completeness varies by source.",
            "- Coin matching in the event layer is heuristic and should be treated as research-grade, not ground-truth entity resolution.",
            "- The event-study layer currently uses price data through `2026-03-19`; the canonical news dataset itself reaches `2026-05-05`.",
            "",
            "## Value Proposition",
            "",
            (
                "This dataset adds a non-price explanatory layer: news intensity, sentiment, impact labels, "
                "publisher/source diversity, GDELT mentions, and Reddit-derived context. It is useful for "
                "event studies, narrative-cycle research, factor construction, and checking whether media/social "
                "attention predicts forward crypto returns."
            ),
        ]
    )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = {
        "canonical_news_events": file_info(RESEARCH / "canonical_news_events.csv"),
        "source_coverage": file_info(RESEARCH / "source_coverage.csv"),
        "daily_source_panel": file_info(RESEARCH / "daily_source_panel.csv"),
        "news_social_factor_panel": file_info(EVENT / "news_social_factor_panel.csv"),
        "event_study_summary": file_info(EVENT / "event_study_summary.csv"),
        "factor_return_correlations": file_info(EVENT / "factor_return_correlations.csv"),
    }
    canonical, source_df, _daily_df = canonical_stats(RESEARCH / "canonical_news_events.csv")
    manifest = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "files": files,
        "canonical": canonical,
        "event_research": event_stats(),
        "raw_archives": raw_stats(),
    }
    OUT_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_markdown(manifest, source_df)
    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
