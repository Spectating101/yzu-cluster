#!/usr/bin/env python3
"""
Generate simple stress scenarios by shocking volatility/skew factors.
Outputs stressed factors to data_lake/analytics_pack/stress/.
"""
from pathlib import Path
import sys
import argparse
import pandas as pd


def stress_factors(df: pd.DataFrame, skew_mult: float, vol_mult: float) -> pd.DataFrame:
    stressed = df.copy()
    if "skew_put_minus_call" in stressed:
        stressed["skew_put_minus_call"] = stressed["skew_put_minus_call"] * skew_mult
    if "term_structure_inversion" in stressed:
        stressed["term_structure_inversion"] = stressed["term_structure_inversion"] * vol_mult
    return stressed


def main():
    parser = argparse.ArgumentParser(description="Generate stress scenarios for factors.")
    parser.add_argument("--skew-mult", type=float, default=2.0, help="Multiplier for skew")
    parser.add_argument("--vol-mult", type=float, default=1.5, help="Multiplier for term structure")
    args = parser.parse_args()

    base = Path("data_lake/analytics_pack")
    if not base.exists():
        print("No analytics pack directory found. Run analytics_pack.py first.")
        return 1

    out_dir = base / "stress"
    out_dir.mkdir(parents=True, exist_ok=True)

    for pq in base.glob("factors_*.parquet"):
        ticker = pq.stem.replace("factors_", "").replace("_", ".")
        df = pd.read_parquet(pq)
        stressed = stress_factors(df, skew_mult=args.skew_mult, vol_mult=args.vol_mult)
        out_base = out_dir / f"stress_{ticker.replace('.', '_')}"
        stressed.to_parquet(out_base.with_suffix(".parquet"))
        stressed.to_csv(out_base.with_suffix(".csv"))
        print(f"✅ Stress factors saved for {ticker}: {stressed.shape}, -> {out_base}.[parquet|csv]")

    return 0


if __name__ == "__main__":
    sys.exit(main())
