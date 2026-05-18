#!/usr/bin/env python3
"""
CoinGecko Category Taxonomy Builder

Builds a reusable taxonomy over raw CoinGecko category labels so downstream
research pipelines can distinguish fundamental signal from metadata noise such
as ecosystem tags, portfolio labels, and index membership.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_CONTEXT_SCRIPT = _HERE.with_name("crypto_research_context.py")

DEFAULT_PROFILES = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_profiles_clean.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_category_taxonomy_report.md"

TAXONOMY_KINDS = [
    "ecosystem",
    "portfolio_tag",
    "index_membership",
    "geography",
    "regulatory_tag",
    "economic_role",
    "asset_backing",
    "technical_mechanism",
    "application_vertical",
    "community_narrative",
    "organization_brand",
    "other",
]

NORMALIZED_FAMILIES = [
    "ecosystem",
    "portfolio",
    "index",
    "geography",
    "regulatory",
    "stablecoin",
    "rwa",
    "tokenized_equity",
    "tokenized_commodity",
    "tokenized_treasury",
    "exchange_token",
    "payments",
    "privacy",
    "ai_depin",
    "defi",
    "oracle_interoperability",
    "smart_contract_platform",
    "identity",
    "storage",
    "bridge_wrapped",
    "staking",
    "gaming",
    "metaverse_nft",
    "social",
    "launchpad",
    "meme",
    "governance",
    "derivatives",
    "analytics",
    "wallet",
    "prediction_gambling",
    "iot",
    "infrastructure",
    "other",
]

KIND_ALIASES = {
    "ecosystem_tag": "ecosystem",
    "portfolio": "portfolio_tag",
    "portfolio label": "portfolio_tag",
    "index": "index_membership",
    "index tag": "index_membership",
    "regulatory": "regulatory_tag",
    "economic": "economic_role",
    "asset": "asset_backing",
    "technical": "technical_mechanism",
    "vertical": "application_vertical",
    "community": "community_narrative",
    "brand": "organization_brand",
}

FAMILY_ALIASES = {
    "ai": "ai_depin",
    "depin": "ai_depin",
    "ai agents": "ai_depin",
    "ai_agents": "ai_depin",
    "oracle": "oracle_interoperability",
    "interoperability": "oracle_interoperability",
    "layer1": "smart_contract_platform",
    "layer2": "smart_contract_platform",
    "layer_1": "smart_contract_platform",
    "layer_2": "smart_contract_platform",
    "smart_contract": "smart_contract_platform",
    "smart_contract_l1": "smart_contract_platform",
    "rwa_protocol": "rwa",
    "tokenized_assets": "rwa",
    "tokenized_gold": "tokenized_commodity",
    "tokenized_treasury_bills": "tokenized_treasury",
    "tokenized_treasury_bonds": "tokenized_treasury",
    "commodity": "tokenized_commodity",
    "bridge": "bridge_wrapped",
    "wrapped": "bridge_wrapped",
    "wrapped_tokens": "bridge_wrapped",
    "wrapped-tokens": "bridge_wrapped",
    "socialfi": "social",
    "nft": "metaverse_nft",
    "metaverse": "metaverse_nft",
    "wallets": "wallet",
    "gambling": "prediction_gambling",
    "prediction": "prediction_gambling",
    "gamefi": "gaming",
    "infrastructure_oracle": "oracle_interoperability",
}


def _load_context_tools() -> Any:
    spec = importlib.util.spec_from_file_location("crypto_research_context", _CONTEXT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load context helpers from {_CONTEXT_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parse_categories(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _normalize_token(text: str) -> str:
    return " ".join(str(text).strip().lower().replace("-", " ").replace("/", " ").split())


def _collect_categories(profiles_csv: Path) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    with profiles_csv.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            for category in _parse_categories(row.get("categories")):
                counts[category] += 1
    rows = [{"category": category, "coin_count": count} for category, count in counts.items()]
    rows.sort(key=lambda row: (-row["coin_count"], row["category"]))
    return rows


def _family_defaults(kind: str, family: str, category: str) -> tuple[int, int, int]:
    norm = _normalize_token(category)
    if kind in {"ecosystem", "portfolio_tag", "index_membership", "geography"}:
        return 0, 0, 0
    if kind == "regulatory_tag":
        return 1, 0, 1
    if family in {
        "stablecoin",
        "rwa",
        "tokenized_equity",
        "tokenized_commodity",
        "tokenized_treasury",
        "exchange_token",
        "payments",
        "privacy",
        "ai_depin",
        "defi",
        "oracle_interoperability",
        "smart_contract_platform",
        "identity",
        "meme",
    }:
        return 1, 1, 1
    if family in {
        "storage",
        "bridge_wrapped",
        "staking",
        "gaming",
        "metaverse_nft",
        "social",
        "launchpad",
        "governance",
        "derivatives",
        "analytics",
        "wallet",
        "prediction_gambling",
        "iot",
        "infrastructure",
    }:
        return 1, 0, 1
    if "stablecoin" in norm or "tokenized" in norm or "privacy" in norm or "payment" in norm or "exchange" in norm:
        return 1, 1, 1
    return 0, 0, 0


def _build_row(category: str, coin_count: int, kind: str, family: str, classifier: str, reason: str) -> dict[str, Any]:
    kind = KIND_ALIASES.get(_normalize_token(kind), kind)
    family = FAMILY_ALIASES.get(_normalize_token(family), family)
    if kind not in TAXONOMY_KINDS:
        kind = "other"
    if family not in NORMALIZED_FAMILIES:
        family = "other"
    is_fundamental_signal, use_for_bucketing, use_for_factoring = _family_defaults(kind, family, category)
    return {
        "category": category,
        "coin_count": int(coin_count),
        "taxonomy_kind": kind,
        "normalized_family": family,
        "is_fundamental_signal": is_fundamental_signal,
        "use_for_bucketing": use_for_bucketing,
        "use_for_factoring": use_for_factoring,
        "classifier": classifier,
        "reason": reason.strip(),
    }


def _rule_classify(category: str, coin_count: int) -> dict[str, Any] | None:
    norm = _normalize_token(category)

    if "ecosystem" in norm or norm == "base native":
        return _build_row(category, coin_count, "ecosystem", "ecosystem", "rule", "Chain or ecosystem membership tag.")
    if "portfolio" in norm or "holdings" in norm:
        return _build_row(category, coin_count, "portfolio_tag", "portfolio", "rule", "Investor or portfolio membership tag.")
    if "index" in norm:
        return _build_row(category, coin_count, "index_membership", "index", "rule", "Index membership tag.")
    if norm.startswith("made in "):
        return _build_row(category, coin_count, "geography", "geography", "rule", "Geographic origin tag.")
    if "alleged sec securities" in norm:
        return _build_row(category, coin_count, "regulatory_tag", "regulatory", "rule", "Regulatory classification tag.")

    family_patterns = [
        ("stablecoin", ["stablecoin", "synthetic dollar"], "economic_role"),
        ("rwa", ["real world assets", "rwa protocol", "ondo tokenized assets"], "asset_backing"),
        ("tokenized_equity", ["tokenized stock", "xstocks", "stock market themed"], "asset_backing"),
        ("tokenized_treasury", ["tokenized treasury", "money market fund", "t bills", "t bonds"], "asset_backing"),
        ("tokenized_commodity", ["tokenized gold", "tokenized commodities", "commodity backed"], "asset_backing"),
        ("exchange_token", ["exchange based tokens", "centralized exchange (cex) token"], "economic_role"),
        ("ai_depin", ["artificial intelligence (ai)", "ai agents", "ai applications", "ai framework", "depin", "bittensor subnets", "terminal of truths"], "application_vertical"),
        ("privacy", ["privacy blockchain", "privacy coins", "privacy infrastructure", "privacy", "zero knowledge (zk)"], "technical_mechanism"),
        ("payments", ["payment solutions"], "economic_role"),
        ("defi", ["decentralized finance (defi)", "decentralized exchange (dex)", "automated market maker (amm)", "yield farming", "liquid staking"], "economic_role"),
        ("governance", ["governance"], "economic_role"),
        ("derivatives", ["perpetuals", "derivatives", "options"], "economic_role"),
        ("smart_contract_platform", ["smart contract platform", "layer 1 (l1)", "layer 2 (l2)"], "technical_mechanism"),
        ("oracle_interoperability", ["oracle"], "technical_mechanism"),
        ("identity", ["decentralized identifier (did)", "identity"], "technical_mechanism"),
        ("storage", ["storage"], "application_vertical"),
        ("bridge_wrapped", ["wrapped tokens", "wrapped tokens", "wrapped tokens", "bridged tokens", "bridged stablecoin", "bridged usdc"], "technical_mechanism"),
        ("staking", ["proof of stake (pos)", "liquid staking tokens"], "technical_mechanism"),
        ("gaming", ["gaming (gamefi)", "play to earn", "rpg", "gaming utility token", "sports"], "application_vertical"),
        ("metaverse_nft", ["nft", "metaverse"], "application_vertical"),
        ("social", ["socialfi", "telegram apps"], "application_vertical"),
        ("launchpad", ["launchpad", "binance alpha spotlight", "binance hodler airdrops", "airdropped tokens"], "application_vertical"),
        ("meme", ["meme", "dog themed", "frog themed", "cat themed", "solana meme", "base meme", "politifi", "elon musk inspired", "ai meme", "the boy’s club", "murad picks", "chinese meme"], "community_narrative"),
        ("analytics", ["analytics"], "application_vertical"),
        ("wallet", ["wallets"], "application_vertical"),
        ("prediction_gambling", ["prediction markets", "gambling (gamblefi)"], "application_vertical"),
        ("iot", ["internet of things (iot)"], "application_vertical"),
        ("infrastructure", ["infrastructure", "mev protection"], "technical_mechanism"),
    ]
    for family, patterns, kind in family_patterns:
        if any(pattern in norm for pattern in patterns):
            return _build_row(category, coin_count, kind, family, "rule", "Pattern-based category normalization.")

    return None


def _build_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("You are normalizing raw CoinGecko category labels into a thesis-friendly taxonomy.")
    lines.append("Do not browse the web. Use only the category text.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "categories": [')
    lines.append("    {")
    lines.append('      "category": "string",')
    lines.append('      "taxonomy_kind": "string",')
    lines.append('      "normalized_family": "string",')
    lines.append('      "reason": "string"')
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")
    lines.append("Allowed taxonomy_kind values:")
    lines.append(", ".join(TAXONOMY_KINDS))
    lines.append("Allowed normalized_family values:")
    lines.append(", ".join(NORMALIZED_FAMILIES))
    lines.append("Rules:")
    lines.append("- `ecosystem`, `portfolio`, `index`, `geography`, and `regulatory` are metadata-like families, not economic archetypes.")
    lines.append("- Use `smart_contract_platform` for general chain/platform tags such as L1/L2/contract platform.")
    lines.append("- Use `oracle_interoperability` for oracle, cross-chain, and interoperability infrastructure.")
    lines.append("- Use `rwa`, `tokenized_equity`, `tokenized_commodity`, or `tokenized_treasury` for tokenized asset categories.")
    lines.append("- Use `meme` for community or culture-driven speculative tags.")
    lines.append("- Use `other` when none of the listed families fit cleanly.")
    lines.append("")
    lines.append("Categories to classify:")
    for row in rows:
        lines.append(f'- "{row["category"]}" (coin_count={row["coin_count"]})')
    return "\n".join(lines)


def _validate_payload(
    rows: list[dict[str, Any]],
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    expected = {row["category"]: row["coin_count"] for row in rows}
    items = payload.get("categories")
    if not isinstance(items, list):
        raise ValueError("Payload missing categories list.")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category", "")).strip()
        if not category or category not in expected or category in seen:
            continue
        seen.add(category)
        out.append(
            _build_row(
                category,
                expected[category],
                str(item.get("taxonomy_kind", "")).strip(),
                str(item.get("normalized_family", "")).strip(),
                "gemini",
                str(item.get("reason", "")).strip() or "Gemini semantic classification.",
            )
        )
    missing = [category for category in expected if category not in seen]
    if missing:
        raise ValueError(f"Gemini payload missing categories: {', '.join(missing[:8])}")
    return out


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _build_family_stats(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"category_count": 0, "coin_count": 0, "signal_count": 0, "bucketing_count": 0, "factoring_count": 0})
    for row in rows:
        target = grouped[row["normalized_family"]]
        target["category_count"] += 1
        target["coin_count"] += int(row["coin_count"])
        target["signal_count"] += int(row["is_fundamental_signal"])
        target["bucketing_count"] += int(row["use_for_bucketing"])
        target["factoring_count"] += int(row["use_for_factoring"])
    out: list[dict[str, Any]] = []
    for family, payload in grouped.items():
        out.append(
            {
                "normalized_family": family,
                "category_count": payload["category_count"],
                "coin_count_total": payload["coin_count"],
                "signal_category_count": payload["signal_count"],
                "bucketing_category_count": payload["bucketing_count"],
                "factoring_category_count": payload["factoring_count"],
            }
        )
    out.sort(key=lambda row: (-row["coin_count_total"], row["normalized_family"]))
    return out


def _build_report(rows: list[dict[str, Any]], family_stats: list[dict[str, Any]]) -> str:
    kind_counts = Counter(row["taxonomy_kind"] for row in rows)
    signal_rows = [row for row in rows if row["is_fundamental_signal"] == 1]
    nonsignal_rows = [row for row in rows if row["is_fundamental_signal"] == 0]
    lines: list[str] = []
    lines.append("# Crypto Category Taxonomy Report")
    lines.append("")
    lines.append("This report normalizes raw CoinGecko category labels into a reusable research taxonomy.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Unique raw categories: {len(rows)}")
    lines.append(f"- Fundamental signal categories: {len(signal_rows)}")
    lines.append(f"- Metadata or low-signal categories: {len(nonsignal_rows)}")
    lines.append("")
    lines.append("## Taxonomy Kind Distribution")
    lines.append("")
    for kind, count in kind_counts.most_common():
        lines.append(f"- {kind}: {count}")
    lines.append("")
    lines.append("## Largest Normalized Families")
    lines.append("")
    for row in family_stats[:20]:
        lines.append(
            "- "
            f"{row['normalized_family']}: raw_categories={row['category_count']}, "
            f"coin_count_total={row['coin_count_total']}, "
            f"bucketing_categories={row['bucketing_category_count']}, "
            f"factoring_categories={row['factoring_category_count']}"
        )
    lines.append("")
    lines.append("## Largest Signal Categories")
    lines.append("")
    for row in sorted(signal_rows, key=lambda row: (-row["coin_count"], row["category"]))[:25]:
        lines.append(
            "- "
            f"{row['category']} -> {row['normalized_family']} "
            f"(coin_count={row['coin_count']}, classifier={row['classifier']})"
        )
    lines.append("")
    lines.append("## Largest Non-Signal Categories")
    lines.append("")
    for row in sorted(nonsignal_rows, key=lambda row: (-row["coin_count"], row["category"]))[:20]:
        lines.append(
            "- "
            f"{row['category']} -> {row['normalized_family']} "
            f"(coin_count={row['coin_count']}, classifier={row['classifier']})"
        )
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Normalize raw CoinGecko categories into a reusable taxonomy.")
    ap.add_argument("--profiles-csv", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    ap.add_argument("--batch-size", type=int, default=40)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    ctx = _load_context_tools()
    categories = _collect_categories(args.profiles_csv.resolve())

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    taxonomy_json_path = output_dir / "coingecko_category_taxonomy.json"
    taxonomy_csv_path = output_dir / "coingecko_category_taxonomy.csv"
    family_stats_path = output_dir / "coingecko_category_family_stats.csv"
    raw_path = output_dir / "coingecko_category_taxonomy_raw.txt"

    existing_map: dict[str, dict[str, Any]] = {}
    raw_chunks: list[str] = []
    if taxonomy_json_path.exists():
        try:
            payload = json.loads(taxonomy_json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            payload = {}
        for row in payload.get("categories", []):
            category = str(row.get("category", "")).strip()
            if category:
                existing_map[category] = row

    pending_rows: list[dict[str, Any]] = []
    for row in categories:
        category = row["category"]
        if category in existing_map:
            continue
        rule_row = _rule_classify(category, row["coin_count"])
        if rule_row is not None:
            existing_map[category] = rule_row
            continue
        pending_rows.append(row)

    for start in range(0, len(pending_rows), args.batch_size):
        batch = pending_rows[start : start + args.batch_size]
        prompt = _build_prompt(batch)
        raw_text, payload = ctx._run_gemini(prompt)
        raw_chunks.append(raw_text.strip())
        classified_rows = _validate_payload(batch, payload)
        for row in classified_rows:
            existing_map[row["category"]] = row
        ordered_rows = [existing_map[row["category"]] for row in categories if row["category"] in existing_map]
        taxonomy_json_path.write_text(json.dumps({"categories": ordered_rows}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        raw_path.write_text("\n\n==== BATCH ====\n\n".join(raw_chunks).strip() + "\n", encoding="utf-8")

    final_rows = [existing_map[row["category"]] for row in categories if row["category"] in existing_map]
    family_stats = _build_family_stats(final_rows)

    taxonomy_json_path.write_text(json.dumps({"categories": final_rows}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    _write_csv(taxonomy_csv_path, final_rows)
    _write_csv(family_stats_path, family_stats)
    args.report_path.resolve().write_text(_build_report(final_rows, family_stats), encoding="utf-8")
    if raw_chunks and not raw_path.exists():
        raw_path.write_text("\n\n==== BATCH ====\n\n".join(raw_chunks).strip() + "\n", encoding="utf-8")

    print(f"[ok] wrote {taxonomy_json_path}")
    print(f"[ok] wrote {taxonomy_csv_path}")
    print(f"[ok] wrote {family_stats_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
