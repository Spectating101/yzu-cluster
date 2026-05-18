#!/usr/bin/env python3
"""
SEC to Intelligence Bridge (Real Historical Ingest)

Purpose:
  Parses raw SEC submissions JSONs (downloaded from EDGAR) to generate 
  a legitimate, timestamped 'intelligence_history.csv' for backtesting.

Logic:
  - Scans 8-K, 10-K, 10-Q filings.
  - Checks for "Toxic" Item Codes (e.g., 4.02 Non-Reliance, 1.03 Bankruptcy).
  - (Optional) Keyword scan in descriptions (if available in this metadata format).
  - Generates a 'Risk_Off' signal for the specific ticker for N days after a toxic filing.

Output:
  Date,Risk_Score,Banned_Tickers
"""

import json
import argparse
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

# Risk Definitions
# 4.02: Non-Reliance on Prev. Financials (Accounting Scandal)
# 1.03: Bankruptcy or Receivership
# 2.06: Material Impairments (Big write-offs)
# 3.01: Delisting Notice
TOXIC_ITEMS = ["4.02", "1.03", "3.01"] 
WARNING_ITEMS = ["2.06", "8.01"] # 8.01 is 'Other', often bad news if combined with price drop, but noisy.

def load_submissions(cik_path):
    try:
        data = json.loads(cik_path.read_text())
        return data
    except Exception as e:
        print(f"Error reading {cik_path}: {e}")
        return None

def process_filings(submissions):
    """
    Extracts events from the 'filings' -> 'recent' block.
    Returns list of dicts: {date, ticker, risk_level, items}
    """
    events = []
    
    # The structure is usually filings -> recent -> {accessionNumber: [], filingDate: [], items: [], ...}
    # It's a columnar format (list of lists).
    
    recent = submissions.get("filings", {}).get("recent", {})
    if not recent:
        return []
        
    dates = recent.get("filingDate", [])
    forms = recent.get("form", [])
    items_list = recent.get("items", []) # This might be empty or formatted differently depending on entity
    
    # Safety check alignment
    count = len(dates)
    
    # Extract Ticker
    ticker = "UNKNOWN"
    if "tickers" in submissions and submissions["tickers"]:
        ticker = submissions["tickers"][0]
    elif "tradingSymbol" in submissions:
        ticker = submissions["tradingSymbol"]
    
    for i in range(count):
        dt = dates[i]
        form = forms[i]
        
        # Items logic
        # 'items' is often a comma-separated string like "2.02,9.01"
        # Sometimes it's empty for 10-K/10-Q
        items_str = ""
        if i < len(items_list):
            items_str = str(items_list[i])
            
        current_items = [x.strip() for x in items_str.split(",")]
        
        risk = 0.0
        reason = ""
        
        # Check for Toxic Items (8-K)
        if form == "8-K":
            for code in TOXIC_ITEMS:
                if code in current_items:
                    risk = 1.0 # Ban immediately
                    reason = f"Toxic 8-K Item {code}"
                    break
            # Remove 8.01 (Other) from warnings as it is too noisy for automated banning
            if risk < 1.0:
                for code in ["2.06", "1.02", "1.03", "4.01"]: # Impairment, Termination, Bankruptcy, Accountant Change
                    if code in current_items:
                        risk = 0.5
                        reason = f"Warning 8-K Item {code}"
        
        # 10-K/10-Q are standard, but Late Filing (NT 10-K) is bad
        if form.startswith("NT"): # Notification of Late Filing
            risk = 0.8
            reason = f"Late Filing {form}"
            
        if risk > 0:
            events.append({
                "Date": dt,
                "Ticker": ticker,
                "Risk": risk,
                "Reason": reason
            })
            
    return events

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sec-dir", type=Path, default=Path("Sharpe-Renaissance/data_lake/sec/submissions"))
    ap.add_argument("--out", type=Path, default=Path("Sharpe-Renaissance/data_lake/intelligence_history_sec.csv"))
    ap.add_argument("--ban-duration-days", type=int, default=30)
    args = ap.parse_args()
    
    all_events = []
    
    # 1. Scan Files
    for p in args.sec_dir.glob("*.json"):
        subs = load_submissions(p)
        if subs:
            evs = process_filings(subs)
            all_events.extend(evs)
            
    print(f"Found {len(all_events)} risk events from SEC filings.")
    
    if not all_events:
        print("No events found. Check fetcher.")
        return
        
    # 2. Convert to Time Series (Daily)
    # We need a continuous daily index to manage the "Ban Duration" state.
    
    df = pd.DataFrame(all_events)
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date")
    
    # Create Date Range (Start to Today)
    start_date = df["Date"].min()
    end_date = datetime.now()
    date_range = pd.date_range(start_date, end_date)
    
    # Reconstruct History
    history = []
    
    # State tracking: {Ticker: Ban_End_Date}
    active_bans = {}
    
    for d in date_range:
        # 1. Process new events today
        todays_events = df[df["Date"] == d]
        
        for _, row in todays_events.iterrows():
            if row["Risk"] >= 0.8:
                # Ban
                ban_end = d + timedelta(days=args.ban_duration_days)
                # Extend if already banned
                if row["Ticker"] in active_bans:
                    ban_end = max(ban_end, active_bans[row["Ticker"]])
                active_bans[row["Ticker"]] = ban_end
                
        # 2. Determine Current State
        # Clean expired bans
        expired = [t for t, end in active_bans.items() if end < d]
        for t in expired:
            del active_bans[t]
            
        banned_list = list(active_bans.keys())
        
        # Global Risk Score? 
        # If many companies are filing toxic forms, market risk is high.
        # Simple heuristic: Risk = min(1.0, len(banned_list) * 0.1)
        global_risk = min(1.0, len(banned_list) * 0.05)
        
        history.append({
            "Date": d.date(),
            "Risk_Score": global_risk,
            "Banned_Tickers": ";".join(banned_list)
        })
        
    # 3. Write
    out_df = pd.DataFrame(history)
    out_df.to_csv(args.out, index=False)
    print(f"✅ Generated valid SEC intelligence history: {len(out_df)} rows.")
    print(f"   Example Bans: {out_df[out_df['Banned_Tickers'] != ''].tail(3)}")

if __name__ == "__main__":
    main()
