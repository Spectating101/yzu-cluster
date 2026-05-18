#!/usr/bin/env python3
"""
Crypto Predictive Factor Panel

Builds a significance-first binary factor panel from the broader labeled crypto
universe. The goal is to keep ex ante, economically meaningful factors that are
plausibly useful for cross-sectional prediction and risk analysis.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any

import pandas as pd


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]

DEFAULT_MATURE_LABELS = _REPO / "data_lake" / "crypto_pipeline" / "context" / "mature_quality_universe_labels.csv"
DEFAULT_QUALITY_LABELS = _REPO / "data_lake" / "crypto_pipeline" / "context" / "quality_floor_universe_labels.csv"
DEFAULT_OUTPUT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_REPORT_PATH = _REPO / "reports" / "crypto_predictive_factor_panel_report.md"

PREDICTIVE_FACTOR_CATALOG = [
    {
        "factor_name": "is_store_of_value",
        "priority": "important",
        "group_name": "demand_and_utility",
        "source_basis": "existing_binary",
        "why_it_matters": "Reservation-demand asset with defensive and macro-hedge behavior.",
        "implementation_note": "Sparse but economically distinct; keep as a high-signal niche factor.",
    },
    {
        "factor_name": "is_smart_contract_l1",
        "priority": "core",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Base-layer platform beta and network-level systemic exposure.",
        "implementation_note": "Use native base-layer tokens only.",
    },
    {
        "factor_name": "is_stablecoin",
        "priority": "core",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Reference low-beta asset class and flight-to-safety regime proxy.",
        "implementation_note": "Includes fiat-backed, crypto-backed, and algorithmic variants.",
    },
    {
        "factor_name": "is_defi",
        "priority": "core",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Direct exposure to on-chain leverage, liquidity cycles, and protocol risk.",
        "implementation_note": "Covers lending, DEX, AMM, and related protocol tokens.",
    },
    {
        "factor_name": "is_rwa",
        "priority": "important",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Links crypto valuation to off-chain macro and credit conditions.",
        "implementation_note": "Includes tokenized treasuries, commodities, funds, and related structures.",
    },
    {
        "factor_name": "is_ai_depin",
        "priority": "important",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Captures compute, infrastructure, and AI narrative exposure.",
        "implementation_note": "Keep separate from general infrastructure because demand driver is distinct.",
    },
    {
        "factor_name": "is_privacy",
        "priority": "important",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "High regulatory-delisting risk and niche demand dynamics.",
        "implementation_note": "Focus on protocol-level privacy or obfuscation features.",
    },
    {
        "factor_name": "is_meme_speculative",
        "priority": "core",
        "group_name": "theme_and_archetype",
        "source_basis": "existing_binary",
        "why_it_matters": "Retail sentiment and lottery-ticket behavior proxy.",
        "implementation_note": "Prefer this over generic retail tags because it is more precise.",
    },
    {
        "factor_name": "is_interoperability",
        "priority": "important",
        "group_name": "demand_and_utility",
        "source_basis": "existing_binary",
        "why_it_matters": "Captures bridges, messaging, and connective-infrastructure exposure.",
        "implementation_note": "Use as the crypto analog of critical network middleware.",
    },
    {
        "factor_name": "is_exchange_token",
        "priority": "important",
        "group_name": "issuer_and_backing",
        "source_basis": "existing_binary",
        "why_it_matters": "Centralized platform operating leverage and trading-volume dependence.",
        "implementation_note": "Keep distinct from DeFi because entity risk matters.",
    },
    {
        "factor_name": "has_centralized_issuer",
        "priority": "core",
        "group_name": "issuer_and_backing",
        "source_basis": "existing_binary",
        "why_it_matters": "Counterparty, governance, and operational risk from legal-entity control.",
        "implementation_note": "Use for stablecoins, exchange tokens, and issuer-managed structures.",
    },
    {
        "factor_name": "is_fiat_or_treasury_backed",
        "priority": "important",
        "group_name": "issuer_and_backing",
        "source_basis": "existing_binary",
        "why_it_matters": "Safe-asset proxy tied to rates, reserve quality, and dollar funding.",
        "implementation_note": "Useful especially inside stablecoins and tokenized-cash-like assets.",
    },
    {
        "factor_name": "requires_permissioned_access",
        "priority": "important",
        "group_name": "regime_and_access",
        "source_basis": "existing_binary",
        "why_it_matters": "Constrained addressability and different liquidity/risk premia.",
        "implementation_note": "Most relevant for institutional RWAs and gated systems.",
    },
    {
        "factor_name": "has_staking_yield",
        "priority": "core",
        "group_name": "supply_and_structure",
        "source_basis": "existing_binary",
        "why_it_matters": "Income/carry component that can change hold incentives and valuation framing.",
        "implementation_note": "Distinguish inflationary reward mechanics from real fee capture where possible.",
    },
    {
        "factor_name": "has_fee_burn_or_deflation",
        "priority": "important",
        "group_name": "supply_and_structure",
        "source_basis": "existing_binary",
        "why_it_matters": "Structural supply sink during high activity regimes.",
        "implementation_note": "Examples include burn-linked fee systems.",
    },
    {
        "factor_name": "exposed_to_token_unlocks_or_emissions",
        "priority": "core",
        "group_name": "supply_and_structure",
        "source_basis": "existing_binary",
        "why_it_matters": "Forward dilution and sell-pressure risk.",
        "implementation_note": "One of the cleanest ex ante supply overhang factors.",
    },
    {
        "factor_name": "used_as_collateral",
        "priority": "important",
        "group_name": "demand_and_utility",
        "source_basis": "existing_binary",
        "why_it_matters": "Systemic role inside lending stacks and liquidation cascades.",
        "implementation_note": "Use whitelisted collateral status or equivalent structured evidence.",
    },
    {
        "factor_name": "used_for_settlement",
        "priority": "important",
        "group_name": "demand_and_utility",
        "source_basis": "existing_binary",
        "why_it_matters": "Transactional demand and money-like utility.",
        "implementation_note": "Keep separate from store-of-value because velocity and use case differ.",
    },
    {
        "factor_name": "has_exchange_fee_utility",
        "priority": "important",
        "group_name": "demand_and_utility",
        "source_basis": "existing_binary",
        "why_it_matters": "Direct link between token demand and trading activity.",
        "implementation_note": "Strongly relevant for exchange-affiliated tokens.",
    },
    {
        "factor_name": "is_institutionally_oriented",
        "priority": "important",
        "group_name": "regime_and_access",
        "source_basis": "existing_binary",
        "why_it_matters": "Captures correlation to regulated capital flows and professional market structure.",
        "implementation_note": "Good proxy for ETF, custody, and treasury-style adoption channels.",
    },
    {
        "factor_name": "has_high_regulatory_sensitivity",
        "priority": "core",
        "group_name": "regime_and_access",
        "source_basis": "existing_binary",
        "why_it_matters": "Tail-risk factor for enforcement, delisting, and access shocks.",
        "implementation_note": "Prefer explicit litigation or classification risk signals.",
    },
]

KEY_COLUMNS = [
    "coingecko_id",
    "symbol",
    "name",
    "rank_idx",
    "days_of_history",
    "predicted_bucket",
    "bucket_confidence",
    "signal_category_count",
    "signal_categories_preview",
    "signal_families_preview",
    "price_usd",
    "return_90d_pct",
    "sharpe_ratio_90d",
    "volatility_90d_ann_pct",
    "drawdown_from_ath_pct",
    "cagr_pct",
]


def _factor_stats(df: pd.DataFrame, factor_names: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for factor in factor_names:
        pos = df[df[factor] == 1]
        neg = df[df[factor] == 0]
        if pos.empty:
            continue
        pos_sharpe = pos["sharpe_ratio_90d"].median()
        neg_sharpe = neg["sharpe_ratio_90d"].median() if not neg.empty else float("nan")
        rows.append(
            {
                "factor_name": factor,
                "positive_count": len(pos),
                "negative_count": len(neg),
                "median_sharpe_positive": round(pos_sharpe, 4),
                "median_sharpe_negative": round(neg_sharpe, 4) if pd.notna(neg_sharpe) else "",
                "median_sharpe_gap": round(pos_sharpe - neg_sharpe, 4) if pd.notna(neg_sharpe) else "",
                "median_return_positive": round(pos["return_90d_pct"].median(), 4),
                "median_return_negative": round(neg["return_90d_pct"].median(), 4) if not neg.empty else "",
                "sample_positive_coins": " | ".join(pos["coingecko_id"].head(8).tolist()),
            }
        )
    return pd.DataFrame(rows).sort_values(["positive_count", "factor_name"], ascending=[False, True])


def _build_panel(df: pd.DataFrame, catalog_df: pd.DataFrame) -> pd.DataFrame:
    factor_names = catalog_df["factor_name"].tolist()
    keep_cols = [col for col in KEY_COLUMNS if col in df.columns] + factor_names
    return df[keep_cols].copy()


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _build_report(
    mature_panel: pd.DataFrame,
    quality_panel: pd.DataFrame,
    mature_stats: pd.DataFrame,
    quality_stats: pd.DataFrame,
    catalog_df: pd.DataFrame,
) -> str:
    lines: list[str] = []
    lines.append("# Crypto Predictive Factor Panel Report")
    lines.append("")
    lines.append("This report narrows the broader crypto factor universe to a significance-first predictive panel.")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Curated predictive factors: {len(catalog_df)}")
    lines.append(f"- Mature-quality panel rows: {len(mature_panel)}")
    lines.append(f"- Quality-floor panel rows: {len(quality_panel)}")
    lines.append("")
    lines.append("## Factor Groups")
    lines.append("")
    for group_name, sub in catalog_df.groupby("group_name"):
        factors = ", ".join(sub["factor_name"].tolist())
        lines.append(f"- {group_name}: {factors}")
    lines.append("")
    lines.append("## Mature Panel Top Factors By Median Sharpe")
    lines.append("")
    top_mature = mature_stats[mature_stats["positive_count"] >= 25].sort_values("median_sharpe_positive", ascending=False).head(12)
    for _, row in top_mature.iterrows():
        lines.append(
            "- "
            f"{row['factor_name']}: positives={int(row['positive_count'])}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}"
        )
    lines.append("")
    lines.append("## Quality-Floor Panel Top Factors By Median Sharpe")
    lines.append("")
    top_quality = quality_stats[quality_stats["positive_count"] >= 25].sort_values("median_sharpe_positive", ascending=False).head(12)
    for _, row in top_quality.iterrows():
        lines.append(
            "- "
            f"{row['factor_name']}: positives={int(row['positive_count'])}, "
            f"median_sharpe_positive={row['median_sharpe_positive']}, "
            f"median_return_positive={row['median_return_positive']}"
        )
    lines.append("")
    lines.append("## Why This Panel Is Narrower")
    lines.append("")
    lines.append("- It keeps structure, demand, issuer/backing, and regime factors that can be known before returns happen.")
    lines.append("- It avoids vanity tags and weak descriptive metadata that are not plausible predictive drivers.")
    lines.append("- It is compact enough to transfer into stock research as a factor-engineering template.")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build a significance-first predictive factor panel for crypto.")
    ap.add_argument("--mature-labels-csv", type=Path, default=DEFAULT_MATURE_LABELS)
    ap.add_argument("--quality-labels-csv", type=Path, default=DEFAULT_QUALITY_LABELS)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    mature_df = pd.read_csv(args.mature_labels_csv.resolve())
    quality_df = pd.read_csv(args.quality_labels_csv.resolve())
    catalog_df = pd.DataFrame(PREDICTIVE_FACTOR_CATALOG)

    factor_names = catalog_df["factor_name"].tolist()
    missing = [factor for factor in factor_names if factor not in mature_df.columns or factor not in quality_df.columns]
    if missing:
        raise SystemExit(f"Missing predictive factor columns: {', '.join(missing)}")

    mature_panel = _build_panel(mature_df, catalog_df)
    quality_panel = _build_panel(quality_df, catalog_df)
    mature_stats = _factor_stats(mature_panel, factor_names)
    quality_stats = _factor_stats(quality_panel, factor_names)

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    catalog_path = output_dir / "predictive_factor_catalog.csv"
    mature_panel_path = output_dir / "mature_quality_predictive_factor_panel.csv"
    quality_panel_path = output_dir / "quality_floor_predictive_factor_panel.csv"
    mature_stats_path = output_dir / "mature_quality_predictive_factor_stats.csv"
    quality_stats_path = output_dir / "quality_floor_predictive_factor_stats.csv"

    catalog_df.to_csv(catalog_path, index=False)
    mature_panel.to_csv(mature_panel_path, index=False)
    quality_panel.to_csv(quality_panel_path, index=False)
    mature_stats.to_csv(mature_stats_path, index=False)
    quality_stats.to_csv(quality_stats_path, index=False)
    args.report_path.resolve().write_text(
        _build_report(mature_panel, quality_panel, mature_stats, quality_stats, catalog_df),
        encoding="utf-8",
    )

    print(f"[ok] wrote {catalog_path}")
    print(f"[ok] wrote {mature_panel_path}")
    print(f"[ok] wrote {quality_panel_path}")
    print(f"[ok] wrote {mature_stats_path}")
    print(f"[ok] wrote {quality_stats_path}")
    print(f"[ok] wrote {args.report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
