#!/usr/bin/env python3
"""
Crypto Current Regime Scaleout

Extends the browsed current-regime layer from the top-priority anchor universe to
the full quality-floor crypto universe. Every coin receives an explicit browse
stage and either direct browsed current-regime fields or propagated estimates from
similar anchors.
"""

from __future__ import annotations

import argparse
import csv
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]

DEFAULT_STRUCTURAL_PANEL = _REPO / "data_lake" / "crypto_pipeline" / "context" / "quality_floor_predictive_factor_panel.csv"
DEFAULT_CURRENT_PANEL = _REPO / "data_lake" / "crypto_pipeline" / "context" / "current_regime_top500_summary.csv"
DEFAULT_PREDICTIVE_CATALOG = _REPO / "data_lake" / "crypto_pipeline" / "context" / "predictive_factor_catalog.csv"
DEFAULT_CURRENT_CATALOG = _REPO / "data_lake" / "crypto_pipeline" / "context" / "current_regime_factor_catalog.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_current_regime_scaleout_report.md"

TAILWIND_FACTORS = [
    "has_current_institutional_flow_tailwind",
    "has_current_regulatory_tailwind",
    "has_current_product_or_upgrade_tailwind",
    "has_current_usage_or_adoption_tailwind",
    "has_current_fee_or_revenue_momentum",
    "has_current_liquidity_or_stablecoin_support",
    "has_current_distribution_or_partnership_tailwind",
    "has_current_narrative_momentum",
]

OVERHANG_FACTORS = [
    "has_current_regulatory_overhang",
    "has_current_supply_overhang",
    "has_current_security_or_trust_overhang",
]

HIGH_VALUE_STRUCTURAL_FLAGS = {
    "is_rwa": 2.0,
    "is_stablecoin": 2.0,
    "is_defi": 2.0,
    "is_interoperability": 2.0,
    "is_exchange_token": 2.0,
    "is_ai_depin": 2.0,
    "used_for_settlement": 1.0,
    "used_as_collateral": 1.0,
    "has_high_regulatory_sensitivity": 1.0,
    "is_institutionally_oriented": 1.0,
    "exposed_to_token_unlocks_or_emissions": 1.0,
}


def _safe_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)) and not pd.isna(value):
        return 1 if float(value) >= 0.5 else 0
    text = str(value).strip().lower()
    if text in {"1", "true", "yes"}:
        return 1
    try:
        return 1 if float(text) >= 0.5 else 0
    except ValueError:
        pass
    return 0


def _parse_preview(text: Any) -> list[str]:
    if text is None:
        return []
    raw = str(text).strip()
    if not raw or raw.lower() == "nan":
        return []
    return [part.strip() for part in raw.split("|") if part.strip()]


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _rank_score(rank_idx: int) -> float:
    if rank_idx <= 100:
        return 10.0
    if rank_idx <= 500:
        return 8.0
    if rank_idx <= 1000:
        return 6.0
    if rank_idx <= 2500:
        return 4.0
    if rank_idx <= 5000:
        return 2.0
    return 1.0


def _browse_priority_score(row: pd.Series) -> float:
    score = _rank_score(int(row["rank_idx"]))
    bucket_confidence = str(row.get("bucket_confidence", "")).strip().lower()
    if bucket_confidence == "high":
        score += 2.0
    elif bucket_confidence == "medium":
        score += 1.0
    score += min(3.0, float(row.get("signal_category_count", 0) or 0))
    for factor_name, weight in HIGH_VALUE_STRUCTURAL_FLAGS.items():
        if _safe_int(row.get(factor_name)) == 1:
            score += weight
    return round(score, 3)


def _browse_stage(row: pd.Series, browsed_ids: set[str]) -> tuple[str, str]:
    coin_id = str(row["coingecko_id"])
    if coin_id in browsed_ids:
        return "browsed_anchor", "Direct Gemini current-regime enrichment completed."

    signal_count = int(row.get("signal_category_count", 0) or 0)
    bucket_confidence = str(row.get("bucket_confidence", "")).strip().lower()
    predicted_bucket = str(row.get("predicted_bucket", "")).strip()
    score = float(row["browse_priority_score"])

    if signal_count == 0 and bucket_confidence == "low" and predicted_bucket == "other":
        return "low_signal_defer", "Low-signal tail asset with weak structural classification; defer direct browse unless specifically requested."
    if score >= 16:
        return "browse_priority_high_next", "High structural relevance and/or rank; strong candidate for the next direct browse tranche."
    if score >= 12:
        return "browse_priority_medium_next", "Meaningful structural relevance; direct browse worthwhile after the high-priority tranche."
    if score >= 8:
        return "browse_priority_low_next", "Some structural signal remains, but peer-based propagation is acceptable for now."
    return "propagate_only", "Covered in the universe through propagated current-regime estimates rather than immediate direct browsing."


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _build_queue(df: pd.DataFrame, browsed_ids: set[str]) -> pd.DataFrame:
    queue = df.copy()
    queue["browse_priority_score"] = queue.apply(_browse_priority_score, axis=1)
    stages = queue.apply(lambda row: _browse_stage(row, browsed_ids), axis=1)
    queue["browse_stage"] = [item[0] for item in stages]
    queue["browse_reason"] = [item[1] for item in stages]
    queue["is_browsed_anchor"] = queue["coingecko_id"].map(lambda coin_id: 1 if coin_id in browsed_ids else 0)
    queue = queue.sort_values(["is_browsed_anchor", "browse_priority_score", "rank_idx"], ascending=[False, False, True])
    return queue


def _prepare_sets(df: pd.DataFrame, predictive_factors: list[str]) -> pd.DataFrame:
    frame = df.copy()
    frame["signal_family_set"] = frame["signal_families_preview"].map(lambda text: set(_parse_preview(text)))
    frame["structural_factor_set"] = frame.apply(
        lambda row: {factor for factor in predictive_factors if _safe_int(row.get(factor)) == 1},
        axis=1,
    )
    return frame


def _propagate_row(
    row: pd.Series,
    anchors: list[dict[str, Any]],
    current_factors: list[str],
    bucket_means: dict[str, dict[str, float]],
    global_means: dict[str, float],
) -> dict[str, Any]:
    predicted_bucket = str(row["predicted_bucket"])
    factor_set = row["structural_factor_set"]
    family_set = row["signal_family_set"]
    peer_rows: list[tuple[float, dict[str, Any]]] = []

    for anchor in anchors:
        score = 0.0
        if predicted_bucket == anchor["predicted_bucket"]:
            score += 1.2
        score += _jaccard(factor_set, anchor["structural_factor_set"])
        score += 0.6 * _jaccard(family_set, anchor["signal_family_set"])
        if score > 0:
            peer_rows.append((score, anchor))

    peer_rows.sort(key=lambda item: (-item[0], item[1]["rank_idx"]))
    top_peers = peer_rows[:10]
    peer_count = len(top_peers)
    similarity_top = top_peers[0][0] if top_peers else 0.0
    similarity_avg = sum(score for score, _ in top_peers) / peer_count if peer_count else 0.0

    probs: dict[str, float] = {}
    if top_peers:
        total_weight = sum(score for score, _ in top_peers)
        if total_weight <= 0:
            total_weight = float(peer_count)
        for factor in current_factors:
            probs[factor] = sum(score * anchor[factor] for score, anchor in top_peers) / total_weight
        source_method = "propagated_peer"
    else:
        base = bucket_means.get(predicted_bucket, global_means)
        probs = {factor: float(base.get(factor, 0.0)) for factor in current_factors}
        source_method = "propagated_bucket"

    if source_method == "propagated_peer":
        if peer_count >= 8 and similarity_avg >= 1.3:
            regime_confidence = "medium"
        elif peer_count >= 4 and similarity_avg >= 0.9:
            regime_confidence = "medium"
        else:
            regime_confidence = "low"
    else:
        regime_confidence = "low"

    out: dict[str, Any] = {
        "coingecko_id": row["coingecko_id"],
        "symbol": row["symbol"],
        "name": row["name"],
        "rank_idx": int(row["rank_idx"]),
        "predicted_bucket": predicted_bucket,
        "bucket_confidence": row["bucket_confidence"],
        "signal_families_preview": row["signal_families_preview"],
        "browse_priority_score": row["browse_priority_score"],
        "browse_stage": row["browse_stage"],
        "browse_reason": row["browse_reason"],
        "regime_source_method": source_method,
        "regime_confidence": regime_confidence,
        "anchor_peer_count": peer_count,
        "anchor_similarity_top": round(float(similarity_top), 4),
        "anchor_similarity_avg": round(float(similarity_avg), 4),
        "anchor_peer_ids": " | ".join(anchor["coingecko_id"] for _, anchor in top_peers[:5]),
    }
    for factor in current_factors:
        prob = float(probs.get(factor, 0.0))
        out[f"{factor}__prob"] = round(prob, 4)
        out[factor] = 1 if prob >= 0.6 else 0
    return out


def _build_stats(df: pd.DataFrame, current_factors: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for factor in current_factors:
        positives = df[df[factor] == 1]
        rows.append(
            {
                "factor_name": factor,
                "positive_count": len(positives),
                "mean_probability": round(float(df[f"{factor}__prob"].mean()), 4),
                "sample_positive_coins": " | ".join(positives["coingecko_id"].head(8).tolist()),
            }
        )
    return pd.DataFrame(rows).sort_values(["positive_count", "factor_name"], ascending=[False, True])


def _build_report(queue_df: pd.DataFrame, full_df: pd.DataFrame, current_factors: list[str]) -> str:
    stage_counts = queue_df["browse_stage"].value_counts()
    confidence_counts = full_df["regime_confidence"].value_counts()
    factor_stats = _build_stats(full_df, current_factors)
    tailwind_counts = full_df[TAILWIND_FACTORS].sum(axis=1)
    overhang_counts = full_df[OVERHANG_FACTORS].sum(axis=1)
    net_scores = tailwind_counts - overhang_counts

    lines: list[str] = []
    lines.append("# Crypto Current Regime Scaleout Report")
    lines.append("")
    lines.append("This report extends the direct Gemini current-regime layer from the browsed anchor set to the full quality-floor universe.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Quality-floor universe rows: {len(queue_df)}")
    lines.append(f"- Direct browsed anchors: {int(stage_counts.get('browsed_anchor', 0))}")
    lines.append(f"- High-priority next browse: {int(stage_counts.get('browse_priority_high_next', 0))}")
    lines.append(f"- Medium-priority next browse: {int(stage_counts.get('browse_priority_medium_next', 0))}")
    lines.append(f"- Low-priority next browse: {int(stage_counts.get('browse_priority_low_next', 0))}")
    lines.append(f"- Propagate-only: {int(stage_counts.get('propagate_only', 0))}")
    lines.append(f"- Low-signal defer: {int(stage_counts.get('low_signal_defer', 0))}")
    lines.append("")
    lines.append("## Regime Confidence")
    lines.append("")
    for key in ["high", "medium", "low"]:
        lines.append(f"- {key}: {int(confidence_counts.get(key, 0))}")
    lines.append("")
    lines.append("## Regime Score Summary")
    lines.append("")
    lines.append(f"- Median tailwind count: {round(float(tailwind_counts.median()), 2)}")
    lines.append(f"- Median overhang count: {round(float(overhang_counts.median()), 2)}")
    lines.append(f"- Median net regime score: {round(float(net_scores.median()), 2)}")
    lines.append("")
    lines.append("## Most Common Full-Universe Current Factors")
    lines.append("")
    for _, row in factor_stats.head(12).iterrows():
        lines.append(
            "- "
            f"{row['factor_name']}: positives={int(row['positive_count'])}, "
            f"mean_probability={row['mean_probability']}"
        )
    lines.append("")
    lines.append("## Browse Stage Logic")
    lines.append("")
    lines.append("- No coin is discarded without an explicit browse-stage reason.")
    lines.append("- Directly browsed anchors retain their original current-regime records.")
    lines.append("- Remaining coins receive propagated current-regime factors from structurally similar anchors or bucket-level baselines.")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Scale current-regime factors to the full quality-floor universe.")
    ap.add_argument("--structural-panel-csv", type=Path, default=DEFAULT_STRUCTURAL_PANEL)
    ap.add_argument("--current-panel-csv", type=Path, default=DEFAULT_CURRENT_PANEL)
    ap.add_argument("--predictive-catalog-csv", type=Path, default=DEFAULT_PREDICTIVE_CATALOG)
    ap.add_argument("--current-catalog-csv", type=Path, default=DEFAULT_CURRENT_CATALOG)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    structural_df = pd.read_csv(args.structural_panel_csv.resolve())
    current_df = pd.read_csv(args.current_panel_csv.resolve())
    predictive_catalog = pd.read_csv(args.predictive_catalog_csv.resolve())
    current_catalog = pd.read_csv(args.current_catalog_csv.resolve())

    predictive_factors = predictive_catalog["factor_name"].astype(str).tolist()
    current_factors = current_catalog["factor_name"].astype(str).tolist()

    structural_df = _prepare_sets(structural_df, predictive_factors)
    current_small = current_df[["coingecko_id"] + current_factors + ["confidence", "current_primary_driver", "current_primary_risk", "source_urls"]].copy()
    merged = structural_df.merge(current_small, on="coingecko_id", how="left")

    browsed_ids = set(current_df["coingecko_id"].astype(str).tolist())
    queue_df = _build_queue(merged, browsed_ids)

    anchor_df = queue_df[queue_df["coingecko_id"].isin(browsed_ids)].copy()
    anchors: list[dict[str, Any]] = []
    for _, row in anchor_df.iterrows():
        payload = {
            "coingecko_id": row["coingecko_id"],
            "rank_idx": int(row["rank_idx"]),
            "predicted_bucket": row["predicted_bucket"],
            "signal_family_set": row["signal_family_set"],
            "structural_factor_set": row["structural_factor_set"],
        }
        for factor in current_factors:
            payload[factor] = _safe_int(row.get(factor))
        anchors.append(payload)

    bucket_means: dict[str, dict[str, float]] = {}
    for bucket, sub in anchor_df.groupby("predicted_bucket"):
        bucket_means[str(bucket)] = {factor: float(sub[factor].mean()) for factor in current_factors}
    global_means = {factor: float(anchor_df[factor].mean()) for factor in current_factors}

    output_rows: list[dict[str, Any]] = []
    for _, row in queue_df.iterrows():
        coin_id = str(row["coingecko_id"])
        if coin_id in browsed_ids:
            out: dict[str, Any] = {
                "coingecko_id": coin_id,
                "symbol": row["symbol"],
                "name": row["name"],
                "rank_idx": int(row["rank_idx"]),
                "predicted_bucket": row["predicted_bucket"],
                "bucket_confidence": row["bucket_confidence"],
                "signal_families_preview": row["signal_families_preview"],
                "browse_priority_score": row["browse_priority_score"],
                "browse_stage": row["browse_stage"],
                "browse_reason": row["browse_reason"],
                "regime_source_method": "browsed",
                "regime_confidence": row["confidence"],
                "anchor_peer_count": 0,
                "anchor_similarity_top": 1.0,
                "anchor_similarity_avg": 1.0,
                "anchor_peer_ids": "",
                "current_primary_driver": row.get("current_primary_driver", ""),
                "current_primary_risk": row.get("current_primary_risk", ""),
                "source_urls": row.get("source_urls", ""),
            }
            for factor in current_factors:
                value = _safe_int(row.get(factor))
                out[f"{factor}__prob"] = float(value)
                out[factor] = value
            output_rows.append(out)
            continue
        propagated = _propagate_row(row, anchors, current_factors, bucket_means, global_means)
        propagated["current_primary_driver"] = ""
        propagated["current_primary_risk"] = ""
        propagated["source_urls"] = ""
        output_rows.append(propagated)

    full_df = pd.DataFrame(output_rows).sort_values("rank_idx")
    full_df["tailwind_count"] = full_df[TAILWIND_FACTORS].sum(axis=1)
    full_df["overhang_count"] = full_df[OVERHANG_FACTORS].sum(axis=1)
    full_df["net_regime_score"] = full_df["tailwind_count"] - full_df["overhang_count"]
    stats_df = _build_stats(full_df, current_factors)

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    queue_path = output_dir / "current_regime_universe_queue.csv"
    full_panel_path = output_dir / "current_regime_full_universe_panel.csv"
    stats_path = output_dir / "current_regime_full_universe_factor_stats.csv"
    next_high_ids_path = output_dir / "current_regime_browse_priority_high_ids.txt"

    queue_df.drop(columns=["signal_family_set", "structural_factor_set"]).to_csv(queue_path, index=False)
    full_df.to_csv(full_panel_path, index=False)
    stats_df.to_csv(stats_path, index=False)
    high_next = queue_df[queue_df["browse_stage"] == "browse_priority_high_next"]["coingecko_id"].astype(str).tolist()
    next_high_ids_path.write_text("\n".join(high_next) + ("\n" if high_next else ""), encoding="utf-8")
    args.report_path.resolve().write_text(_build_report(queue_df, full_df, current_factors), encoding="utf-8")

    print(f"[ok] wrote {queue_path}")
    print(f"[ok] wrote {full_panel_path}")
    print(f"[ok] wrote {stats_path}")
    print(f"[ok] wrote {next_high_ids_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
