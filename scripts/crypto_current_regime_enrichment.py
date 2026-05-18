#!/usr/bin/env python3
"""
Crypto Current Regime Enrichment

Uses Gemini browsing to add current-landscape, ex ante regime factors on top of
the structural crypto panel. Designed to run in resumable background batches.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_CONTEXT_SCRIPT = _HERE.with_name("crypto_research_context.py")

DEFAULT_INPUT_CSV = _REPO / "data_lake" / "crypto_pipeline" / "context" / "quality_floor_universe_labels.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_current_regime_report.md"

CURRENT_REGIME_FACTORS = [
    {
        "factor_name": "has_current_institutional_flow_tailwind",
        "definition": "Current evidence of ETF, treasury, custody, or similar institutional flow support.",
    },
    {
        "factor_name": "has_current_regulatory_tailwind",
        "definition": "Recent regulatory clarity, approval, or policy developments that improve adoption or access.",
    },
    {
        "factor_name": "has_current_regulatory_overhang",
        "definition": "Current litigation, classification, enforcement, or policy risk hanging over the asset.",
    },
    {
        "factor_name": "has_current_product_or_upgrade_tailwind",
        "definition": "Recent or imminent product release, chain upgrade, or protocol launch that matters economically.",
    },
    {
        "factor_name": "has_current_usage_or_adoption_tailwind",
        "definition": "Evidence of current user, transaction, partner, or ecosystem adoption acceleration.",
    },
    {
        "factor_name": "has_current_fee_or_revenue_momentum",
        "definition": "Current evidence that protocol fees, revenue, or monetization have strengthened.",
    },
    {
        "factor_name": "has_current_liquidity_or_stablecoin_support",
        "definition": "Current evidence of liquidity expansion, stablecoin support, or market-structure tailwind.",
    },
    {
        "factor_name": "has_current_distribution_or_partnership_tailwind",
        "definition": "Current distribution gain through exchange support, integrations, payment partners, or major listings.",
    },
    {
        "factor_name": "has_current_supply_overhang",
        "definition": "Current token unlock, emissions, treasury selling, or dilution pressure risk.",
    },
    {
        "factor_name": "has_current_security_or_trust_overhang",
        "definition": "Current exploit, trust, reserve, governance, or operational credibility concern.",
    },
    {
        "factor_name": "has_current_narrative_momentum",
        "definition": "Current cycle narrative or attention tailwind that is materially affecting the token.",
    },
]

STRUCTURAL_CONTEXT_FIELDS = [
    "predicted_bucket",
    "bucket_confidence",
    "signal_families_preview",
    "is_stablecoin",
    "is_defi",
    "is_rwa",
    "is_ai_depin",
    "is_meme_speculative",
    "is_exchange_token",
    "is_interoperability",
    "used_as_collateral",
    "used_for_settlement",
    "has_centralized_issuer",
    "has_staking_yield",
    "has_high_regulatory_sensitivity",
    "is_institutionally_oriented",
]


def _load_context_tools() -> Any:
    spec = importlib.util.spec_from_file_location("crypto_research_context", _CONTEXT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load context helpers from {_CONTEXT_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _safe_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return 1 if float(value) >= 0.5 else 0
    text = str(value).strip().lower()
    if text in {"1", "true", "yes"}:
        return 1
    try:
        return 1 if float(text) >= 0.5 else 0
    except ValueError:
        pass
    return 0


def _root_domain(url: str) -> str:
    netloc = urlparse(url).netloc.lower().strip()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    parts = [part for part in netloc.split(".") if part]
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return netloc


def _has_strong_source(source_rows: list[dict[str, str]], homepage: str) -> bool:
    homepage_root = _root_domain(homepage)
    strong_exchange_roots = {
        "binance.com",
        "coinbase.com",
        "kraken.com",
        "okx.com",
        "bybit.com",
        "bitget.com",
        "upbit.com",
        "mexc.com",
        "kucoin.com",
        "dtcc.com",
        "sec.gov",
        "cftc.gov",
        "blackrock.com",
        "fidelity.com",
        "grayscale.com",
        "nyse.com",
        "nasdaq.com",
    }
    for source in source_rows:
        kind = source.get("kind", "").strip().lower()
        root = _root_domain(source.get("url", ""))
        if kind in {"official", "docs"} and homepage_root and root == homepage_root:
            return True
        if kind in {"filing", "exchange"} and root in strong_exchange_roots:
            return True
    return False


def _chunked(seq: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def _normalize_selected_row(row: dict[str, Any], rank_idx: int) -> dict[str, Any]:
    selected: dict[str, Any] = {
        "coingecko_id": (row.get("coingecko_id") or "").strip(),
        "symbol": (row.get("symbol") or "").strip(),
        "name": (row.get("name") or "").strip(),
        "rank_idx": rank_idx,
        "predicted_bucket": (row.get("predicted_bucket") or "").strip(),
        "bucket_confidence": (row.get("bucket_confidence") or "").strip(),
        "signal_families_preview": (row.get("signal_families_preview") or "").strip(),
        "homepage": (row.get("homepage") or "").strip(),
    }
    for field in STRUCTURAL_CONTEXT_FIELDS:
        if field in selected:
            continue
        selected[field] = _safe_int(row.get(field))
    return selected


def _load_coin_ids(path: Path) -> list[str]:
    seen: set[str] = set()
    coin_ids: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        coin_id = line.strip()
        if coin_id and coin_id not in seen:
            seen.add(coin_id)
            coin_ids.append(coin_id)
    return coin_ids


def _select_rows(input_csv: Path, max_rank: int, coin_ids: list[str] | None = None) -> list[dict[str, Any]]:
    with input_csv.open("r", encoding="utf-8", newline="") as fh:
        source_rows = list(csv.DictReader(fh))

    if coin_ids:
        row_by_id: dict[str, dict[str, Any]] = {}
        for row in source_rows:
            coin_id = (row.get("coingecko_id") or "").strip()
            if coin_id:
                row_by_id[coin_id] = row

        selected_rows: list[dict[str, Any]] = []
        missing_ids: list[str] = []
        for coin_id in coin_ids:
            row = row_by_id.get(coin_id)
            if row is None:
                missing_ids.append(coin_id)
                continue
            try:
                rank_idx = int(float(str(row.get("rank_idx", "")).strip()))
            except ValueError:
                continue
            selected_rows.append(_normalize_selected_row(row, rank_idx))
        if missing_ids:
            raise SystemExit(f"Missing coin ids in input CSV: {', '.join(missing_ids[:12])}")
        return selected_rows

    rows: list[dict[str, Any]] = []
    for row in source_rows:
        try:
            rank_idx = int(float(str(row.get("rank_idx", "")).strip()))
        except ValueError:
            continue
        if rank_idx > max_rank:
            continue
        rows.append(_normalize_selected_row(row, rank_idx))
    rows.sort(key=lambda row: row["rank_idx"])
    return rows


def _load_existing(json_path: Path) -> dict[str, dict[str, Any]]:
    if not json_path.exists():
        return {}
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    existing: dict[str, dict[str, Any]] = {}
    for row in payload.get("coins", []):
        coin_id = str(row.get("coingecko_id", "")).strip()
        if coin_id:
            existing[coin_id] = row
    return existing


def _build_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("You are enriching a crypto research dataset with current-regime factors.")
    lines.append("Use current web sources as of March 23, 2026.")
    lines.append("Focus on ex ante, economically meaningful developments, not price commentary.")
    lines.append("Prefer official blogs, project docs, company announcements, exchange notices, ETF filings/pages, or reputable reporting when official sources are insufficient.")
    lines.append("At least one source per coin should be `official`, `docs`, `filing`, or `exchange` whenever a plausible strong source exists.")
    lines.append("Do not inspect or modify local files.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "coins": [')
    lines.append("    {")
    lines.append('      "coingecko_id": "string",')
    lines.append('      "symbol": "string",')
    lines.append('      "name": "string",')
    lines.append('      "current_primary_driver": "string",')
    lines.append('      "current_primary_risk": "string",')
    for factor in CURRENT_REGIME_FACTORS:
        lines.append(f'      "{factor["factor_name"]}": 0,')
    lines.append('      "confidence": "low|medium|high",')
    lines.append('      "sources": [')
    lines.append('        {"title": "string", "url": "string", "date": "YYYY-MM or YYYY-MM-DD", "kind": "official|docs|filing|exchange|news|research"}')
    lines.append("      ]")
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")
    lines.append("Rules:")
    lines.append("- Keep current_primary_driver and current_primary_risk short and specific.")
    lines.append("- Set a factor to 1 only when there is concrete current evidence, not just a generic possibility.")
    lines.append("- A coin can have both tailwinds and overhangs at the same time.")
    lines.append("- Include 2 to 3 sources per coin, max.")
    lines.append("- Do not label third-party reporting as `official` or `docs`.")
    lines.append("- For `official` or `docs`, use the homepage domain or its obvious subdomains when possible.")
    lines.append("- Match coingecko_id, symbol, and name exactly as given.")
    lines.append("")
    lines.append("Current regime factors:")
    for factor in CURRENT_REGIME_FACTORS:
        lines.append(f'- {factor["factor_name"]}: {factor["definition"]}')
    lines.append("")
    lines.append("Local structural context:")
    for row in rows:
        structural_bits = []
        for field in STRUCTURAL_CONTEXT_FIELDS:
            value = row.get(field)
            if isinstance(value, int) and value == 1:
                structural_bits.append(field)
        lines.append(
            "- "
            f"{row['coingecko_id']} ({row['symbol']}, {row['name']}): "
            f"rank_idx={row['rank_idx']}, "
            f"predicted_bucket={row['predicted_bucket']}, "
            f"bucket_confidence={row['bucket_confidence']}, "
            f"homepage={row['homepage'] or 'n/a'}, "
            f"signal_families={row['signal_families_preview'] or 'n/a'}, "
            f"structural_flags={', '.join(structural_bits) if structural_bits else 'none'}"
        )
    return "\n".join(lines)


def _validate_payload(rows: list[dict[str, Any]], payload: dict[str, Any]) -> list[dict[str, Any]]:
    expected = {row["coingecko_id"]: row for row in rows}
    items = payload.get("coins")
    if not isinstance(items, list):
        raise ValueError("Gemini payload missing coins list.")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    factor_names = [item["factor_name"] for item in CURRENT_REGIME_FACTORS]
    timestamp_utc = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    
    for item in items:
        if not isinstance(item, dict):
            continue
        coin_id = str(item.get("coingecko_id", "")).strip()
        if not coin_id or coin_id not in expected or coin_id in seen:
            continue
        seen.add(coin_id)
        row = expected[coin_id]
        record: dict[str, Any] = {
            "coingecko_id": coin_id,
            "symbol": row["symbol"],
            "name": row["name"],
            "rank_idx": row["rank_idx"],
            "predicted_bucket": row["predicted_bucket"],
            "bucket_confidence": row["bucket_confidence"],
            "signal_families_preview": row["signal_families_preview"],
            "homepage": row["homepage"],
            "current_primary_driver": str(item.get("current_primary_driver", "")).strip(),
            "current_primary_risk": str(item.get("current_primary_risk", "")).strip(),
            "confidence": str(item.get("confidence", "")).strip().lower() or "low",
            "last_updated_utc": timestamp_utc,
        }
        for factor_name in factor_names:
            record[factor_name] = _safe_int(item.get(factor_name))
        sources = item.get("sources")
        source_rows: list[dict[str, str]] = []
        if isinstance(sources, list):
            for source in sources:
                if not isinstance(source, dict):
                    continue
                url = str(source.get("url", "")).strip()
                title = str(source.get("title", "")).strip()
                if not url or not title:
                    continue
                source_rows.append(
                    {
                        "title": title,
                        "url": url,
                        "date": str(source.get("date", "")).strip(),
                        "kind": str(source.get("kind", "")).strip(),
                    }
                )
        strong_kinds = {"official", "docs", "filing", "exchange"}
        if record["confidence"] in {"high", "medium"} and source_rows:
            if not any(source.get("kind", "").lower() in strong_kinds for source in source_rows):
                record["confidence"] = "low"
            elif not _has_strong_source(source_rows, row["homepage"]):
                record["confidence"] = "low"
        record["sources"] = source_rows
        record["source_urls"] = " | ".join(source["url"] for source in source_rows[:3])
        
        # Sanity checks for contradictory or suspicious patterns
        validation_warnings = []
        
        # Check for suspicious flag combinations
        if record.get("predicted_bucket") == "stablecoin":
            # Stablecoins shouldn't have narrative momentum unless unusual case
            if record.get("has_current_narrative_momentum") == 1:
                validation_warnings.append("stablecoin_with_narrative")
        
        # Check for completely empty current regime (suspicious - likely LLM failure)
        current_regime_flags = [record.get(f["factor_name"], 0) for f in CURRENT_REGIME_FACTORS]
        if sum(current_regime_flags) == 0 and record["confidence"] in {"high", "medium"}:
            validation_warnings.append("no_factors_high_confidence")
            record["confidence"] = "low"
        
        # Check for driver/risk consistency
        if not record["current_primary_driver"] and sum(current_regime_flags) > 2:
            validation_warnings.append("no_driver_with_factors")
        
        if validation_warnings:
            record["validation_warnings"] = " | ".join(validation_warnings)
        else:
            record["validation_warnings"] = ""
        
        out.append(record)
    missing = [coin_id for coin_id in expected if coin_id not in seen]
    if missing:
        raise ValueError(f"Gemini payload missing coin ids: {', '.join(missing[:8])}")
    return out


def _write_json(path: Path, rows: list[dict[str, Any]]) -> None:
    payload = {"coins": rows}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _write_summary_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    factor_names = [item["factor_name"] for item in CURRENT_REGIME_FACTORS]
    fieldnames = [
        "coingecko_id",
        "symbol",
        "name",
        "rank_idx",
        "predicted_bucket",
        "bucket_confidence",
        "signal_families_preview",
        "current_primary_driver",
        "current_primary_risk",
        *factor_names,
        "confidence",
        "source_urls",
        "last_updated_utc",
        "validation_warnings",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def _write_catalog(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["factor_name", "definition"])
        writer.writeheader()
        writer.writerows(CURRENT_REGIME_FACTORS)


def _build_factor_stats(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    factor_names = [item["factor_name"] for item in CURRENT_REGIME_FACTORS]
    stats: list[dict[str, Any]] = []
    for factor_name in factor_names:
        positives = [row for row in rows if int(row.get(factor_name, 0)) == 1]
        stats.append(
            {
                "factor_name": factor_name,
                "positive_count": len(positives),
                "sample_positive_coins": " | ".join(row["coingecko_id"] for row in positives[:8]),
            }
        )
    stats.sort(key=lambda row: (-row["positive_count"], row["factor_name"]))
    return stats


def _write_factor_stats(path: Path, rows: list[dict[str, Any]]) -> None:
    stats = _build_factor_stats(rows)
    if not stats:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(stats[0].keys()))
        writer.writeheader()
        writer.writerows(stats)


def _build_report(selected_rows: list[dict[str, Any]], rows: list[dict[str, Any]]) -> str:
    factor_stats = _build_factor_stats(rows)
    confidence_counts = Counter(row.get("confidence", "low") for row in rows)
    lines: list[str] = []
    lines.append("# Crypto Current Regime Report")
    lines.append("")
    lines.append("This report captures current, browse-derived regime factors on top of the structural crypto panel.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Selected priority coins: {len(selected_rows)}")
    lines.append(f"- Completed enrichments: {len(rows)}")
    lines.append(f"- Confidence high: {confidence_counts.get('high', 0)}")
    lines.append(f"- Confidence medium: {confidence_counts.get('medium', 0)}")
    lines.append(f"- Confidence low: {confidence_counts.get('low', 0)}")
    lines.append("")
    lines.append("## Most Common Current-Regime Factors")
    lines.append("")
    for row in factor_stats[:12]:
        lines.append(
            "- "
            f"{row['factor_name']}: positives={row['positive_count']}, "
            f"sample={row['sample_positive_coins']}"
        )
    lines.append("")
    lines.append("## Example Current Drivers")
    lines.append("")
    for row in rows[:20]:
        lines.append(
            "- "
            f"{row['coingecko_id']}: driver={row['current_primary_driver']} | "
            f"risk={row['current_primary_risk']}"
        )
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Browse current regime factors for a priority crypto universe.")
    ap.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV)
    ap.add_argument("--max-rank", type=int, default=500)
    ap.add_argument("--coin-ids-file", type=Path)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--output-prefix", type=str)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    ctx = _load_context_tools()
    coin_ids = _load_coin_ids(args.coin_ids_file.resolve()) if args.coin_ids_file else None
    selected_rows = _select_rows(args.input_csv.resolve(), args.max_rank, coin_ids=coin_ids)
    if not selected_rows:
        raise SystemExit("No rows selected for current-regime enrichment.")

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if args.output_prefix:
        prefix = args.output_prefix.strip()
    elif args.coin_ids_file:
        prefix = args.coin_ids_file.resolve().stem
    else:
        prefix = f"current_regime_top{args.max_rank}"
    json_path = output_dir / f"{prefix}.json"
    csv_path = output_dir / f"{prefix}_summary.csv"
    raw_path = output_dir / f"{prefix}_raw.txt"
    factor_catalog_path = output_dir / "current_regime_factor_catalog.csv"
    factor_stats_path = output_dir / f"{prefix}_factor_stats.csv"
    selection_path = output_dir / f"{prefix}_selection.csv"
    report_path = args.report_path.resolve()
    if args.report_path == DEFAULT_REPORT_PATH and prefix != f"current_regime_top{args.max_rank}":
        report_path = _REPO / "reports" / f"{prefix}_report.md"

    existing = _load_existing(json_path)
    completed_ids = set(existing)
    pending_rows = [row for row in selected_rows if row["coingecko_id"] not in completed_ids]

    with selection_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(selected_rows[0].keys()))
        writer.writeheader()
        writer.writerows(selected_rows)

    raw_chunks: list[str] = []
    if raw_path.exists():
        raw_chunks.append(raw_path.read_text(encoding="utf-8").strip())

    for batch in _chunked(pending_rows, args.batch_size):
        prompt = _build_prompt(batch)
        raw_text, payload = ctx._run_gemini(prompt)
        parsed_rows = _validate_payload(batch, payload)
        for row in parsed_rows:
            existing[row["coingecko_id"]] = row
        ordered_rows = [existing[row["coingecko_id"]] for row in selected_rows if row["coingecko_id"] in existing]
        _write_json(json_path, ordered_rows)
        _write_summary_csv(csv_path, ordered_rows)
        _write_catalog(factor_catalog_path)
        _write_factor_stats(factor_stats_path, ordered_rows)
        raw_chunks.append(raw_text.strip())
        raw_path.write_text("\n\n==== BATCH ====\n\n".join(chunk for chunk in raw_chunks if chunk).strip() + "\n", encoding="utf-8")
        report_path.write_text(_build_report(selected_rows, ordered_rows), encoding="utf-8")
        print(f"[progress] {len(ordered_rows)}/{len(selected_rows)} completed", flush=True)

    ordered_rows = [existing[row["coingecko_id"]] for row in selected_rows if row["coingecko_id"] in existing]
    _write_json(json_path, ordered_rows)
    _write_summary_csv(csv_path, ordered_rows)
    _write_catalog(factor_catalog_path)
    _write_factor_stats(factor_stats_path, ordered_rows)
    report_path.write_text(_build_report(selected_rows, ordered_rows), encoding="utf-8")

    print(f"[ok] wrote {json_path}")
    print(f"[ok] wrote {csv_path}")
    print(f"[ok] wrote {factor_catalog_path}")
    print(f"[ok] wrote {factor_stats_path}")
    print(f"[ok] wrote {selection_path}")
    print(f"[ok] wrote {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
