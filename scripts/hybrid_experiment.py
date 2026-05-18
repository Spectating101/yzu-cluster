#!/usr/bin/env python3
"""
The "Prime Method" Experiment: Hybrid Stack Simulation

Concept:
  Merges the Strategic Intelligence (Molina) with Tactical Safety (Academic RF).
  
  Logic:
  1. Base Strategy: Molina Dynamic (Risk-On/Off based on News/Science).
  2. Overlay: Academic "Crash Prob" (from the previous RF run).
  
  Hypothesis:
  The Academic model was too sensitive on its own, but as a *dampener* on the Molina strategy,
  it might smooth out volatility without killing returns.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path

def run_hybrid_experiment():
    print("🧪 Starting Hybrid Stack Experiment...")

    # 1. Load Molina Dynamic Results (The "Strategic" Layer)
    # This is the successful +40% CAGR run we just did.
    molina_path = Path("Sharpe-Renaissance/backtests/outputs/intel/dynamic_run_v1/equity.csv")
    if not molina_path.exists():
        print("❌ Molina run missing. Please re-run the dynamic runner first.")
        return

    # Load Equity and convert to Returns
    molina_eq = pd.read_csv(molina_path, parse_dates=["Date"], index_col="Date")
    # Clean up column name if needed
    col = molina_eq.columns[0] 
    molina_ret = molina_eq[col].pct_change().fillna(0.0)

    # 2. Load Academic Signal (The "Tactical" Layer)
    # This is the "Crash Prob" we generated.
    academic_path = Path("Sharpe-Renaissance/backtests/outputs/academic_rf_signal.csv")
    if not academic_path.exists():
        print("❌ Academic signal missing.")
        return

    academic = pd.read_csv(academic_path, parse_dates=["Date"], index_col="Date")
    crash_prob = academic["Crash_Prob"]

    # 3. Align Data (Inner Join)
    # Only trade days where we have both strategy and signal
    df = pd.DataFrame({"Molina_Ret": molina_ret, "Crash_Prob": crash_prob}).dropna()

    # 4. The Hybrid Logic
    # If Crash Probability is high, scale down the Molina exposure.
    # We use a soft scaling: Exposure = 1.0 - (Crash_Prob^2)
    # Squaring it means we ignore low probabilities (0.2^2 = 0.04 penalty) but react to high ones (0.8^2 = 0.64 penalty).
    
    df["Scale_Factor"] = 1.0 - (df["Crash_Prob"] ** 2)
    df["Hybrid_Ret"] = df["Molina_Ret"] * df["Scale_Factor"]

    # 5. Calculate Performance
    df["Molina_Eq"] = (1 + df["Molina_Ret"]).cumprod()
    df["Hybrid_Eq"] = (1 + df["Hybrid_Ret"]).cumprod()

    # Metrics
    def get_stats(series):
        total_ret = series.iloc[-1] - 1.0
        # CAGR (approx)
        days = (series.index[-1] - series.index[0]).days
        years = days / 365.25
        cagr = (series.iloc[-1]) ** (1/years) - 1.0
        
        # Drawdown
        peak = series.cummax()
        dd = (series / peak) - 1.0
        mdd = dd.min()
        
        # Vol
        vol = series.pct_change().std() * np.sqrt(252)
        
        return cagr, mdd, vol, series.iloc[-1]

    m_cagr, m_mdd, m_vol, m_end = get_stats(df["Molina_Eq"])
    h_cagr, h_mdd, h_vol, h_end = get_stats(df["Hybrid_Eq"])

    print("\n📊 Results:")
    print(f"{ 'Metric':<15} | { 'Molina Only':<15} | { 'Hybrid (Prime)':<15}")
    print("-" * 50)
    print(f"{ 'Final Equity':<15} | ${m_end:<14.2f} | ${h_end:<14.2f}")
    print(f"{ 'CAGR':<15} | {m_cagr:<14.1%} | {h_cagr:<14.1%}")
    print(f"{ 'Max Drawdown':<15} | {m_mdd:<14.1%} | {h_mdd:<14.1%}")
    print(f"{ 'Volatility':<15} | {m_vol:<14.1%} | {h_vol:<14.1%}")

    # Conclusion
    if h_cagr > m_cagr:
        print("\n✅ SUCCESS: The Hybrid method improved returns!")
    elif h_mdd > m_mdd: # Remember MDD is negative, so higher is better (closer to 0)
        print("\n🛡️ SAFETY: Returns dropped, but safety improved (Drawdown reduced).")
    else:
        print("\n❌ FAILURE: The Academic overlay just added noise/cost.")

    df.to_csv("Sharpe-Renaissance/backtests/outputs/hybrid_experiment_results.csv")

if __name__ == "__main__":
    run_hybrid_experiment()
