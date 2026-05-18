#!/usr/bin/env python3
"""
Crypto Research Context Enricher

Builds a thesis-friendly context layer on top of the local CoinGecko export set.
It reads the clean analytics/profile CSVs, asks Gemini to gather current web
context for a curated major-coin list, then writes:

- data_lake/crypto_pipeline/context/major_coin_context.json
- data_lake/crypto_pipeline/context/major_coin_context_summary.csv
- data_lake/crypto_pipeline/context/major_coin_context_raw.txt
- reports/crypto_fundamental_context_report.md
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]

DEFAULT_ANALYTICS = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_analytics_clean.csv"
DEFAULT_PROFILES = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_profiles_clean.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_fundamental_context_report.md"

# First-pass major non-stable focus universe.
DEFAULT_COINS = [
    "bitcoin",
    "ethereum",
    "ripple",
    "binancecoin",
    "solana",
    "tron",
    "dogecoin",
    "cardano",
    "hyperliquid",
    "bitcoin-cash",
]

CASE_STUDY_ADDONS = [
    "ousg",
    "openeden-tbill",
    "superstate-short-duration-us-government-securities-fund-ustb",
    "spiko-us-t-bills-money-market-fund",
    "midas-mtbill",
    "hashnote-usyc",
    "tether-gold",
    "ethena-usde",
    "paypal-usd",
    "dai",
    "usd-coin",
    "tether",
    "usds",
    "figure-heloc",
    "canton-network",
    "bittensor",
    "monero",
    "chainlink",
    "avalanche-2",
    "hedera-hashgraph",
    "the-open-network",
    "sui",
    "mantle",
    "polkadot",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _index_by(rows: list[dict[str, str]], key: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for row in rows:
        value = (row.get(key) or "").strip()
        if value:
            out[value] = row
    return out


def _safe_float(value: str | None) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _safe_int(value: str | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _fmt_num(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    return f"{value:.{digits}f}"


def _parse_json_list(text: str | None) -> list[str]:
    if not text:
        return []
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        item_text = str(item).strip()
        if item_text:
            out.append(item_text)
    return out


def _select_coin_rows(
    analytics_rows: list[dict[str, str]],
    analytics_by_id: dict[str, dict[str, str]],
    profiles_by_id: dict[str, dict[str, str]],
    coin_ids: list[str],
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    missing: list[str] = []
    for coin_id in coin_ids:
        analytics = analytics_by_id.get(coin_id)
        if analytics is None:
            missing.append(coin_id)
            continue
        profile = profiles_by_id.get(coin_id, {})
        selected.append(
            {
                "coingecko_id": coin_id,
                "symbol": (analytics.get("symbol") or profile.get("symbol") or "").strip(),
                "name": (analytics.get("name") or profile.get("name") or "").strip(),
                "days_of_history": _safe_int(analytics.get("days_of_history")),
                "price_usd": _safe_float(analytics.get("price_usd")),
                "return_90d_pct": _safe_float(analytics.get("return_90d_pct")),
                "sharpe_ratio_90d": _safe_float(analytics.get("sharpe_ratio_90d")),
                "volatility_90d_ann_pct": _safe_float(analytics.get("volatility_90d_ann_pct")),
                "drawdown_from_ath_pct": _safe_float(analytics.get("drawdown_from_ath_pct")),
                "cagr_pct": _safe_float(analytics.get("cagr_pct")),
                "homepage": (profile.get("homepage") or "").strip(),
                "categories": _parse_json_list(profile.get("categories")),
            }
        )
    if missing:
        raise SystemExit(f"Missing analytics rows for: {', '.join(missing)}")
    return selected


def _build_case_study_coin_ids(
    analytics_rows: list[dict[str, str]],
    analytics_by_id: dict[str, dict[str, str]],
    top_n: int,
) -> list[str]:
    coin_ids: list[str] = []
    seen: set[str] = set()

    def add_coin(coin_id: str) -> None:
        if not coin_id or coin_id in seen or coin_id not in analytics_by_id:
            return
        seen.add(coin_id)
        coin_ids.append(coin_id)

    # Start with the locally curated analytics ordering, which already fronts majors.
    for row in analytics_rows[:top_n]:
        add_coin((row.get("coingecko_id") or "").strip())

    # Add credible thematic case studies that are often not obvious from pure rank order.
    for coin_id in CASE_STUDY_ADDONS:
        add_coin(coin_id)

    return coin_ids


def _build_coin_prompt(coin_rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("You are enriching a local crypto research dataset for thesis work.")
    lines.append("Use current web sources.")
    lines.append("Prefer official project blogs/docs/homepages and reputable current reporting when official sources are insufficient.")
    lines.append("Do not inspect or modify any local files.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "coins": [')
    lines.append("    {")
    lines.append('      "coingecko_id": "string",')
    lines.append('      "symbol": "string",')
    lines.append('      "name": "string",')
    lines.append('      "coin_type": "string",')
    lines.append('      "narrative_bucket": "string",')
    lines.append('      "economic_role": "string",')
    lines.append('      "current_catalysts": ["string"],')
    lines.append('      "main_risks": ["string"],')
    lines.append('      "analytics_explanation": "string",')
    lines.append('      "sources": [')
    lines.append('        {"title": "string", "url": "string", "date": "YYYY-MM or YYYY-MM-DD", "kind": "official|news|docs|research"}')
    lines.append("      ]")
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")
    lines.append("Constraints:")
    lines.append("- For each coin, keep current_catalysts to 3 items max and main_risks to 3 items max.")
    lines.append("- For each coin, include 2 to 3 sources max.")
    lines.append("- If you cannot verify a precise source URL, omit that source instead of inventing one.")
    lines.append("- Prefer official domains implied by the homepage where possible.")
    lines.append("- Avoid generic SEO or low-credibility blogs unless there is no stronger source.")
    lines.append("- Use absolute dates when helpful.")
    lines.append("- Match the coingecko_id/symbol/name values given below exactly.")
    lines.append("")
    lines.append("Local analytics snapshot:")
    for row in coin_rows:
        categories = ", ".join(row["categories"][:4]) if row["categories"] else "n/a"
        lines.append(
            "- "
            f"{row['coingecko_id']} ({row['symbol']}, {row['name']}): "
            f"days_of_history={row['days_of_history']}, "
            f"price_usd={_fmt_num(row['price_usd'])}, "
            f"return_90d_pct={_fmt_num(row['return_90d_pct'])}, "
            f"sharpe_ratio_90d={_fmt_num(row['sharpe_ratio_90d'], 3)}, "
            f"volatility_90d_ann_pct={_fmt_num(row['volatility_90d_ann_pct'])}, "
            f"drawdown_from_ath_pct={_fmt_num(row['drawdown_from_ath_pct'])}, "
            f"cagr_pct={_fmt_num(row['cagr_pct'])}, "
            f"homepage={row['homepage'] or 'n/a'}, "
            f"categories={categories}"
        )
    return "\n".join(lines)


def _build_summary_prompt(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("You are synthesizing thesis-friendly research notes from structured crypto case-study records.")
    lines.append("Do not browse the web. Use only the JSON records below.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "generated_at": "ISO-8601 string",')
    lines.append('  "dataset_level_insights": ["string"],')
    lines.append('  "thesis_layer_notes": ["string"]')
    lines.append("}")
    lines.append("Constraints:")
    lines.append("- Keep dataset_level_insights to 7 items max.")
    lines.append("- Keep thesis_layer_notes to 7 items max.")
    lines.append("- Focus on cross-coin differences that actually connect to the local analytics and case-study usefulness.")
    lines.append("")
    lines.append("Case-study records:")
    lines.append(json.dumps(payload.get("coins", []), ensure_ascii=False))
    return "\n".join(lines)


def _extract_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    candidates: list[str] = []

    marked = re.search(r"BEGIN_JSON\s*(\{.*\})\s*END_JSON", text, flags=re.DOTALL)
    if marked:
        candidates.append(marked.group(1).strip())

    fenced = re.search(r"```json\s*(\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        candidates.append(fenced.group(1).strip())

    first_brace = text.find("{")
    if first_brace >= 0:
        candidates.append(text[first_brace:].strip())

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
        try:
            payload, _ = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload

    preview = text[:1200].replace("\n", "\\n")
    raise ValueError(f"Gemini response did not contain parseable JSON payload. Preview: {preview}")


def _run_gemini(prompt: str, *, attempts: int = 3, retry_delay_s: float = 2.0) -> tuple[str, dict[str, Any]]:
    cmd = 'gemini --approval-mode yolo --output-format text -p "$1"'
    last_error: Exception | None = None
    last_combined = ""
    for attempt in range(1, attempts + 1):
        result = subprocess.run(
            ["bash", "-ilc", cmd, "bash", prompt],
            text=True,
            capture_output=True,
            stdin=subprocess.DEVNULL,
            check=False,
        )

        combined = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        last_combined = combined
        if result.returncode == 0:
            try:
                payload = _extract_json_object(combined)
                return combined, payload
            except Exception as exc:
                last_error = exc
        else:
            last_error = RuntimeError(f"Gemini exited with code {result.returncode}\n{combined}")

        if attempt < attempts:
            time.sleep(retry_delay_s)

    detail = last_combined[:4000]
    raise RuntimeError(f"Gemini failed after {attempts} attempts: {last_error}\n{detail}")


def _chunked(seq: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _write_summary_csv(
    path: Path,
    payload: dict[str, Any],
    local_rows_by_id: dict[str, dict[str, Any]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "coingecko_id",
        "symbol",
        "name",
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
        for item in payload.get("coins", []):
            coin_id = item["coingecko_id"]
            local = local_rows_by_id[coin_id]
            writer.writerow(
                {
                    "coingecko_id": coin_id,
                    "symbol": item.get("symbol", ""),
                    "name": item.get("name", ""),
                    "coin_type": item.get("coin_type", ""),
                    "narrative_bucket": item.get("narrative_bucket", ""),
                    "economic_role": item.get("economic_role", ""),
                    "days_of_history": local.get("days_of_history"),
                    "price_usd": local.get("price_usd"),
                    "return_90d_pct": local.get("return_90d_pct"),
                    "sharpe_ratio_90d": local.get("sharpe_ratio_90d"),
                    "volatility_90d_ann_pct": local.get("volatility_90d_ann_pct"),
                    "drawdown_from_ath_pct": local.get("drawdown_from_ath_pct"),
                    "cagr_pct": local.get("cagr_pct"),
                    "current_catalysts": " | ".join(item.get("current_catalysts", [])),
                    "main_risks": " | ".join(item.get("main_risks", [])),
                    "analytics_explanation": item.get("analytics_explanation", ""),
                    "source_urls": " | ".join(source.get("url", "") for source in item.get("sources", [])),
                }
            )


def _build_report(payload: dict[str, Any], local_rows_by_id: dict[str, dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("# Crypto Fundamental Context Report")
    lines.append("")
    lines.append(f"Generated: `{payload.get('generated_at', _now_iso())}`")
    lines.append("")
    lines.append("This report combines local Sharpe-Renaissance crypto analytics with a Gemini-assisted current web-context pass.")
    lines.append("Treat this as a research context layer, not as final ground truth. Important claims should still be checked before thesis submission.")
    lines.append("")
    insights = payload.get("dataset_level_insights") or []
    if insights:
        lines.append("## Cross-Coin Insights")
        lines.append("")
        for item in insights:
            lines.append(f"- {item}")
        lines.append("")
    lines.append("## Coin Notes")
    lines.append("")
    for item in payload.get("coins", []):
        coin_id = item["coingecko_id"]
        local = local_rows_by_id[coin_id]
        lines.append(f"### {item.get('name', coin_id)} ({item.get('symbol', '')})")
        lines.append("")
        lines.append(
            f"- Local analytics: price `${_fmt_num(local.get('price_usd'))}`, "
            f"`90d return {_fmt_num(local.get('return_90d_pct'))}%`, "
            f"`90d Sharpe {_fmt_num(local.get('sharpe_ratio_90d'), 3)}`, "
            f"`90d vol {_fmt_num(local.get('volatility_90d_ann_pct'))}%`, "
            f"`drawdown from ATH {_fmt_num(local.get('drawdown_from_ath_pct'))}%`, "
            f"`CAGR {_fmt_num(local.get('cagr_pct'))}%`."
        )
        lines.append(f"- Coin type: {item.get('coin_type', '')}")
        lines.append(f"- Narrative bucket: {item.get('narrative_bucket', '')}")
        lines.append(f"- Economic role: {item.get('economic_role', '')}")
        catalysts = item.get("current_catalysts") or []
        if catalysts:
            lines.append("- Current catalysts: " + " | ".join(catalysts))
        risks = item.get("main_risks") or []
        if risks:
            lines.append("- Main risks: " + " | ".join(risks))
        lines.append(f"- Analytics interpretation: {item.get('analytics_explanation', '')}")
        sources = item.get("sources") or []
        if sources:
            lines.append("- Sources:")
            for source in sources:
                title = source.get("title", "").strip() or source.get("url", "").strip()
                url = source.get("url", "").strip()
                date = source.get("date", "").strip()
                kind = source.get("kind", "").strip()
                suffix = " ".join(part for part in [date, kind] if part)
                if suffix:
                    lines.append(f"  {title} — {url} ({suffix})")
                else:
                    lines.append(f"  {title} — {url}")
        lines.append("")
    thesis_notes = payload.get("thesis_layer_notes") or []
    if thesis_notes:
        lines.append("## Thesis Layer")
        lines.append("")
        for item in thesis_notes:
            lines.append(f"- {item}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Enrich major crypto coins with current web context via Gemini.")
    ap.add_argument("--analytics-csv", type=Path, default=DEFAULT_ANALYTICS)
    ap.add_argument("--profiles-csv", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    ap.add_argument("--coins", default=",".join(DEFAULT_COINS), help="Comma-separated CoinGecko IDs.")
    ap.add_argument("--selection", choices=["manual", "case-study"], default="manual")
    ap.add_argument("--case-study-top-n", type=int, default=40)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--output-stem", default="", help="Optional output filename stem without extension.")
    return ap


def main() -> int:
    args = _build_parser().parse_args()

    analytics_rows = _read_csv(args.analytics_csv)
    profiles_rows = _read_csv(args.profiles_csv)
    analytics_by_id = _index_by(analytics_rows, "coingecko_id")
    profiles_by_id = _index_by(profiles_rows, "coingecko_id")

    if args.selection == "case-study":
        coin_ids = _build_case_study_coin_ids(
            analytics_rows,
            analytics_by_id,
            top_n=max(1, args.case_study_top_n),
        )
    else:
        coin_ids = [item.strip() for item in args.coins.split(",") if item.strip()]

    selected = _select_coin_rows(analytics_rows, analytics_by_id, profiles_by_id, coin_ids)
    local_rows_by_id = {row["coingecko_id"]: row for row in selected}

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.output_stem:
        stem = args.output_stem
    elif args.selection == "case-study":
        stem = "case_study_context"
    else:
        stem = "major_coin_context"

    raw_path = output_dir / f"{stem}_raw.txt"
    json_path = output_dir / f"{stem}.json"
    csv_path = output_dir / f"{stem}_summary.csv"

    batch_size = max(1, int(args.batch_size))
    batches = _chunked(selected, batch_size)
    raw_chunks: list[str] = []
    merged_payload: dict[str, Any] = {"coins": []}
    for idx, batch in enumerate(batches, start=1):
        print(f"[info] batch {idx}/{len(batches)}: {', '.join(row['coingecko_id'] for row in batch)}", flush=True)
        prompt = _build_coin_prompt(batch)
        raw_text, payload = _run_gemini(prompt)
        raw_chunks.append(f"\n===== BATCH {idx} =====\n{raw_text}\n")
        merged_payload["coins"].extend(payload.get("coins", []))

        checkpoint_payload = {
            "generated_at": _now_iso(),
            "dataset_level_insights": [],
            "thesis_layer_notes": [],
            "coins": merged_payload["coins"],
        }
        _write_text(raw_path, "\n".join(raw_chunks))
        _write_json(json_path, checkpoint_payload)
        _write_summary_csv(csv_path, checkpoint_payload, local_rows_by_id)

    summary_prompt = _build_summary_prompt(merged_payload)
    print("[info] building dataset-level summary", flush=True)
    try:
        summary_raw, summary_payload = _run_gemini(summary_prompt)
        raw_chunks.append(f"\n===== SUMMARY =====\n{summary_raw}\n")
        payload = {
            "generated_at": summary_payload.get("generated_at", _now_iso()),
            "dataset_level_insights": summary_payload.get("dataset_level_insights", []),
            "thesis_layer_notes": summary_payload.get("thesis_layer_notes", []),
            "coins": merged_payload["coins"],
        }
    except Exception as exc:
        raw_chunks.append(f"\n===== SUMMARY ERROR =====\n{exc}\n")
        payload = {
            "generated_at": _now_iso(),
            "dataset_level_insights": [],
            "thesis_layer_notes": [],
            "coins": merged_payload["coins"],
        }

    _write_text(raw_path, "\n".join(raw_chunks))
    _write_json(json_path, payload)
    _write_summary_csv(csv_path, payload, local_rows_by_id)
    _write_text(args.report_path.resolve(), _build_report(payload, local_rows_by_id))

    print(f"[ok] wrote {raw_path}")
    print(f"[ok] wrote {json_path}")
    print(f"[ok] wrote {csv_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
