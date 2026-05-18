#!/usr/bin/env python3
"""
Crypto Universe Scaleout

Propagates the anchor-labeled case-study taxonomy into the larger mature-quality
crypto universe using category priors, direct category rules, and anchor-peer
evidence.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]

DEFAULT_ANALYTICS = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_analytics_clean.csv"
DEFAULT_PROFILES = _REPO / "data_lake" / "crypto_pipeline" / "exports" / "coin_profiles_clean.csv"
DEFAULT_FEATURES = _REPO / "data_lake" / "crypto_pipeline" / "context" / "case_study_feature_matrix.csv"
DEFAULT_BINARY = _REPO / "data_lake" / "crypto_pipeline" / "context" / "case_study_binary_factors.csv"
DEFAULT_UNIVERSE_SELECTION = _REPO / "data_lake" / "crypto_pipeline" / "context" / "research_universe_selection.csv"
DEFAULT_TAXONOMY = _REPO / "data_lake" / "crypto_pipeline" / "context" / "coingecko_category_taxonomy.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_universe_scaleout_report.md"

BUCKET_PATTERNS = {
    "stablecoin": [
        "stablecoin",
        "usd stablecoin",
        "fiat-backed stablecoin",
        "crypto-backed stablecoin",
        "stablecoin issuer",
        "yield-bearing stablecoin",
    ],
    "rwa": [
        "real world assets",
        "tokenized assets",
        "tokenized gold",
        "tokenized fund",
        "tokenized money market",
        "commodity-backed",
        "tokenized treasury",
    ],
    "exchange_token": [
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
        "zero knowledge (zk)",
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
    "meme_speculative": [
        "meme",
        "dog-themed",
        "politifi",
    ],
    "interoperability": [
        "infrastructure",
        "oracle",
    ],
    "smart_contract_l1": [
        "smart contract platform",
        "layer 1 (l1)",
        "layer 2 (l2)",
        "base native",
    ],
    "identity": [
        "decentralized identifier (did)",
        "identity",
    ],
}

STRUCTURAL_FACTOR_BUCKET_MAP = {
    "is_smart_contract_l1": "smart_contract_l1",
    "is_stablecoin": "stablecoin",
    "is_payments_rail": "payments",
    "is_exchange_token": "exchange_token",
    "is_rwa": "rwa",
    "is_defi": "defi",
    "is_privacy": "privacy",
    "is_ai_depin": "ai_depin",
    "is_interoperability": "interoperability",
    "is_identity": "identity",
    "is_meme_speculative": "meme_speculative",
}

DIRECT_FACTOR_PATTERNS = {
    "is_fiat_or_treasury_backed": ["fiat-backed stablecoin", "usd stablecoin", "money market", "tokenized treasury", "stablecoin issuer"],
    "is_real_world_asset_backed": ["real world assets", "tokenized assets", "tokenized gold", "tokenized fund", "commodity-backed", "tokenized treasury"],
    "is_gold_backed": ["tokenized gold"],
    "is_crypto_collateral_backed": ["crypto-backed stablecoin"],
    "has_exchange_fee_utility": ["exchange-based tokens", "centralized exchange (cex) token"],
    "linked_to_ai_or_compute_demand": ["artificial intelligence (ai)", "depin"],
    "linked_to_privacy_demand": ["privacy blockchain", "privacy", "zero knowledge (zk)"],
    "linked_to_identity_demand": ["decentralized identifier (did)", "identity"],
}

DIRECT_BUCKET_FAMILY_MAP = {
    "stablecoin": "stablecoin",
    "rwa": "rwa",
    "tokenized_equity": "rwa",
    "tokenized_commodity": "rwa",
    "tokenized_treasury": "rwa",
    "exchange_token": "exchange_token",
    "payments": "payments",
    "privacy": "privacy",
    "ai_depin": "ai_depin",
    "defi": "defi",
    "oracle_interoperability": "interoperability",
    "smart_contract_platform": "smart_contract_l1",
    "identity": "identity",
    "meme": "meme_speculative",
}

DIRECT_FACTOR_FAMILY_MAP = {
    "stablecoin": [
        "is_stablecoin",
        "used_for_settlement",
        "has_high_regulatory_sensitivity",
        "has_high_centralization_dependency",
        "has_centralized_issuer",
        "is_institutionally_oriented",
    ],
    "rwa": [
        "is_rwa",
        "is_real_world_asset_backed",
        "has_high_regulatory_sensitivity",
        "is_institutionally_oriented",
    ],
    "tokenized_commodity": [
        "is_rwa",
        "is_real_world_asset_backed",
        "is_gold_backed",
        "is_institutionally_oriented",
    ],
    "tokenized_treasury": [
        "is_rwa",
        "is_real_world_asset_backed",
        "is_fiat_or_treasury_backed",
        "used_for_settlement",
        "is_institutionally_oriented",
    ],
    "tokenized_equity": [
        "is_rwa",
        "is_real_world_asset_backed",
        "is_institutionally_oriented",
    ],
    "exchange_token": [
        "is_exchange_token",
        "has_exchange_fee_utility",
        "has_high_regulatory_sensitivity",
        "has_high_centralization_dependency",
        "has_centralized_issuer",
    ],
    "payments": [
        "is_payments_rail",
        "used_for_settlement",
        "has_high_regulatory_sensitivity",
    ],
    "privacy": [
        "is_privacy",
        "linked_to_privacy_demand",
        "has_high_regulatory_sensitivity",
    ],
    "ai_depin": [
        "is_ai_depin",
        "linked_to_ai_or_compute_demand",
    ],
    "defi": [
        "is_defi",
        "has_governance_role",
        "used_as_collateral",
    ],
    "governance": [
        "is_defi",
        "has_governance_role",
    ],
    "derivatives": [
        "is_defi",
    ],
    "staking": [
        "has_staking_yield",
        "used_as_collateral",
    ],
    "oracle_interoperability": [
        "is_interoperability",
        "used_as_collateral",
    ],
    "infrastructure": [
        "is_interoperability",
    ],
    "bridge_wrapped": [
        "is_interoperability",
    ],
    "smart_contract_platform": [
        "is_smart_contract_l1",
        "used_as_collateral",
    ],
    "identity": [
        "is_identity",
        "linked_to_identity_demand",
    ],
    "meme": [
        "is_meme_speculative",
        "is_retail_speculative",
    ],
}


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


def _load_taxonomy(taxonomy_csv: Path) -> dict[str, dict[str, Any]]:
    if not taxonomy_csv.exists():
        return {}
    df = pd.read_csv(taxonomy_csv)
    out: dict[str, dict[str, Any]] = {}
    for _, row in df.iterrows():
        category = str(row.get("category", "")).strip()
        if not category:
            continue
        out[category] = {
            "normalized_family": str(row.get("normalized_family", "")).strip(),
            "is_fundamental_signal": int(row.get("is_fundamental_signal", 0) or 0),
            "use_for_bucketing": int(row.get("use_for_bucketing", 0) or 0),
            "use_for_factoring": int(row.get("use_for_factoring", 0) or 0),
        }
    return out


def _signal_categories(categories: list[str], taxonomy: dict[str, dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for category in categories:
        payload = taxonomy.get(category)
        if payload and int(payload.get("is_fundamental_signal", 0)) == 1:
            out.append(category)
    return out


def _signal_families(
    categories: list[str],
    taxonomy: dict[str, dict[str, Any]],
    *,
    bucketing_only: bool = False,
    factoring_only: bool = False,
) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for category in categories:
        payload = taxonomy.get(category)
        if not payload:
            continue
        if bucketing_only and int(payload.get("use_for_bucketing", 0)) != 1:
            continue
        if factoring_only and int(payload.get("use_for_factoring", 0)) != 1:
            continue
        if not bucketing_only and not factoring_only and int(payload.get("is_fundamental_signal", 0)) != 1:
            continue
        family = str(payload.get("normalized_family", "")).strip()
        if family and family not in seen:
            seen.add(family)
            out.append(family)
    return out


def _signal_family_values(taxonomy: dict[str, dict[str, Any]]) -> list[str]:
    families = {
        str(payload.get("normalized_family", "")).strip()
        for payload in taxonomy.values()
        if int(payload.get("is_fundamental_signal", 0)) == 1 and str(payload.get("normalized_family", "")).strip()
    }
    return sorted(family for family in families if family != "other")


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _entropy(probs: list[float]) -> float:
    total = 0.0
    for prob in probs:
        if prob > 0:
            total -= prob * math.log(prob, 2)
    return total


def _prepare_universe(analytics_csv: Path, profiles_csv: Path, selection_csv: Path) -> pd.DataFrame:
    analytics = pd.read_csv(analytics_csv)
    profiles = pd.read_csv(profiles_csv)
    selection = pd.read_csv(selection_csv)

    merged = analytics.merge(
        profiles[["coingecko_id", "categories", "homepage"]],
        on="coingecko_id",
        how="left",
    ).merge(
        selection[["coingecko_id", "case_study_focus", "research_core", "research_broad"]],
        on="coingecko_id",
        how="left",
    )
    merged["rank_idx"] = range(1, len(merged) + 1)
    merged["categories_list"] = merged["categories"].map(_parse_categories)
    merged["cat_count"] = merged["categories_list"].map(len)
    merged["has_homepage"] = merged["homepage"].fillna("").astype(str).str.strip().ne("")
    merged["case_study_focus"] = merged["case_study_focus"].fillna(0).astype(int)
    merged["research_core"] = merged["research_core"].fillna(0).astype(int)
    merged["research_broad"] = merged["research_broad"].fillna(0).astype(int)
    merged["quality_floor"] = ((merged["has_homepage"]) & (merged["cat_count"] >= 3)).astype(int)
    merged["mature_quality"] = ((merged["quality_floor"] == 1) & (merged["days_of_history"].fillna(0) >= 365)).astype(int)
    return merged


def _prepare_anchor(features_csv: Path, binary_csv: Path, profiles_csv: Path) -> tuple[pd.DataFrame, list[str]]:
    features = pd.read_csv(features_csv)
    binary = pd.read_csv(binary_csv)
    profiles = pd.read_csv(profiles_csv)[["coingecko_id", "categories"]]

    factor_cols = [
        col
        for col in binary.columns
        if col.startswith(("is_", "has_", "used_", "linked_", "requires_", "exposed_"))
    ]

    anchor = features.merge(binary[["coingecko_id"] + factor_cols], on="coingecko_id", how="left").merge(
        profiles,
        on="coingecko_id",
        how="left",
    )
    anchor["categories_list"] = anchor["categories"].map(_parse_categories)
    return anchor, factor_cols


def _build_category_priors(anchor: pd.DataFrame, factor_cols: list[str]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    bucket_values = sorted(anchor["benchmark_bucket"].dropna().astype(str).unique().tolist())
    priors: dict[str, dict[str, Any]] = {}

    exploded = anchor[["coingecko_id", "benchmark_bucket", "signal_categories_list"] + factor_cols].explode("signal_categories_list")
    exploded = exploded[exploded["signal_categories_list"].fillna("").astype(str).str.strip() != ""].copy()

    for category, sub in exploded.groupby("signal_categories_list"):
        support = len(sub["coingecko_id"].unique())
        bucket_counts = Counter(sub["benchmark_bucket"].astype(str).tolist())
        total = sum(bucket_counts.values())
        bucket_probs = {bucket: bucket_counts.get(bucket, 0) / total for bucket in bucket_values}
        factor_probs = {factor: float(sub[factor].mean()) for factor in factor_cols}
        probs = list(bucket_probs.values())
        top_bucket = max(bucket_probs.items(), key=lambda item: item[1])[0] if bucket_probs else "other"
        priors[str(category)] = {
            "support": support,
            "top_bucket": top_bucket,
            "bucket_probs": bucket_probs,
            "factor_probs": factor_probs,
            "bucket_entropy": _entropy(probs),
        }

    return priors, bucket_values


def _write_category_priors(path: Path, priors: dict[str, dict[str, Any]], factor_cols: list[str], bucket_values: list[str]) -> None:
    rows: list[dict[str, Any]] = []
    for category, payload in priors.items():
        row: dict[str, Any] = {
            "category": category,
            "support": payload["support"],
            "top_bucket": payload["top_bucket"],
            "bucket_entropy": round(payload["bucket_entropy"], 4),
        }
        for bucket in bucket_values:
            row[f"bucket_prob__{bucket}"] = round(payload["bucket_probs"].get(bucket, 0.0), 4)
        for factor in factor_cols:
            row[f"factor_prob__{factor}"] = round(payload["factor_probs"].get(factor, 0.0), 4)
        rows.append(row)
    pd.DataFrame(rows).sort_values(["support", "category"], ascending=[False, True]).to_csv(path, index=False)


def _bucket_direct_scores(bucket_families: list[str], categories: list[str], name: str, symbol: str) -> Counter:
    scores: Counter = Counter()
    name_text = f"{name} {symbol}".lower()

    for family in bucket_families:
        bucket = DIRECT_BUCKET_FAMILY_MAP.get(family)
        if bucket:
            scores[bucket] += 1.0

    lowered = [cat.lower() for cat in categories]
    for bucket, patterns in BUCKET_PATTERNS.items():
        for cat in lowered:
            if any(pattern in cat for pattern in patterns):
                scores[bucket] += 0.35

    if any(token in name_text for token in [" usd", "usd ", " usd", "eur", "dollar"]) and scores["stablecoin"] > 0:
        scores["stablecoin"] += 0.5
    if any(token in name_text for token in ["gold", "xaut", "paxg"]):
        scores["rwa"] += 0.5
    if any(token in name_text for token in ["meme", "pepe", "dog", "trump"]) and scores["meme_speculative"] > 0:
        scores["meme_speculative"] += 0.5

    return scores


def _factor_direct_scores(
    categories: list[str],
    factor_families: list[str],
    predicted_bucket: str,
    factor_cols: list[str],
) -> dict[str, float]:
    lowered = [cat.lower() for cat in categories]
    scores: dict[str, float] = defaultdict(float)

    for factor, bucket in STRUCTURAL_FACTOR_BUCKET_MAP.items():
        if predicted_bucket == bucket:
            scores[factor] = max(scores[factor], 1.0)

    for factor, patterns in DIRECT_FACTOR_PATTERNS.items():
        for cat in lowered:
            if any(pattern in cat for pattern in patterns):
                scores[factor] = max(scores[factor], 1.0)

    factor_col_set = set(factor_cols)
    for family in factor_families:
        for factor in DIRECT_FACTOR_FAMILY_MAP.get(family, []):
            if factor in factor_col_set:
                scores[factor] = max(scores[factor], 1.0)

    if predicted_bucket in {"stablecoin", "rwa", "payments", "exchange_token", "privacy"}:
        scores["has_high_regulatory_sensitivity"] = max(scores["has_high_regulatory_sensitivity"], 0.8)
    if predicted_bucket in {"stablecoin", "rwa", "exchange_token"}:
        scores["is_institutionally_oriented"] = max(scores["is_institutionally_oriented"], 0.7)
        scores["has_high_centralization_dependency"] = max(scores["has_high_centralization_dependency"], 0.7)
    if predicted_bucket in {"meme_speculative"}:
        scores["is_retail_speculative"] = max(scores["is_retail_speculative"], 1.0)

    return dict(scores)


def _predict_row(
    row: pd.Series,
    priors: dict[str, dict[str, Any]],
    bucket_values: list[str],
    factor_cols: list[str],
    family_cols: list[str],
    anchor_ref: list[dict[str, Any]],
) -> dict[str, Any]:
    categories = row["categories_list"]
    signal_categories = row["signal_categories_list"]
    signal_families = row["signal_families_list"]
    bucket_families = row["bucket_families_list"]
    factor_families = row["factor_families_list"]
    name = str(row["name"])
    symbol = str(row["symbol"])
    direct_scores = _bucket_direct_scores(bucket_families, categories, name, symbol)
    bucket_scores: Counter = Counter(direct_scores)
    learned_factor_scores: dict[str, float] = {factor: 0.0 for factor in factor_cols}
    category_votes = 0.0
    anchor_support = 0
    evidence_categories: list[str] = []

    for category in signal_categories:
        prior = priors.get(category)
        if not prior:
            continue
        weight = min(3, int(prior["support"]))
        anchor_support += int(prior["support"])
        evidence_categories.append(category)
        category_votes += weight
        for bucket in bucket_values:
            bucket_scores[bucket] += prior["bucket_probs"].get(bucket, 0.0) * weight
        for factor in factor_cols:
            learned_factor_scores[factor] += prior["factor_probs"].get(factor, 0.0) * weight

    if category_votes > 0:
        for factor in factor_cols:
            learned_factor_scores[factor] /= category_votes

    if bucket_scores:
        ranked = bucket_scores.most_common()
        predicted_bucket, top_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    else:
        predicted_bucket, top_score, second_score = "other", 0.0, 0.0

    direct_hit_count = sum(1 for value in direct_scores.values() if value > 0)
    margin = float(top_score - second_score)
    if direct_hit_count >= 2 or (top_score >= 2.0 and margin >= 0.75):
        confidence = "high"
    elif top_score >= 0.75 or direct_hit_count >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    direct_factor_scores = _factor_direct_scores(categories, factor_families, predicted_bucket, factor_cols)
    factor_scores: dict[str, float] = {}
    factor_values: dict[str, int] = {}
    for factor in factor_cols:
        score = max(learned_factor_scores.get(factor, 0.0), direct_factor_scores.get(factor, 0.0))
        factor_scores[factor] = round(score, 4)
        factor_values[factor] = 1 if score >= 0.5 else 0

    cat_set = set(cat.lower() for cat in signal_categories)
    peer_rows: list[tuple[float, str]] = []
    for anchor in anchor_ref:
        sim = _jaccard(cat_set, anchor["categories_set"])
        if predicted_bucket == anchor["benchmark_bucket"]:
            sim += 0.15
        if sim > 0:
            peer_rows.append((sim, anchor["coingecko_id"]))
    peer_rows.sort(key=lambda item: (-item[0], item[1]))
    top_peers = [coin_id for _, coin_id in peer_rows[:3]]

    out = {
        "coingecko_id": row["coingecko_id"],
        "symbol": row["symbol"],
        "name": row["name"],
        "rank_idx": int(row["rank_idx"]),
        "days_of_history": int(row["days_of_history"]),
        "cat_count": int(row["cat_count"]),
        "signal_category_count": int(len(signal_categories)),
        "predicted_bucket": predicted_bucket,
        "bucket_score": round(float(top_score), 4),
        "bucket_margin": round(float(margin), 4),
        "bucket_confidence": confidence,
        "anchor_support": int(anchor_support),
        "evidence_categories": " | ".join(evidence_categories[:6]),
        "anchor_peers": " | ".join(top_peers),
        "case_study_focus": int(row["case_study_focus"]),
        "research_core": int(row["research_core"]),
        "research_broad": int(row["research_broad"]),
        "homepage": row["homepage"],
        "categories_preview": " | ".join(categories[:8]),
        "signal_categories_preview": " | ".join(signal_categories[:8]),
        "signal_families_preview": " | ".join(signal_families[:8]),
        "price_usd": row["price_usd"],
        "return_90d_pct": row["return_90d_pct"],
        "sharpe_ratio_90d": row["sharpe_ratio_90d"],
        "volatility_90d_ann_pct": row["volatility_90d_ann_pct"],
        "drawdown_from_ath_pct": row["drawdown_from_ath_pct"],
        "cagr_pct": row["cagr_pct"],
    }
    for factor in factor_cols:
        out[f"{factor}__score"] = factor_scores[factor]
        out[factor] = factor_values[factor]
    signal_family_set = set(signal_families)
    for family in family_cols:
        out[f"family__{family}"] = 1 if family in signal_family_set else 0
    return out


def _bucket_stats(df: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for bucket, sub in df.groupby("predicted_bucket"):
        rows.append(
            {
                "predicted_bucket": bucket,
                "coin_count": len(sub),
                "high_confidence_count": int((sub["bucket_confidence"] == "high").sum()),
                "median_sharpe_ratio_90d": round(sub["sharpe_ratio_90d"].median(), 4),
                "median_return_90d_pct": round(sub["return_90d_pct"].median(), 4),
                "median_volatility_90d_ann_pct": round(sub["volatility_90d_ann_pct"].median(), 4),
                "median_drawdown_from_ath_pct": round(sub["drawdown_from_ath_pct"].median(), 4),
                "median_cagr_pct": round(sub["cagr_pct"].median(), 4),
            }
        )
    return pd.DataFrame(rows).sort_values(["coin_count", "predicted_bucket"], ascending=[False, True])


def _factor_stats(df: pd.DataFrame, factor_cols: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for factor in factor_cols:
        pos = df[df[factor] == 1]
        neg = df[df[factor] == 0]
        if pos.empty:
            continue
        pos_median = pos["sharpe_ratio_90d"].median()
        neg_median = neg["sharpe_ratio_90d"].median() if not neg.empty else float("nan")
        rows.append(
            {
                "factor_name": factor,
                "positive_count": len(pos),
                "negative_count": len(neg),
                "median_sharpe_positive": round(pos_median, 4),
                "median_sharpe_negative": round(neg_median, 4) if not math.isnan(neg_median) else "",
                "median_sharpe_gap": round(pos_median - neg_median, 4) if not math.isnan(neg_median) else "",
                "median_return_positive": round(pos["return_90d_pct"].median(), 4),
                "median_return_negative": round(neg["return_90d_pct"].median(), 4) if not neg.empty else "",
                "sample_positive_coins": " | ".join(pos["coingecko_id"].head(8).tolist()),
            }
        )
    return pd.DataFrame(rows).sort_values(["positive_count", "factor_name"], ascending=[False, True])


def _family_stats(df: pd.DataFrame, family_cols: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for family in family_cols:
        col = f"family__{family}"
        pos = df[df[col] == 1]
        neg = df[df[col] == 0]
        if pos.empty:
            continue
        pos_median = pos["sharpe_ratio_90d"].median()
        neg_median = neg["sharpe_ratio_90d"].median() if not neg.empty else float("nan")
        rows.append(
            {
                "family_name": family,
                "positive_count": len(pos),
                "negative_count": len(neg),
                "median_sharpe_positive": round(pos_median, 4),
                "median_sharpe_negative": round(neg_median, 4) if not math.isnan(neg_median) else "",
                "median_sharpe_gap": round(pos_median - neg_median, 4) if not math.isnan(neg_median) else "",
                "median_return_positive": round(pos["return_90d_pct"].median(), 4),
                "median_return_negative": round(neg["return_90d_pct"].median(), 4) if not neg.empty else "",
                "sample_positive_coins": " | ".join(pos["coingecko_id"].head(8).tolist()),
            }
        )
    return pd.DataFrame(rows).sort_values(["positive_count", "family_name"], ascending=[False, True])


def _label_subset(
    subset_df: pd.DataFrame,
    priors: dict[str, dict[str, Any]],
    bucket_values: list[str],
    factor_cols: list[str],
    family_cols: list[str],
    anchor_ref: list[dict[str, Any]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    labeled_rows = [
        _predict_row(row, priors, bucket_values, factor_cols, family_cols, anchor_ref)
        for _, row in subset_df.iterrows()
    ]
    labeled_df = pd.DataFrame(labeled_rows).sort_values("rank_idx")
    bucket_stats = _bucket_stats(labeled_df)
    factor_stats = _factor_stats(labeled_df, factor_cols)
    family_stats = _family_stats(labeled_df, family_cols)
    return labeled_df, bucket_stats, factor_stats, family_stats


def _build_report(
    universe_df: pd.DataFrame,
    quality_floor_df: pd.DataFrame,
    labeled_df: pd.DataFrame,
    bucket_stats: pd.DataFrame,
    factor_stats: pd.DataFrame,
    family_stats: pd.DataFrame,
) -> str:
    confidence_counts = Counter(labeled_df["bucket_confidence"].tolist())
    lines: list[str] = []
    lines.append("# Crypto Universe Scaleout Report")
    lines.append("")
    lines.append("This report propagates the anchor-labeled crypto case-study work into the broader mature-quality universe.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Total analytics rows: {len(universe_df)}")
    lines.append(f"- Quality-floor universe rows: {len(quality_floor_df)}")
    lines.append(f"- Mature-quality universe rows: {len(labeled_df)}")
    lines.append(f"- Confidence high: {confidence_counts.get('high', 0)}")
    lines.append(f"- Confidence medium: {confidence_counts.get('medium', 0)}")
    lines.append(f"- Confidence low: {confidence_counts.get('low', 0)}")
    lines.append(f"- Median signal categories per coin: {round(float(labeled_df['signal_category_count'].median()), 2)}")
    lines.append("")
    lines.append("## Why This Matters")
    lines.append("")
    lines.append("- The expensive, browse-heavy context work stays concentrated in the anchor set.")
    lines.append("- The broader universe inherits structured bucket and factor labels with evidence and confidence.")
    lines.append("- Signal categories are separated from noisy metadata tags like ecosystem, portfolio, and index labels.")
    lines.append("- This is the scalable bridge between handcrafted research context and a large empirical panel.")
    lines.append("")
    lines.append("## Predicted Bucket Distribution")
    lines.append("")
    for _, row in bucket_stats.head(15).iterrows():
        lines.append(
            "- "
            f"{row['predicted_bucket']}: count={int(row['coin_count'])}, "
            f"high_confidence={int(row['high_confidence_count'])}, "
            f"median_sharpe={row['median_sharpe_ratio_90d']}, "
            f"median_return_90d={row['median_return_90d_pct']}"
        )
    lines.append("")
    lines.append("## Largest Positive Median Sharpe Factors")
    lines.append("")
    top_factors = factor_stats[factor_stats["positive_count"] >= 25].sort_values("median_sharpe_positive", ascending=False).head(12)
    for _, row in top_factors.iterrows():
        lines.append(
            "- "
            f"{row['factor_name']}: positives={int(row['positive_count'])}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}"
        )
    lines.append("")
    lines.append("## Largest Signal Families")
    lines.append("")
    top_families = family_stats.sort_values(["positive_count", "family_name"], ascending=[False, True]).head(12)
    for _, row in top_families.iterrows():
        lines.append(
            "- "
            f"{row['family_name']}: positives={int(row['positive_count'])}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}"
        )
    lines.append("")
    lines.append("## Example High-Confidence Predictions")
    lines.append("")
    examples = labeled_df[labeled_df["bucket_confidence"] == "high"].head(25)
    for _, row in examples.iterrows():
        lines.append(
            "- "
            f"{row['coingecko_id']} -> {row['predicted_bucket']} "
            f"(anchor_support={int(row['anchor_support'])}, peers={row['anchor_peers']})"
        )
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Scale the anchor-labeled crypto taxonomy into the mature-quality universe.")
    ap.add_argument("--analytics-csv", type=Path, default=DEFAULT_ANALYTICS)
    ap.add_argument("--profiles-csv", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--features-csv", type=Path, default=DEFAULT_FEATURES)
    ap.add_argument("--binary-csv", type=Path, default=DEFAULT_BINARY)
    ap.add_argument("--universe-selection-csv", type=Path, default=DEFAULT_UNIVERSE_SELECTION)
    ap.add_argument("--taxonomy-csv", type=Path, default=DEFAULT_TAXONOMY)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    universe_df = _prepare_universe(
        args.analytics_csv.resolve(),
        args.profiles_csv.resolve(),
        args.universe_selection_csv.resolve(),
    )
    anchor_df, factor_cols = _prepare_anchor(
        args.features_csv.resolve(),
        args.binary_csv.resolve(),
        args.profiles_csv.resolve(),
    )
    taxonomy = _load_taxonomy(args.taxonomy_csv.resolve())
    family_cols = _signal_family_values(taxonomy)
    universe_df["signal_categories_list"] = universe_df["categories_list"].map(lambda cats: _signal_categories(cats, taxonomy))
    universe_df["signal_families_list"] = universe_df["categories_list"].map(
        lambda cats: _signal_families(cats, taxonomy)
    )
    universe_df["bucket_families_list"] = universe_df["categories_list"].map(
        lambda cats: _signal_families(cats, taxonomy, bucketing_only=True)
    )
    universe_df["factor_families_list"] = universe_df["categories_list"].map(
        lambda cats: _signal_families(cats, taxonomy, factoring_only=True)
    )
    anchor_df["signal_categories_list"] = anchor_df["categories_list"].map(lambda cats: _signal_categories(cats, taxonomy))
    priors, bucket_values = _build_category_priors(anchor_df, factor_cols)

    anchor_ref = [
        {
            "coingecko_id": row["coingecko_id"],
            "benchmark_bucket": row["benchmark_bucket"],
            "categories_set": set(cat.lower() for cat in row["signal_categories_list"]),
        }
        for _, row in anchor_df.iterrows()
    ]

    quality_floor = universe_df[universe_df["quality_floor"] == 1].copy()
    mature_quality = universe_df[universe_df["mature_quality"] == 1].copy()
    quality_labels_df, quality_bucket_stats, quality_factor_stats, quality_family_stats = _label_subset(
        quality_floor,
        priors,
        bucket_values,
        factor_cols,
        family_cols,
        anchor_ref,
    )
    labeled_df, bucket_stats, factor_stats, family_stats = _label_subset(
        mature_quality,
        priors,
        bucket_values,
        factor_cols,
        family_cols,
        anchor_ref,
    )

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    priors_path = output_dir / "anchor_category_priors.csv"
    labels_path = output_dir / "mature_quality_universe_labels.csv"
    bucket_stats_path = output_dir / "mature_quality_universe_bucket_stats.csv"
    factor_stats_path = output_dir / "mature_quality_universe_factor_stats.csv"
    family_stats_path = output_dir / "mature_quality_universe_family_stats.csv"
    quality_labels_path = output_dir / "quality_floor_universe_labels.csv"
    quality_bucket_stats_path = output_dir / "quality_floor_universe_bucket_stats.csv"
    quality_factor_stats_path = output_dir / "quality_floor_universe_factor_stats.csv"
    quality_family_stats_path = output_dir / "quality_floor_universe_family_stats.csv"

    _write_category_priors(priors_path, priors, factor_cols, bucket_values)
    quality_labels_df.to_csv(quality_labels_path, index=False)
    quality_bucket_stats.to_csv(quality_bucket_stats_path, index=False)
    quality_factor_stats.to_csv(quality_factor_stats_path, index=False)
    quality_family_stats.to_csv(quality_family_stats_path, index=False)
    labeled_df.to_csv(labels_path, index=False)
    bucket_stats.to_csv(bucket_stats_path, index=False)
    factor_stats.to_csv(factor_stats_path, index=False)
    family_stats.to_csv(family_stats_path, index=False)
    args.report_path.resolve().write_text(
        _build_report(universe_df, quality_floor, labeled_df, bucket_stats, factor_stats, family_stats),
        encoding="utf-8",
    )

    print(f"[ok] wrote {priors_path}")
    print(f"[ok] wrote {quality_labels_path}")
    print(f"[ok] wrote {quality_bucket_stats_path}")
    print(f"[ok] wrote {quality_factor_stats_path}")
    print(f"[ok] wrote {quality_family_stats_path}")
    print(f"[ok] wrote {labels_path}")
    print(f"[ok] wrote {bucket_stats_path}")
    print(f"[ok] wrote {factor_stats_path}")
    print(f"[ok] wrote {family_stats_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
