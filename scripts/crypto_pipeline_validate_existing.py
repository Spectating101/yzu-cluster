#!/usr/bin/env python3
"""
Quick validation check for existing crypto pipeline data.
Verifies schema compliance and reports data quality metrics.
"""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
DEFAULT_MASTER_CSV = _REPO / "data_lake" / "crypto_pipeline" / "context" / "current_regime_browsed_master_summary.csv"

EXPECTED_FIELDS = {
    "coingecko_id",
    "symbol",
    "name",
    "rank_idx",
    "predicted_bucket",
    "current_primary_driver",
    "current_primary_risk",
    "confidence",
    "source_urls",
}

BOOLEAN_FIELDS = {
    "has_current_institutional_flow_tailwind",
    "has_current_regulatory_tailwind",
    "has_current_regulatory_overhang",
    "has_current_product_or_upgrade_tailwind",
    "has_current_usage_or_adoption_tailwind",
    "has_current_fee_or_revenue_momentum",
    "has_current_liquidity_or_stablecoin_support",
    "has_current_distribution_or_partnership_tailwind",
    "has_current_supply_overhang",
    "has_current_security_or_trust_overhang",
    "has_current_narrative_momentum",
}


def validate_master_csv(csv_path: Path) -> None:
    if not csv_path.exists():
        print(f"❌ Master CSV not found: {csv_path}")
        return

    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)

    if not rows:
        print("❌ No rows found in master CSV")
        return

    print(f"✅ Found {len(rows)} rows in master summary")

    # Check schema
    fieldnames = set(reader.fieldnames or [])
    missing = EXPECTED_FIELDS - fieldnames
    if missing:
        print(f"⚠️  Missing expected fields: {', '.join(sorted(missing))}")

    has_timestamp = "last_updated_utc" in fieldnames
    has_warnings = "validation_warnings" in fieldnames

    print(f"{'✅' if has_timestamp else '⚠️ '} Timestamp field present: {has_timestamp}")
    print(f"{'✅' if has_warnings else '⚠️ '} Validation warnings field present: {has_warnings}")

    # Data quality checks
    empty_drivers = sum(1 for row in rows if not row.get("current_primary_driver", "").strip())
    empty_risks = sum(1 for row in rows if not row.get("current_primary_risk", "").strip())
    high_confidence = sum(1 for row in rows if row.get("confidence") == "high")
    medium_confidence = sum(1 for row in rows if row.get("confidence") == "medium")
    low_confidence = sum(1 for row in rows if row.get("confidence") == "low")

    print(f"\n📊 Data Quality Metrics:")
    print(f"   Empty drivers: {empty_drivers}/{len(rows)} ({100*empty_drivers/len(rows):.1f}%)")
    print(f"   Empty risks: {empty_risks}/{len(rows)} ({100*empty_risks/len(rows):.1f}%)")
    print(f"   Confidence distribution:")
    print(f"     - High: {high_confidence} ({100*high_confidence/len(rows):.1f}%)")
    print(f"     - Medium: {medium_confidence} ({100*medium_confidence/len(rows):.1f}%)")
    print(f"     - Low: {low_confidence} ({100*low_confidence/len(rows):.1f}%)")

    # Check timestamps if present
    if has_timestamp:
        with_timestamp = sum(1 for row in rows if row.get("last_updated_utc", "").strip())
        print(f"   Rows with timestamp: {with_timestamp}/{len(rows)}")

        if with_timestamp > 0:
            now = datetime.now(timezone.utc)
            stale_count = 0
            for row in rows:
                ts_str = row.get("last_updated_utc", "").strip()
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        age_days = (now - ts).total_seconds() / 86400
                        if age_days > 7:
                            stale_count += 1
                    except ValueError:
                        pass
            print(f"   Stale (>7 days): {stale_count}/{with_timestamp}")

    # Check validation warnings if present
    if has_warnings:
        with_warnings = sum(1 for row in rows if row.get("validation_warnings", "").strip())
        print(f"   Rows with validation warnings: {with_warnings}/{len(rows)}")
        if with_warnings > 0:
            print(f"   Sample warnings:")
            for row in rows[:10]:
                warnings = row.get("validation_warnings", "").strip()
                if warnings:
                    coin_id = row.get("coingecko_id", "unknown")
                    print(f"     - {coin_id}: {warnings}")

    print("\n✅ Validation complete")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Validate existing crypto pipeline master CSV")
    ap.add_argument("--csv", type=Path, default=DEFAULT_MASTER_CSV, help="Path to master CSV")
    args = ap.parse_args()

    validate_master_csv(args.csv)
