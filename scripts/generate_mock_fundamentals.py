#!/usr/bin/env python3
"""
Generate synthetic fundamental data (P/E, Debt/Equity) aligned with a price panel.
Used to test the 'Quality' factor logic in Sharpe-Renaissance when real historical data is missing.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import argparse

def generate_fundamentals(price_csv: Path, out_csv: Path):
    print(f"Loading prices from {price_csv}...")
    df = pd.read_csv(price_csv, parse_dates=["Date"])
    
    # Get unique tickers and dates (monthly)
    df["Date"] = pd.to_datetime(df["Date"])
    dates = np.sort(df["Date"].unique())
    # Resample to monthly to save space/time, fundamentals don't change daily
    dates_m = pd.date_range(start=dates[0], end=dates[-1], freq="ME")
    
    tickers = df["Instrument"].unique()
    
    records = []
    print(f"Generating synthetic fundamentals for {len(tickers)} tickers over {len(dates_m)} months...")
    
    rng = np.random.default_rng(42)
    
    for t in tickers:
        # Assign a random "Quality Tier" to the stock
        # Tier 1 (High Quality): Low Debt, Reasonable PE
        # Tier 3 (Junk): High Debt, Negative Earnings (High PE/NaN)
        tier = rng.integers(1, 4) 
        
        # Base values
        base_pe = 15.0 if tier == 1 else (25.0 if tier == 2 else -10.0)
        base_de = 0.5 if tier == 1 else (1.5 if tier == 2 else 5.0)
        
        # Random walk for the metrics
        pe = base_pe + rng.standard_normal(len(dates_m)).cumsum() * 2.0
        de = base_de + rng.standard_normal(len(dates_m)).cumsum() * 0.1
        
        # Ensure positivity where logical
        de = np.abs(de)
        
        for d, p, debt in zip(dates_m, pe, de):
            records.append({
                "Date": d,
                "Instrument": t,
                "PE_Ratio": p,
                "Debt_To_Equity": debt
            })
            
    out_df = pd.DataFrame(records)
    out_df.to_csv(out_csv, index=False)
    print(f"Saved synthetic fundamentals to {out_csv}")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    
    generate_fundamentals(args.panel, args.out)
