#!/usr/bin/env python3
"""
Academic Regime Learner (The "Prime Method" Candidate)

Concept:
  Combines 'Cite-Agent' theoretical constraints with Random Forest (RF) learning.
  
  Theory: "Markets crash when Liquidity Constraints (Minsky) meet Super-Exponential Growth (Sornette)."
  
  Features:
  1. Molina Risk Score (External Intelligence)
  2. Volatility Acceleration (Minsky Proxy)
  3. Log-Return Acceleration (Sornette/Bubble Proxy) 
  
  Model:
  - Random Forest Classifier (Walk-Forward Trained)
  - Target: Binary (Is next week's return < -5%?)
"""

import argparse
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_score, recall_score
from pathlib import Path

def calculate_sornette_proxy(prices, window=60):
    """
    Academic Proxy: Super-exponential growth is a signature of bubbles (Johansen-Ledoit-Sornette).
    We approximate this by checking if log-returns are accelerating.
    """
    log_px = np.log(prices)
    # Velocity
    vel = log_px.diff(window)
    # Acceleration (2nd derivative proxy)
    acc = vel.diff(window)
    return acc

def calculate_minsky_proxy(prices, window=20):
    """
    Academic Proxy: Minsky moments occur when stability breeds instability.
    Low volatility leads to leverage buildup, followed by a vol spike.
    Feature: Ratio of Short-Term Vol to Long-Term Vol.
    """
    rets = prices.pct_change()
    short_vol = rets.rolling(window).std()
    long_vol = rets.rolling(window * 3).std()
    return short_vol / long_vol

def load_data(panel_path, intel_path, benchmark="SPY"):
    # 1. Load Prices
    df = pd.read_csv(panel_path, parse_dates=["Date"])
    df = df[df["Instrument"] == benchmark].set_index("Date").sort_index()
    prices = df["Price_Close"]
    
    # 2. Load Intelligence (Molina Context)
    intel = pd.read_csv(intel_path, parse_dates=["Date"]).set_index("Date").sort_index()
    # Forward fill intelligence (it's sparse)
    intel = intel.asfreq('D', method='ffill')
    
    return prices, intel

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", type=Path, default="Sharpe-Renaissance/data_lake/yfinance_leveraged_crypto_10y.csv")
    ap.add_argument("--intel", type=Path, default="Sharpe-Renaissance/data_lake/intelligence_history_mock.csv")
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--train-years", type=int, default=3)
    args = ap.parse_args()
    
    print(f"🔬 Initializing Academic Regime Learner (Target: {args.benchmark})...")
    
    prices, intel = load_data(args.panel, args.intel, args.benchmark)
    
    # --- Feature Engineering (The "Academic" Part) ---
    df = pd.DataFrame({"price": prices})
    df["sornette_acc"] = calculate_sornette_proxy(df["price"])
    df["minsky_ratio"] = calculate_minsky_proxy(df["price"])
    
    # Join Intelligence
    df = df.join(intel["Risk_Score"], how="left").fillna(method="ffill").fillna(0.0)
    
    # Target: Crash Next Week? (Loss > 2%)
    df["ret_1w"] = df["price"].pct_change(5).shift(-5)
    df["is_crash"] = (df["ret_1w"] < -0.02).astype(int)
    
    df = df.dropna()
    
    # --- Walk-Forward RF (The "Prime Method") ---
    # We retrain every year.
    
    features = ["sornette_acc", "minsky_ratio", "Risk_Score"]
    X = df[features]
    y = df["is_crash"]
    
    preds = []
    dates = []
    
    start_idx = 252 * args.train_years
    
    print(f"🧠 Training Random Forest on {len(features)} academic factors...")
    
    for t in range(start_idx, len(df), 21): # Monthly steps
        # Train Window
        train_X = X.iloc[:t]
        train_y = y.iloc[:t]
        
        # Test Window (Next Month)
        test_X = X.iloc[t:t+21]
        
        if test_X.empty:
            break
            
        # The Model: Random Forest (Robust to noise, non-linear)
        clf = RandomForestClassifier(n_estimators=100, max_depth=3, random_state=42)
        clf.fit(train_X, train_y)
        
        # Predict Probabilities
        p = clf.predict_proba(test_X)[:, 1] # Prob of Crash
        preds.extend(p)
        dates.extend(test_X.index)
        
    # --- Evaluation ---
    res = pd.DataFrame({"Date": dates, "Crash_Prob": preds})
    res = res.set_index("Date")
    
    # Join with actual returns for backtest
    res = res.join(df["ret_1w"])
    
    # Strategy: If Crash Prob > 0.4, go to Cash. Else SPY.
    res["Strategy_Ret"] = np.where(res["Crash_Prob"] > 0.4, 0.0, res["ret_1w"])
    
    cumm_spy = (1 + res["ret_1w"]).cumprod()
    cumm_strat = (1 + res["Strategy_Ret"]).cumprod()
    
    print("\n🏆 Academic RF Results (Out-of-Sample):")
    print(f"Benchmark Final Equity: ${cumm_spy.iloc[-1]:.2f}")
    print(f"Strategy Final Equity:  ${cumm_strat.iloc[-1]:.2f}")
    print(f"Precision (Did we catch crashes?): {precision_score(y.loc[res.index], (res['Crash_Prob']>0.4)):.2f}")
    
    # Save Signal
    res.to_csv("Sharpe-Renaissance/backtests/outputs/academic_rf_signal.csv")
    print(f"💾 Signal saved to Sharpe-Renaissance/backtests/outputs/academic_rf_signal.csv")

if __name__ == "__main__":
    main()
