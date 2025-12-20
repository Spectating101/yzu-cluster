#!/usr/bin/env python3
"""
Summarize factor outputs into a single CSV/JSON snapshot for quick consumption.
Looks for files in data_lake/analytics_pack/factors_*.parquet.
"""
from pathlib import Path
import sys
import pandas as pd


def main():
    base = Path("data_lake/analytics_pack")
    if not base.exists():
        print("No analytics pack directory found. Run analytics_pack.py first.")
        return 1

    rows = []
    for pq in base.glob("factors_*.parquet"):
        ticker = pq.stem.replace("factors_", "").replace("_", ".")
        df = pd.read_parquet(pq)
        # pick the last row that has at least one non-NA factor
        latest = df[df.notna().any(axis=1)]
        if latest.empty:
            continue
        last = latest.tail(1)
        row = {"ticker": ticker}
        row.update(last.iloc[0].to_dict())
        rows.append(row)

    if not rows:
        print("No factor rows found to summarize.")
        return 1

    out_dir = base / "summary"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary_df = pd.DataFrame(rows)
    summary_df.to_csv(out_dir / "factors_latest.csv", index=False)
    summary_df.to_json(out_dir / "factors_latest.json", orient="records", indent=2)
    print(f"✅ Summary written to {out_dir}/factors_latest.[csv|json]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
