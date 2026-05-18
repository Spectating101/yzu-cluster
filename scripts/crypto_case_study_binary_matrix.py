#!/usr/bin/env python3
"""
Crypto Case Study Binary Factor Matrix Builder

Turns the text-heavy case-study context into an analysis-ready 0/1 feature matrix.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
_CONTEXT_SCRIPT = _HERE.with_name("crypto_research_context.py")

DEFAULT_INPUT_CSV = _REPO / "data_lake" / "crypto_pipeline" / "context" / "case_study_feature_matrix.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_case_study_binary_report.md"

BINARY_FACTORS = [
    (
        "is_store_of_value",
        "1 if the asset is primarily framed as reserve collateral, digital gold, treasury reserve, or long-term value preservation.",
    ),
    (
        "is_smart_contract_l1",
        "1 if the asset is fundamentally a base-layer smart-contract or generalized application platform.",
    ),
    (
        "is_stablecoin",
        "1 if the asset's core product is price stability or parity to a reference asset.",
    ),
    (
        "is_payments_rail",
        "1 if the asset's main role is transaction settlement, transfer rails, remittances, or bridge payments.",
    ),
    (
        "is_exchange_token",
        "1 if the asset is tightly tied to a centralized exchange or trading venue ecosystem.",
    ),
    (
        "is_rwa",
        "1 if the asset represents tokenized real-world assets, funds, credit, Treasuries, gold, or off-chain financial claims.",
    ),
    (
        "is_defi",
        "1 if the asset's main function is decentralized finance infrastructure, AMM, lending, collateral, or on-chain financial coordination.",
    ),
    (
        "is_privacy",
        "1 if privacy, anonymity, confidential transfer, or shielded computation is core to the asset's thesis.",
    ),
    (
        "is_ai_depin",
        "1 if the asset is materially linked to AI, compute, machine intelligence, or decentralized physical infrastructure demand.",
    ),
    (
        "is_interoperability",
        "1 if the asset is mainly about cross-chain messaging, interoperability, oracle rails, or connectivity middleware.",
    ),
    (
        "is_identity",
        "1 if identity, personhood, biometrics, credentialing, or decentralized ID is core to the asset's thesis.",
    ),
    (
        "is_meme_speculative",
        "1 if meme, community speculation, celebrity, or politi-fi demand is a central part of the thesis.",
    ),
    (
        "is_fiat_or_treasury_backed",
        "1 if price stability or backing depends mainly on fiat cash, bank deposits, Treasury bills, or cash equivalents.",
    ),
    (
        "is_real_world_asset_backed",
        "1 if the asset is backed by or represents off-chain financial or physical assets.",
    ),
    (
        "is_gold_backed",
        "1 if the backing or peg is directly tied to gold bullion or gold exposure.",
    ),
    (
        "is_crypto_collateral_backed",
        "1 if the structure depends on crypto collateral rather than fiat or off-chain assets.",
    ),
    (
        "is_synthetic_structure",
        "1 if the asset relies on hedging, derivatives, synthetic replication, or engineered parity rather than simple backing.",
    ),
    (
        "has_centralized_issuer",
        "1 if a company, issuer, foundation, or small operator set materially controls issuance, redemption, or product integrity.",
    ),
    (
        "requires_permissioned_access",
        "1 if access, issuance, redemption, or transfer is materially permissioned, whitelisted, or institution-gated.",
    ),
    (
        "has_staking_yield",
        "1 if staking or protocol yield is a central part of the asset's value proposition.",
    ),
    (
        "has_fee_burn_or_deflation",
        "1 if fee burn, token burn, buyback-and-burn, or supply reduction is a meaningful value-accrual mechanism.",
    ),
    (
        "has_exchange_fee_utility",
        "1 if exchange discounts, trading rebates, listing benefits, or venue utility are major demand drivers.",
    ),
    (
        "used_for_settlement",
        "1 if the asset is materially used as a settlement unit, transfer medium, liquidity rail, or payment instrument.",
    ),
    (
        "used_as_collateral",
        "1 if the asset is meaningfully framed as collateral, reserve backing, or treasury collateral within markets.",
    ),
    (
        "has_governance_role",
        "1 if voting, governance, or protocol control rights are a meaningful part of the asset's function.",
    ),
    (
        "exposed_to_token_unlocks_or_emissions",
        "1 if unlock schedules, inflation, emissions, or ongoing issuance are a relevant pressure in the thesis.",
    ),
    (
        "is_institutionally_oriented",
        "1 if the asset is clearly aimed at institutions, regulated finance, corporates, asset managers, or enterprise usage.",
    ),
    (
        "is_retail_speculative",
        "1 if retail trading, hype, social momentum, or speculative attention is a key demand source.",
    ),
    (
        "has_high_regulatory_sensitivity",
        "1 if legal, compliance, listing, or policy outcomes are a major determinant of the asset's outlook.",
    ),
    (
        "has_high_centralization_dependency",
        "1 if the thesis depends heavily on centralized operators, issuers, validators, exchanges, or managed ecosystems.",
    ),
    (
        "linked_to_ai_or_compute_demand",
        "1 if AI workloads, machine intelligence, compute demand, or data-center style usage are key demand drivers.",
    ),
    (
        "linked_to_privacy_demand",
        "1 if user demand for privacy, censorship resistance, or anonymity is a direct driver of adoption.",
    ),
    (
        "linked_to_identity_demand",
        "1 if the thesis depends on identity verification, credentials, personhood checks, or biometric workflows.",
    ),
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


def _coerce_binary(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return 1 if float(value) >= 0.5 else 0
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y"}:
        return 1
    return 0


def _join_text(row: dict[str, Any], fields: list[str]) -> str:
    return " | ".join(str(row.get(field, "") or "").strip().lower() for field in fields)


def _has_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _seed_value(seed_row: dict[str, Any] | None, factor_name: str) -> int:
    if not seed_row:
        return 0
    return _coerce_binary(seed_row.get(factor_name, 0))


def _clean_binary_row(local_row: dict[str, Any], seed_row: dict[str, Any] | None = None) -> dict[str, Any]:
    struct_text = _join_text(
        local_row,
        [
            "benchmark_bucket",
            "fundamental_archetype",
            "case_study_theme",
            "coin_type",
            "narrative_bucket",
            "economic_role",
            "thesis_use_case",
        ],
    )
    taxonomy_text = _join_text(
        local_row,
        [
            "benchmark_bucket",
            "fundamental_archetype",
            "coin_type",
            "economic_role",
        ],
    )
    mechanism_text = _join_text(
        local_row,
        [
            "backing_model",
            "value_accrual_model",
            "primary_demand_driver",
            "supply_regime",
        ],
    )
    backing_text = _join_text(local_row, ["backing_model", "coin_type"])
    risk_text = _join_text(local_row, ["current_catalysts", "main_risks", "analytics_explanation"])
    all_text = " | ".join(part for part in [struct_text, mechanism_text, risk_text] if part)

    benchmark_bucket = str(local_row.get("benchmark_bucket", "") or "").strip().lower()
    institutional_relevance = str(local_row.get("institutional_relevance", "") or "").strip().lower()
    regulatory_sensitivity = str(local_row.get("regulatory_sensitivity", "") or "").strip().lower()
    centralization_dependency = str(local_row.get("centralization_dependency", "") or "").strip().lower()

    is_store_of_value = int(
        benchmark_bucket == "store_of_value"
        or _has_any(
            taxonomy_text + " | " + struct_text,
            [
                "digital gold",
                "store of value",
                "treasury reserve",
                "wealth preservation",
                "reserve asset",
                "monetary premium",
                "safe haven",
            ],
        )
    )
    is_smart_contract_l1 = int(benchmark_bucket == "smart_contract_l1")
    is_stablecoin = int(
        _has_any(
            taxonomy_text + " | " + mechanism_text,
            [
                "stablecoin",
                "stable peg",
                "regulated stablecoin",
                "fiat-collateralized",
                "decentralized stablecoin",
                "synthetic dollar",
                "cdp stablecoin",
                "dollar stablecoin",
            ],
        )
    )
    is_payments_rail = int(
        benchmark_bucket == "payments"
        or _has_any(
            taxonomy_text + " | " + mechanism_text,
            [
                "payment settlement",
                "payments rail",
                "stablecoin rail",
                "cross-border",
                "remittance",
                "bridge asset",
                "medium of exchange",
                "settlement network",
            ],
        )
    )
    is_exchange_token = int(
        benchmark_bucket == "exchange_token"
        or _has_any(
            taxonomy_text + " | " + mechanism_text,
            [
                "exchange utility",
                "exchange token",
                "cex",
                "fee discount",
                "platform fee utility",
                "trading rebate",
                "exchange revenue",
            ],
        )
    )
    is_rwa = int(
        benchmark_bucket == "rwa"
        or _has_any(
            taxonomy_text + " | " + backing_text,
            [
                "real world assets",
                "tokenized treasury",
                "tokenized fund",
                "private credit",
                "tokenized money market",
                "tokenized us treasury",
                "tokenized debt security",
                "commodity-backed",
                "residential real estate loans",
                "loan tokenization",
            ],
        )
    )
    is_defi = int(
        benchmark_bucket == "defi"
        or _has_any(
            taxonomy_text + " | " + mechanism_text,
            [
                "decentralized finance",
                "defi",
                "automated market maker",
                "amm",
                "dex",
                "oracle network",
                "lending",
                "decentralized derivatives",
                "collateral",
            ],
        )
    )
    is_privacy = int(
        benchmark_bucket == "privacy"
        or _has_any(
            taxonomy_text,
            [
                "privacy",
                "shielded",
                "anonymity",
                "anonymous",
                "zero knowledge",
                "zk)",
                "zk ",
                "confidential",
            ],
        )
    )
    is_ai_depin = int(
        benchmark_bucket == "ai_depin"
        or _has_any(
            taxonomy_text,
            [
                "artificial intelligence",
                "machine intelligence",
                "depin",
                "compute",
                "gpu",
                "ai data layer",
            ],
        )
    )
    is_interoperability = int(
        benchmark_bucket == "interoperability"
        or _has_any(
            taxonomy_text + " | " + mechanism_text,
            [
                "interoperability",
                "oracle",
                "cross-chain",
                "middleware",
                "connectivity",
                "ccip",
            ],
        )
    )
    is_identity = int(
        benchmark_bucket == "identity"
        or _has_any(
            taxonomy_text,
            [
                "identity",
                "personhood",
                "biometric",
                "credential",
                "decentralized id",
            ],
        )
    )
    is_meme_speculative = int(
        benchmark_bucket == "meme_speculative"
        or _has_any(struct_text, ["meme", "memecoin", "politifi"])
    )
    is_fiat_or_treasury_backed = int(
        _has_any(
            backing_text,
            [
                "treasury",
                "cash",
                "cash equivalents",
                "bank deposit",
                "bank deposits",
                "us treasury",
                "t-bill",
                "money market fund",
            ],
        )
    )
    is_real_world_asset_backed = int(
        is_rwa
        or _has_any(
            backing_text,
            [
                "real estate",
                "gold",
                "treasury",
                "credit",
                "loan",
                "fund",
                "money market",
                "commodity-backed",
            ],
        )
    )
    is_gold_backed = int(_has_any(backing_text, ["gold", "bullion"]))
    is_crypto_collateral_backed = int(
        _has_any(
            mechanism_text,
            [
                "crypto assets",
                "crypto collateral",
                "multi-collateral",
                "over-collateralized",
                "lsts",
                "staked collateral",
            ],
        )
    )
    is_synthetic_structure = int(
        _has_any(
            struct_text + " | " + mechanism_text,
            [
                "synthetic",
                "delta-neutral",
                "derivative",
                "short perp",
                "engineered parity",
                "basis",
            ],
        )
    )
    has_centralized_issuer = int(
        centralization_dependency == "high"
        or is_exchange_token
        or is_fiat_or_treasury_backed
        or _has_any(
            taxonomy_text + " | " + backing_text,
            [
                "tokenized fund",
                "private credit token",
                "exchange revenue",
                "regulated stablecoin",
            ],
        )
    )
    requires_permissioned_access = int(
        _has_any(
            all_text,
            [
                "permissioned",
                "whitelist",
                "whitelisted",
                "authorized participant",
                "institutional only",
                "registered investment adviser",
                "permissioned validator",
            ],
        )
        or (
            benchmark_bucket == "rwa"
            and _has_any(taxonomy_text + " | " + backing_text, ["tokenized fund", "private credit"])
        )
    )
    has_staking_yield = int(_has_any(mechanism_text, ["staking"]))
    has_fee_burn_or_deflation = int(
        _has_any(mechanism_text, ["burn", "deflation"])
        or _has_any(str(local_row.get("supply_regime", "") or "").lower(), ["burn", "deflation"])
    )
    has_exchange_fee_utility = int(
        is_exchange_token
        or _has_any(mechanism_text, ["fee discount", "platform fee utility", "trading rebate"])
    )
    used_for_settlement = int(
        _has_any(
            struct_text + " | " + mechanism_text,
            [
                "settlement",
                "liquidity rail",
                "payment",
                "transfer",
                "bridge demand",
                "medium of exchange",
            ],
        )
    )
    used_as_collateral = int(
        _has_any(struct_text + " | " + mechanism_text, ["collateral", "reserve", "yield asset"])
        or is_stablecoin
        or _seed_value(seed_row, "used_as_collateral") == 1
    )
    has_governance_role = int(_has_any(struct_text + " | " + mechanism_text, ["governance", "voting"]))
    exposed_to_token_unlocks_or_emissions = int(
        _has_any(str(local_row.get("supply_regime", "") or "").lower(), ["issuance", "inflation", "emission", "unlock"])
        or _has_any(risk_text, ["unlock", "emission"])
    )
    is_institutionally_oriented = int(
        institutional_relevance == "high"
        or _has_any(
            struct_text + " | " + mechanism_text,
            [
                "institutional",
                "enterprise",
                "regulated finance",
                "asset manager",
                "corporate",
            ],
        )
    )
    is_retail_speculative = int(
        is_meme_speculative
        or _has_any(
            struct_text + " | " + mechanism_text,
            [
                "retail",
                "speculative appetite",
                "community",
                "social momentum",
                "hype",
            ],
        )
        or _seed_value(seed_row, "is_retail_speculative") == 1
    )
    has_high_regulatory_sensitivity = int(regulatory_sensitivity == "high")
    has_high_centralization_dependency = int(centralization_dependency == "high")
    linked_to_ai_or_compute_demand = int(
        is_ai_depin
        or _has_any(
            all_text,
            [
                "artificial intelligence",
                "machine intelligence",
                "compute",
                "gpu",
                "depin",
            ],
        )
    )
    linked_to_privacy_demand = int(is_privacy)
    linked_to_identity_demand = int(is_identity)

    out = {
        "coingecko_id": local_row.get("coingecko_id", ""),
        "symbol": local_row.get("symbol", ""),
        "name": local_row.get("name", ""),
        "is_store_of_value": is_store_of_value,
        "is_smart_contract_l1": is_smart_contract_l1,
        "is_stablecoin": is_stablecoin,
        "is_payments_rail": is_payments_rail,
        "is_exchange_token": is_exchange_token,
        "is_rwa": is_rwa,
        "is_defi": is_defi,
        "is_privacy": is_privacy,
        "is_ai_depin": is_ai_depin,
        "is_interoperability": is_interoperability,
        "is_identity": is_identity,
        "is_meme_speculative": is_meme_speculative,
        "is_fiat_or_treasury_backed": is_fiat_or_treasury_backed,
        "is_real_world_asset_backed": is_real_world_asset_backed,
        "is_gold_backed": is_gold_backed,
        "is_crypto_collateral_backed": is_crypto_collateral_backed,
        "is_synthetic_structure": is_synthetic_structure,
        "has_centralized_issuer": has_centralized_issuer,
        "requires_permissioned_access": requires_permissioned_access,
        "has_staking_yield": has_staking_yield,
        "has_fee_burn_or_deflation": has_fee_burn_or_deflation,
        "has_exchange_fee_utility": has_exchange_fee_utility,
        "used_for_settlement": used_for_settlement,
        "used_as_collateral": used_as_collateral,
        "has_governance_role": has_governance_role,
        "exposed_to_token_unlocks_or_emissions": exposed_to_token_unlocks_or_emissions,
        "is_institutionally_oriented": is_institutionally_oriented,
        "is_retail_speculative": is_retail_speculative,
        "has_high_regulatory_sensitivity": has_high_regulatory_sensitivity,
        "has_high_centralization_dependency": has_high_centralization_dependency,
        "linked_to_ai_or_compute_demand": linked_to_ai_or_compute_demand,
        "linked_to_privacy_demand": linked_to_privacy_demand,
        "linked_to_identity_demand": linked_to_identity_demand,
    }
    return out


def _build_binary_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("You are converting a crypto case-study feature dataset into a binary factor matrix for empirical analysis.")
    lines.append("Do not browse the web. Use only the structured records below.")
    lines.append("Return only JSON between BEGIN_JSON and END_JSON.")
    lines.append("Every factor must be an integer 0 or 1.")
    lines.append("Use 1 only when the provided record directly supports the factor.")
    lines.append("If ambiguous, unsupported, or only weakly implied, use 0.")
    lines.append("Schema:")
    lines.append("{")
    lines.append('  "coins": [')
    lines.append("    {")
    lines.append('      "coingecko_id": "string",')
    lines.append('      "symbol": "string",')
    lines.append('      "name": "string",')
    for factor_name, _ in BINARY_FACTORS:
        lines.append(f'      "{factor_name}": 0,')
    lines[-1] = lines[-1].rstrip(",")
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")
    lines.append("Factor definitions:")
    for factor_name, definition in BINARY_FACTORS:
        lines.append(f"- {factor_name}: {definition}")
    lines.append("")
    lines.append("Structured records:")
    trimmed_rows: list[dict[str, Any]] = []
    for row in rows:
        trimmed_rows.append(
            {
                "coingecko_id": row.get("coingecko_id", ""),
                "symbol": row.get("symbol", ""),
                "name": row.get("name", ""),
                "benchmark_bucket": row.get("benchmark_bucket", ""),
                "fundamental_archetype": row.get("fundamental_archetype", ""),
                "case_study_theme": row.get("case_study_theme", ""),
                "backing_model": row.get("backing_model", ""),
                "value_accrual_model": row.get("value_accrual_model", ""),
                "primary_demand_driver": row.get("primary_demand_driver", ""),
                "supply_regime": row.get("supply_regime", ""),
                "institutional_relevance": row.get("institutional_relevance", ""),
                "regulatory_sensitivity": row.get("regulatory_sensitivity", ""),
                "centralization_dependency": row.get("centralization_dependency", ""),
                "narrative_durability": row.get("narrative_durability", ""),
                "coin_type": row.get("coin_type", ""),
                "narrative_bucket": row.get("narrative_bucket", ""),
                "economic_role": row.get("economic_role", ""),
                "current_catalysts": row.get("current_catalysts", ""),
                "main_risks": row.get("main_risks", ""),
                "analytics_explanation": row.get("analytics_explanation", ""),
            }
        )
    lines.append(json.dumps(trimmed_rows, ensure_ascii=False))
    return "\n".join(lines)


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    factor_names = [name for name, _ in BINARY_FACTORS]
    for row in rows:
        item = {
            "coingecko_id": row.get("coingecko_id", ""),
            "symbol": row.get("symbol", ""),
            "name": row.get("name", ""),
        }
        for factor_name in factor_names:
            item[factor_name] = _coerce_binary(row.get(factor_name, 0))
        normalized.append(item)
    return normalized


def _write_binary_csv(path: Path, factor_rows: list[dict[str, Any]], local_rows_by_id: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    factor_names = [name for name, _ in BINARY_FACTORS]
    base_fields = ["coingecko_id", "symbol", "name"] + factor_names
    extra_fields = [
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
    fields = base_fields + extra_fields
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for item in factor_rows:
            coin_id = item["coingecko_id"]
            local = local_rows_by_id[coin_id]
            row = {key: item.get(key, "") for key in base_fields}
            for key in extra_fields:
                row[key] = local.get(key, "")
            writer.writerow(row)


def _factor_stats(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stats_rows: list[dict[str, Any]] = []
    factor_names = [name for name, _ in BINARY_FACTORS]
    for factor_name in factor_names:
        positives = [row for row in rows if int(row.get(factor_name, 0)) == 1]
        negatives = [row for row in rows if int(row.get(factor_name, 0)) == 0]

        def values(subset: list[dict[str, Any]], field: str) -> list[float]:
            out = [_safe_float(item.get(field)) for item in subset]
            return [value for value in out if value is not None]

        pos_sharpe = values(positives, "sharpe_ratio_90d")
        neg_sharpe = values(negatives, "sharpe_ratio_90d")
        pos_return = values(positives, "return_90d_pct")
        neg_return = values(negatives, "return_90d_pct")
        pos_vol = values(positives, "volatility_90d_ann_pct")
        neg_vol = values(negatives, "volatility_90d_ann_pct")
        pos_drawdown = values(positives, "drawdown_from_ath_pct")
        neg_drawdown = values(negatives, "drawdown_from_ath_pct")
        pos_cagr = values(positives, "cagr_pct")
        neg_cagr = values(negatives, "cagr_pct")

        stats_rows.append(
            {
                "factor_name": factor_name,
                "positive_count": len(positives),
                "negative_count": len(negatives),
                "median_sharpe_positive": round(statistics.median(pos_sharpe), 3) if pos_sharpe else "",
                "median_sharpe_negative": round(statistics.median(neg_sharpe), 3) if neg_sharpe else "",
                "median_sharpe_gap": round(statistics.median(pos_sharpe) - statistics.median(neg_sharpe), 3)
                if pos_sharpe and neg_sharpe
                else "",
                "median_return_positive": round(statistics.median(pos_return), 3) if pos_return else "",
                "median_return_negative": round(statistics.median(neg_return), 3) if neg_return else "",
                "median_vol_positive": round(statistics.median(pos_vol), 3) if pos_vol else "",
                "median_vol_negative": round(statistics.median(neg_vol), 3) if neg_vol else "",
                "median_drawdown_positive": round(statistics.median(pos_drawdown), 3) if pos_drawdown else "",
                "median_drawdown_negative": round(statistics.median(neg_drawdown), 3) if neg_drawdown else "",
                "median_cagr_positive": round(statistics.median(pos_cagr), 3) if pos_cagr else "",
                "median_cagr_negative": round(statistics.median(neg_cagr), 3) if neg_cagr else "",
                "sample_positive_coins": " | ".join(item.get("coingecko_id", "") for item in positives[:8]),
            }
        )
    return stats_rows


def _write_factor_stats_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "factor_name",
        "positive_count",
        "negative_count",
        "median_sharpe_positive",
        "median_sharpe_negative",
        "median_sharpe_gap",
        "median_return_positive",
        "median_return_negative",
        "median_vol_positive",
        "median_vol_negative",
        "median_drawdown_positive",
        "median_drawdown_negative",
        "median_cagr_positive",
        "median_cagr_negative",
        "sample_positive_coins",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _build_report(
    payload: dict[str, Any],
    factor_rows: list[dict[str, Any]],
    stats_rows: list[dict[str, Any]],
) -> str:
    prevalence = Counter()
    for row in factor_rows:
        for factor_name, _ in BINARY_FACTORS:
            prevalence[factor_name] += int(row.get(factor_name, 0))

    lines: list[str] = []
    lines.append("# Crypto Case Study Binary Factor Report")
    lines.append("")
    lines.append(f"Generated: `{payload.get('generated_at', '')}`")
    lines.append("")
    lines.append("This report converts the normalized crypto case-study features into 0/1 columns that are ready for empirical analysis.")
    lines.append("The intent is to make the research layer directly usable for grouped tests, ablations, and regressions.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Total coins: {len(factor_rows)}")
    lines.append(f"- Binary factors: {len(BINARY_FACTORS)}")
    lines.append(
        "- Most common positive factors: "
        + ", ".join(f"{name} ({count})" for name, count in prevalence.most_common(10))
    )
    lines.append("")

    eligible = [row for row in stats_rows if int(row["positive_count"]) >= 3]
    top_positive = sorted(
        [row for row in eligible if row["median_sharpe_positive"] != ""],
        key=lambda item: float(item["median_sharpe_positive"]),
        reverse=True,
    )[:10]
    top_negative = sorted(
        [row for row in eligible if row["median_sharpe_positive"] != ""],
        key=lambda item: float(item["median_sharpe_positive"]),
    )[:10]
    largest_gap = sorted(
        [row for row in eligible if row["median_sharpe_gap"] != ""],
        key=lambda item: abs(float(item["median_sharpe_gap"])),
        reverse=True,
    )[:12]

    lines.append("## Highest Median Sharpe Factors")
    lines.append("")
    for row in top_positive:
        lines.append(
            "- "
            f"{row['factor_name']}: positives={row['positive_count']}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}, "
            f"sample={row['sample_positive_coins']}"
        )
    lines.append("")

    lines.append("## Lowest Median Sharpe Factors")
    lines.append("")
    for row in top_negative:
        lines.append(
            "- "
            f"{row['factor_name']}: positives={row['positive_count']}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}, "
            f"sample={row['sample_positive_coins']}"
        )
    lines.append("")

    lines.append("## Largest Positive/Negative Sharpe Gaps")
    lines.append("")
    for row in largest_gap:
        lines.append(
            "- "
            f"{row['factor_name']}: positive_count={row['positive_count']}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_sharpe_negative={row['median_sharpe_negative']}, "
            f"gap={row['median_sharpe_gap']}"
        )
    lines.append("")

    lines.append("## Suggested Tests")
    lines.append("")
    lines.append("- Run factor-by-factor cross-sectional comparisons of 90d Sharpe, return, volatility, and drawdown.")
    lines.append("- Use these binary columns as regressors alongside market-cap or history-length controls.")
    lines.append("- Compare orthogonal flags such as `is_rwa`, `used_for_settlement`, `has_centralized_issuer`, and `exposed_to_token_unlocks_or_emissions`.")
    lines.append("- Treat bucket fields as high-level taxonomy and the new binary columns as mechanism-level explanatory variables.")
    lines.append("")
    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build a binary factor matrix from the crypto case-study feature matrix.")
    ap.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    ap.add_argument("--batch-size", type=int, default=12)
    ap.add_argument("--output-stem", default="case_study_binary_factors")
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
    stats_csv_path = output_dir / f"{stem}_stats.csv"

    raw_chunks: list[str] = []
    merged_payload: dict[str, Any] = {"coins": []}

    for idx, batch in enumerate(batches, start=1):
        print(f"[info] batch {idx}/{len(batches)}: {', '.join(row['coingecko_id'] for row in batch)}", flush=True)
        prompt = _build_binary_prompt(batch)
        raw_text, payload = ctx._run_gemini(prompt)
        normalized_rows = _normalize_rows(payload.get("coins", []))
        seed_rows_by_id = {row["coingecko_id"]: row for row in normalized_rows}
        cleaned_rows = [
            _clean_binary_row(local_row, seed_rows_by_id.get(local_row["coingecko_id"]))
            for local_row in batch
        ]
        raw_chunks.append(f"\n===== BATCH {idx} =====\n{raw_text}\n")
        merged_payload["coins"].extend(cleaned_rows)

        checkpoint_payload = {
            "generated_at": ctx._now_iso(),
            "coins": merged_payload["coins"],
        }
        ctx._write_text(raw_path, "\n".join(raw_chunks))
        ctx._write_json(json_path, checkpoint_payload)

    rows_by_id = {row["coingecko_id"]: row for row in merged_payload["coins"]}
    ordered_rows = [rows_by_id[row["coingecko_id"]] for row in input_rows if row["coingecko_id"] in rows_by_id]
    payload = {
        "generated_at": ctx._now_iso(),
        "coins": ordered_rows,
    }

    joined_rows = [{**row, **local_rows_by_id[row["coingecko_id"]]} for row in ordered_rows if row["coingecko_id"] in local_rows_by_id]
    stats_rows = _factor_stats(joined_rows)

    _write_binary_csv(csv_path, ordered_rows, local_rows_by_id)
    _write_factor_stats_csv(stats_csv_path, stats_rows)
    ctx._write_text(raw_path, "\n".join(raw_chunks))
    ctx._write_json(json_path, payload)
    ctx._write_text(args.report_path.resolve(), _build_report(payload, ordered_rows, stats_rows))

    print(f"[ok] wrote {raw_path}")
    print(f"[ok] wrote {json_path}")
    print(f"[ok] wrote {csv_path}")
    print(f"[ok] wrote {stats_csv_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
