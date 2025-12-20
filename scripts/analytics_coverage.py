#!/usr/bin/env python3
"""
Compute coverage and simple movers from factor outputs.
Outputs summary CSV/JSON in data_lake/analytics_pack/summary/.
"""
from pathlib import Path
import sys
import pandas as pd


def main():
    base = Path("data_lake/analytics_pack")
    if not base.exists():
        print("No analytics pack directory found. Run analytics_pack.py first.")
        return 1

    out_dir = base / "summary"
    out_dir.mkdir(parents=True, exist_ok=True)

    coverage_rows = []
    movers_rows = []

    for pq in base.glob("factors_*.parquet"):
        ticker = pq.stem.replace("factors_", "").replace("_", ".")
        df = pd.read_parquet(pq)
        non_na = df.notna().sum()
        total = len(df)
        coverage = (non_na / total).round(3)
        coverage_rows.append({"ticker": ticker, **coverage.to_dict()})

        # 30-day movers for numeric columns
        numeric_cols = df.select_dtypes(include=["number"]).columns
        if not numeric_cols.any():
            continue
        window = df[numeric_cols].tail(30)
        latest = window.tail(1)
        if latest.empty:
            continue
        # simple std/mean z-score over last 30 for latest point
        zscores = (latest - window.mean()) / window.std(ddof=0)
        row = {"ticker": ticker}
        row.update(zscores.iloc[0].round(3).to_dict())
        movers_rows.append(row)

    if coverage_rows:
        cov_df = pd.DataFrame(coverage_rows)
        cov_df.to_csv(out_dir / "coverage.csv", index=False)
        cov_df.to_json(out_dir / "coverage.json", orient="records", indent=2)
        print(f"✅ Coverage written: {out_dir}/coverage.[csv|json]")
    else:
        print("⚠️ No coverage computed.")

    if movers_rows:
        mov_df = pd.DataFrame(movers_rows)
        mov_df.to_csv(out_dir / "movers_zscores.csv", index=False)
        mov_df.to_json(out_dir / "movers_zscores.json", orient="records", indent=2)
        print(f"✅ Movers written: {out_dir}/movers_zscores.[csv|json]")
    else:
        print("⚠️ No movers computed.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
