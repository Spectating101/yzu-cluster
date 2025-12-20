#!/usr/bin/env python3
"""
Compute a heuristic distress score per ticker using price continuity and skew/short-interest features.
Outputs to data_lake/analytics_pack/summary/distress_scores.[csv|json]
"""
from pathlib import Path
import sys
import pandas as pd
import numpy as np


def distress_heuristic(df: pd.DataFrame) -> float:
    """
    Simple distress heuristic:
    - Penalize gaps (non-NA fraction < threshold)
    - Penalize deep drawdown
    - Penalize high short interest
    - Penalize negative skew
    Score is bounded [0,1], higher = more distressed.
    """
    score = 0.0
    # Coverage
    coverage = df.notna().mean().mean()
    score += (0.7 - coverage) * 1.5 if coverage < 0.7 else 0

    if "drawdown" in df.columns:
        dd = df["drawdown"].min()
        score += min(abs(dd), 1.0) * 0.5

    if "short_interest" in df.columns:
        si = df["short_interest"].dropna()
        if not si.empty:
            score += np.clip(si.tail(30).mean() / 100.0, 0, 1) * 0.5

    if "skew_put_minus_call" in df.columns:
        skew = df["skew_put_minus_call"].dropna()
        if not skew.empty:
            neg_skew = skew[skew < 0].mean() if not skew[skew < 0].empty else 0
            score += min(abs(neg_skew), 1.0) * 0.5

    return float(np.clip(score, 0.0, 1.0))


def main():
    base = Path("data_lake/analytics_pack")
    if not base.exists():
        print("No analytics pack directory found. Run analytics_pack.py first.")
        return 1

    out_dir = base / "summary"
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for pq in base.glob("factors_*.parquet"):
        ticker = pq.stem.replace("factors_", "").replace("_", ".")
        df = pd.read_parquet(pq)
        score = distress_heuristic(df)
        rows.append({"ticker": ticker, "distress_score": round(score, 3)})

    if not rows:
        print("No distress scores computed.")
        return 1

    out_path_csv = out_dir / "distress_scores.csv"
    out_path_json = out_dir / "distress_scores.json"
    pd.DataFrame(rows).to_csv(out_path_csv, index=False)
    pd.DataFrame(rows).to_json(out_path_json, orient="records", indent=2)
    print(f"✅ Distress scores written to {out_path_csv} and {out_path_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
