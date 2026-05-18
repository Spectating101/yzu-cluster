#!/usr/bin/env python3
"""
Crypto Case Study Feature Matrix Builder

Normalizes the Gemini-enriched case-study context into a fixed feature matrix that
is easier to model and compare across crypto asset types.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_CONTEXT_SCRIPT = _HERE.with_name("crypto_research_context.py")

DEFAULT_INPUT_CSV = _REPO / "data_lake" / "crypto_pipeline" / "context" / "case_study_context_summary.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_case_study_feature_report.md"

BENCHMARK_BUCKETS = [
    "store_of_value",
    "smart_contract_l1",
    "stablecoin",
    "payments",
    "exchange_token",
    "rwa",
    "defi",
    "privacy",
    "ai_depin",
    "interoperability",
    "identity",
    "meme_speculative",
    "other",
]


def _load_context_tools() -> Any:
    spec = importlib.util.spec_from_file_location("crypto_research_context", _CONTEXT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load context helpers from {_CONTEXT_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _build_feature_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("You are normalizing an existing crypto case-study dataset into thesis-friendly feature columns.")
    lines.append("Do not browse the web. Use only the structured records below.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "coins": [')
    lines.append("    {")
    lines.append('      "coingecko_id": "string",')
    lines.append('      "symbol": "string",')
    lines.append('      "name": "string",')
    lines.append('      "benchmark_bucket": "string",')
    lines.append('      "fundamental_archetype": "string",')
    lines.append('      "case_study_theme": "string",')
    lines.append('      "backing_model": "string",')
    lines.append('      "value_accrual_model": "string",')
    lines.append('      "primary_demand_driver": "string",')
    lines.append('      "supply_regime": "string",')
    lines.append('      "institutional_relevance": "low|medium|high",')
    lines.append('      "regulatory_sensitivity": "low|medium|high",')
    lines.append('      "centralization_dependency": "low|medium|high",')
    lines.append('      "narrative_durability": "low|medium|high",')
    lines.append('      "thesis_use_case": "string",')
    lines.append('      "relative_comparison_targets": ["string"]')
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")
    lines.append("Constraints:")
    lines.append(f"- benchmark_bucket must be one of: {', '.join(BENCHMARK_BUCKETS)}.")
    lines.append("- Keep fundamental_archetype, case_study_theme, backing_model, value_accrual_model, primary_demand_driver, and supply_regime concise.")
    lines.append("- Keep thesis_use_case to a short phrase, not a paragraph.")
    lines.append("- relative_comparison_targets should contain up to 3 coingecko_id values that are useful comparators from the provided records.")
    lines.append("- Use consistent labels across coins whenever possible.")
    lines.append("")
    lines.append("Structured records:")
    trimmed_rows: list[dict[str, Any]] = []
    for row in rows:
        trimmed_rows.append(
            {
                "coingecko_id": row.get("coingecko_id", ""),
                "symbol": row.get("symbol", ""),
                "name": row.get("name", ""),
                "coin_type": row.get("coin_type", ""),
                "narrative_bucket": row.get("narrative_bucket", ""),
                "economic_role": row.get("economic_role", ""),
                "return_90d_pct": row.get("return_90d_pct", ""),
                "sharpe_ratio_90d": row.get("sharpe_ratio_90d", ""),
                "volatility_90d_ann_pct": row.get("volatility_90d_ann_pct", ""),
                "drawdown_from_ath_pct": row.get("drawdown_from_ath_pct", ""),
                "cagr_pct": row.get("cagr_pct", ""),
                "current_catalysts": row.get("current_catalysts", ""),
                "main_risks": row.get("main_risks", ""),
                "analytics_explanation": row.get("analytics_explanation", ""),
            }
        )
    lines.append(json.dumps(trimmed_rows, ensure_ascii=False))
    return "\n".join(lines)


def _write_feature_csv(path: Path, features: list[dict[str, Any]], local_rows_by_id: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "coingecko_id",
        "symbol",
        "name",
        "benchmark_bucket",
        "fundamental_archetype",
        "case_study_theme",
        "backing_model",
        "value_accrual_model",
        "primary_demand_driver",
        "supply_regime",
        "institutional_relevance",
        "regulatory_sensitivity",
        "centralization_dependency",
        "narrative_durability",
        "thesis_use_case",
        "relative_comparison_targets",
        "coin_type",
        "narrative_bucket",
        "economic_role",
        "days_of_history",
        "price_usd",
        "return_90d_pct",
        "sharpe_ratio_90d",
        "volatility_90d_ann_pct",
        "drawdown_from_ath_pct",
        "cagr_pct",
        "current_catalysts",
        "main_risks",
        "analytics_explanation",
        "source_urls",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for item in features:
            coin_id = item["coingecko_id"]
            local = local_rows_by_id[coin_id]
            writer.writerow(
                {
                    "coingecko_id": coin_id,
                    "symbol": item.get("symbol", local.get("symbol", "")),
                    "name": item.get("name", local.get("name", "")),
                    "benchmark_bucket": item.get("benchmark_bucket", ""),
                    "fundamental_archetype": item.get("fundamental_archetype", ""),
                    "case_study_theme": item.get("case_study_theme", ""),
                    "backing_model": item.get("backing_model", ""),
                    "value_accrual_model": item.get("value_accrual_model", ""),
                    "primary_demand_driver": item.get("primary_demand_driver", ""),
                    "supply_regime": item.get("supply_regime", ""),
                    "institutional_relevance": item.get("institutional_relevance", ""),
                    "regulatory_sensitivity": item.get("regulatory_sensitivity", ""),
                    "centralization_dependency": item.get("centralization_dependency", ""),
                    "narrative_durability": item.get("narrative_durability", ""),
                    "thesis_use_case": item.get("thesis_use_case", ""),
                    "relative_comparison_targets": " | ".join(item.get("relative_comparison_targets", [])),
                    "coin_type": local.get("coin_type", ""),
                    "narrative_bucket": local.get("narrative_bucket", ""),
                    "economic_role": local.get("economic_role", ""),
                    "days_of_history": local.get("days_of_history", ""),
                    "price_usd": local.get("price_usd", ""),
                    "return_90d_pct": local.get("return_90d_pct", ""),
                    "sharpe_ratio_90d": local.get("sharpe_ratio_90d", ""),
                    "volatility_90d_ann_pct": local.get("volatility_90d_ann_pct", ""),
                    "drawdown_from_ath_pct": local.get("drawdown_from_ath_pct", ""),
                    "cagr_pct": local.get("cagr_pct", ""),
                    "current_catalysts": local.get("current_catalysts", ""),
                    "main_risks": local.get("main_risks", ""),
                    "analytics_explanation": local.get("analytics_explanation", ""),
                    "source_urls": local.get("source_urls", ""),
                }
            )


def _group_stats(rows: list[dict[str, Any]], group_field: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = (row.get(group_field) or "").strip() or "unknown"
        grouped[key].append(row)

    stats_rows: list[dict[str, Any]] = []
    for key, members in grouped.items():
        sharpe_values = [_safe_float(item.get("sharpe_ratio_90d")) for item in members]
        sharpe_values = [value for value in sharpe_values if value is not None]
        return_values = [_safe_float(item.get("return_90d_pct")) for item in members]
        return_values = [value for value in return_values if value is not None]
        vol_values = [_safe_float(item.get("volatility_90d_ann_pct")) for item in members]
        vol_values = [value for value in vol_values if value is not None]
        drawdown_values = [_safe_float(item.get("drawdown_from_ath_pct")) for item in members]
        drawdown_values = [value for value in drawdown_values if value is not None]
        cagr_values = [_safe_float(item.get("cagr_pct")) for item in members]
        cagr_values = [value for value in cagr_values if value is not None]

        stats_rows.append(
            {
                "group_type": group_field,
                "group_value": key,
                "coin_count": len(members),
                "mean_return_90d_pct": round(statistics.mean(return_values), 3) if return_values else "",
                "median_return_90d_pct": round(statistics.median(return_values), 3) if return_values else "",
                "mean_sharpe_ratio_90d": round(statistics.mean(sharpe_values), 3) if sharpe_values else "",
                "median_sharpe_ratio_90d": round(statistics.median(sharpe_values), 3) if sharpe_values else "",
                "mean_volatility_90d_ann_pct": round(statistics.mean(vol_values), 3) if vol_values else "",
                "median_volatility_90d_ann_pct": round(statistics.median(vol_values), 3) if vol_values else "",
                "mean_drawdown_from_ath_pct": round(statistics.mean(drawdown_values), 3) if drawdown_values else "",
                "median_drawdown_from_ath_pct": round(statistics.median(drawdown_values), 3) if drawdown_values else "",
                "mean_cagr_pct": round(statistics.mean(cagr_values), 3) if cagr_values else "",
                "median_cagr_pct": round(statistics.median(cagr_values), 3) if cagr_values else "",
                "representative_coins": " | ".join(item.get("coingecko_id", "") for item in members[:6]),
            }
        )

    return sorted(stats_rows, key=lambda item: (-int(item["coin_count"]), item["group_value"]))


def _write_group_stats_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "group_type",
        "group_value",
        "coin_count",
        "mean_return_90d_pct",
        "median_return_90d_pct",
        "mean_sharpe_ratio_90d",
        "median_sharpe_ratio_90d",
        "mean_volatility_90d_ann_pct",
        "median_volatility_90d_ann_pct",
        "mean_drawdown_from_ath_pct",
        "median_drawdown_from_ath_pct",
        "mean_cagr_pct",
        "median_cagr_pct",
        "representative_coins",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _render_stats_table(rows: list[dict[str, Any]], label: str) -> list[str]:
    lines = [f"## {label}", ""]
    lines.append("| Group | Count | Median Sharpe | Median 90d Return | Median Vol | Median Drawdown | Median CAGR |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for row in rows[:20]:
        lines.append(
            "| "
            f"{row['group_value']} | "
            f"{row['coin_count']} | "
            f"{row['median_sharpe_ratio_90d']} | "
            f"{row['median_return_90d_pct']} | "
            f"{row['median_volatility_90d_ann_pct']} | "
            f"{row['median_drawdown_from_ath_pct']} | "
            f"{row['median_cagr_pct']} |"
        )
    lines.append("")
    return lines


def _build_report(
    payload: dict[str, Any],
    feature_rows: list[dict[str, Any]],
    bucket_stats: list[dict[str, Any]],
    archetype_stats: list[dict[str, Any]],
) -> str:
    lines: list[str] = []
    lines.append("# Crypto Case Study Feature Report")
    lines.append("")
    lines.append(f"Generated: `{payload.get('generated_at', '')}`")
    lines.append("")
    lines.append("This report converts the broad case-study context layer into a normalized feature matrix for thesis work.")
    lines.append("The goal is to compare crypto assets as economic types rather than only as tickers.")
    lines.append("")

    bucket_counts = Counter(item.get("benchmark_bucket", "unknown") or "unknown" for item in feature_rows)
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Total normalized case-study coins: {len(feature_rows)}")
    lines.append(f"- Benchmark buckets represented: {len(bucket_counts)}")
    lines.append(
        "- Largest buckets: "
        + ", ".join(f"{name} ({count})" for name, count in bucket_counts.most_common(8))
    )
    lines.append("")

    lines.extend(_render_stats_table(bucket_stats, "Benchmark Bucket Stats"))
    lines.extend(_render_stats_table(archetype_stats, "Fundamental Archetype Stats"))

    lines.append("## Thesis Directions")
    lines.append("")
    lines.append("- Compare RWA and stablecoin buckets against smart-contract L1s on Sharpe, volatility, and drawdown resilience.")
    lines.append("- Test whether exchange-token value-accrual models behave more like infrastructure rent extraction than DeFi governance tokens.")
    lines.append("- Contrast store-of-value and privacy coins against payments rails to separate macro hedging from transactional utility.")
    lines.append("- Evaluate whether AI/DePIN and identity themes carry distinct volatility and narrative-durability profiles versus classic L1 beta.")
    lines.append("- Use supply_regime and regulatory_sensitivity as explanatory features for cross-sectional return dispersion.")
    lines.append("")

    lines.append("## Example Pairings")
    lines.append("")
    for item in feature_rows[:25]:
        targets = item.get("relative_comparison_targets") or []
        if not targets:
            continue
        lines.append(
            "- "
            f"{item.get('coingecko_id')} ({item.get('benchmark_bucket')}, {item.get('fundamental_archetype')}) "
            f"vs {', '.join(targets[:3])}: {item.get('thesis_use_case', '')}"
        )
    lines.append("")
    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build a normalized crypto case-study feature matrix from the context summary.")
    ap.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    ap.add_argument("--batch-size", type=int, default=12)
    ap.add_argument("--output-stem", default="case_study_feature_matrix")
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    ctx = _load_context_tools()

    input_rows = ctx._read_csv(args.input_csv.resolve())
    local_rows_by_id = {row["coingecko_id"]: row for row in input_rows}
    batches = ctx._chunked(input_rows, max(1, int(args.batch_size)))

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = args.output_stem
    raw_path = output_dir / f"{stem}_raw.txt"
    json_path = output_dir / f"{stem}.json"
    csv_path = output_dir / f"{stem}.csv"
    group_csv_path = output_dir / f"{stem}_group_stats.csv"

    raw_chunks: list[str] = []
    merged_payload: dict[str, Any] = {"coins": []}

    for idx, batch in enumerate(batches, start=1):
        print(f"[info] batch {idx}/{len(batches)}: {', '.join(row['coingecko_id'] for row in batch)}", flush=True)
        prompt = _build_feature_prompt(batch)
        raw_text, payload = ctx._run_gemini(prompt)
        raw_chunks.append(f"\n===== BATCH {idx} =====\n{raw_text}\n")
        merged_payload["coins"].extend(payload.get("coins", []))

        checkpoint_payload = {
            "generated_at": ctx._now_iso(),
            "coins": merged_payload["coins"],
        }
        ctx._write_text(raw_path, "\n".join(raw_chunks))
        ctx._write_json(json_path, checkpoint_payload)

    feature_rows = merged_payload["coins"]
    feature_rows_by_id = {row["coingecko_id"]: row for row in feature_rows}
    ordered_feature_rows = [feature_rows_by_id[row["coingecko_id"]] for row in input_rows if row["coingecko_id"] in feature_rows_by_id]

    payload = {
        "generated_at": ctx._now_iso(),
        "coins": ordered_feature_rows,
    }
    bucket_stats = _group_stats(
        [
            {**row, **local_rows_by_id[row["coingecko_id"]]}
            for row in ordered_feature_rows
            if row["coingecko_id"] in local_rows_by_id
        ],
        "benchmark_bucket",
    )
    archetype_stats = _group_stats(
        [
            {**row, **local_rows_by_id[row["coingecko_id"]]}
            for row in ordered_feature_rows
            if row["coingecko_id"] in local_rows_by_id
        ],
        "fundamental_archetype",
    )

    _write_feature_csv(csv_path, ordered_feature_rows, local_rows_by_id)
    _write_group_stats_csv(group_csv_path, bucket_stats + archetype_stats)
    ctx._write_text(raw_path, "\n".join(raw_chunks))
    ctx._write_json(json_path, payload)
    ctx._write_text(args.report_path.resolve(), _build_report(payload, ordered_feature_rows, bucket_stats, archetype_stats))

    print(f"[ok] wrote {raw_path}")
    print(f"[ok] wrote {json_path}")
    print(f"[ok] wrote {csv_path}")
    print(f"[ok] wrote {group_csv_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
