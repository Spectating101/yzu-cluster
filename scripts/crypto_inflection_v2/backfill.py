"""Backfill historical snapshots using existing price data

Since we have 6+ years of price data (10.9M records), we can generate
historical snapshots to immediately enable:
- Forward return validation
- ML model training
- Signal effectiveness analysis
- Backtesting

This generates "as-of" snapshots for past dates using historical data.
"""

import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
import sys

sys.path.append(str(Path(__file__).parent))
from tracker import InflectionTracker
from storage import SQLiteStorage


class HistoricalBackfill:
    """Generate historical snapshots from existing price data"""
    
    def __init__(self):
        self.tracker = InflectionTracker()
        self.storage = SQLiteStorage()
    
    def backfill(self, days_back: int = 90, coins: list = None, skip_days: int = 7):
        """
        Generate historical snapshots.
        
        Args:
            days_back: How many days to backfill
            coins: List of coin IDs (default: top 50 from regime dataset)
            skip_days: Generate snapshot every N days (default: 7 = weekly)
        """
        print(f"🔄 Backfilling {days_back} days of historical snapshots...")
        print(f"   Frequency: Every {skip_days} days")
        print()
        
        # Get coin list
        if coins is None:
            import csv
            regime_path = Path(__file__).parent.parent.parent / "data_lake/crypto_pipeline/context/current_regime_browsed_master_summary.csv"
            
            with open(regime_path) as f:
                regime_rows = list(csv.DictReader(f))
            
            coins = ['bitcoin'] + [r['coingecko_id'] for r in regime_rows[:50] if r['coingecko_id'] != 'bitcoin']
            coins = coins[:50]
        
        print(f"   Coins: {len(coins)}")
        print()
        
        # Generate snapshots for past dates
        start_date = datetime.now() - timedelta(days=days_back)
        snapshots_created = 0
        
        for day_offset in range(0, days_back + 1, skip_days):
            snapshot_date = start_date + timedelta(days=day_offset)
            
            # Skip if already exists
            existing = self.storage.read_snapshot(snapshot_date)
            if not existing.empty:
                print(f"  ⏭️  {snapshot_date.strftime('%Y-%m-%d')}: Already exists ({len(existing)} coins)")
                continue
            
            print(f"  📊 {snapshot_date.strftime('%Y-%m-%d')}: Generating...", end=' ')
            
            try:
                # Run tracker as-of that date
                df = self.tracker.run(coins, date=snapshot_date)
                
                if not df.empty:
                    # Save to storage
                    data = df.to_dict('records')
                    self.storage.write_snapshot(snapshot_date, data)
                    
                    # Quick stats
                    strong_count = len(df[df['score'] >= 4])
                    
                    print(f"✓ {len(df)} coins, {strong_count} strong signals")
                    snapshots_created += 1
                else:
                    print(f"⚠️  No data")
                
            except Exception as e:
                print(f"❌ Error: {e}")
                continue
        
        print()
        print(f"✓ Backfill complete: {snapshots_created} snapshots created")
        print()
        
        return snapshots_created
    
    def calculate_all_forward_returns(self, forward_days: int = 7):
        """
        Calculate forward returns for all historical snapshots.
        
        This validates whether our signals predicted correctly.
        """
        print(f"📈 Calculating {forward_days}-day forward returns for all snapshots...")
        print()
        
        # Get all snapshot dates
        import sqlite3
        with sqlite3.connect(self.storage.db_path) as conn:
            dates_query = "SELECT DISTINCT date FROM snapshots ORDER BY date"
            dates_df = pd.read_sql_query(dates_query, conn)
        
        if dates_df.empty:
            print("  ⚠️  No snapshots found. Run backfill first.")
            return
        
        returns_calculated = 0
        
        for snapshot_date_str in dates_df['date']:
            snapshot_date = datetime.fromisoformat(snapshot_date_str)
            target_date = snapshot_date + timedelta(days=forward_days)
            
            # Skip if target date is in the future
            if target_date > datetime.now():
                print(f"  ⏭️  {snapshot_date_str}: Future date, skipping")
                continue
            
            print(f"  📊 {snapshot_date_str} → {target_date.strftime('%Y-%m-%d')}: ", end='')
            
            # Get snapshot
            snapshot_df = self.storage.read_snapshot(snapshot_date)
            
            if snapshot_df.empty:
                print("No snapshot")
                continue
            
            # Get future prices
            coin_ids = snapshot_df['coin_id'].tolist()
            future_data = self.tracker.collector.collect(coin_ids, date=target_date)
            
            # Calculate returns
            returns_count = 0
            
            for _, row in snapshot_df.iterrows():
                coin_id = row['coin_id']
                old_price = row['price_usd']
                
                if coin_id in future_data and old_price > 0:
                    new_price = future_data[coin_id]['price_usd']
                    return_pct = ((new_price / old_price) - 1) * 100
                    
                    # Record to database
                    self.storage.record_forward_return(
                        snapshot_date, coin_id, forward_days, return_pct
                    )
                    
                    returns_count += 1
            
            print(f"✓ {returns_count} returns")
            returns_calculated += returns_count
        
        print()
        print(f"✓ Forward returns calculated: {returns_calculated} total")
        print()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Backfill historical snapshots')
    parser.add_argument('--days', type=int, default=90, help='Days to backfill (default: 90)')
    parser.add_argument('--skip', type=int, default=7, help='Generate every N days (default: 7)')
    parser.add_argument('--coins', type=int, default=50, help='Number of coins to track (default: 50)')
    parser.add_argument('--returns', action='store_true', help='Calculate forward returns after backfill')
    parser.add_argument('--returns-only', action='store_true', help='Only calculate forward returns (skip backfill)')
    
    args = parser.parse_args()
    
    backfill = HistoricalBackfill()
    
    if not args.returns_only:
        # Run backfill
        backfill.backfill(days_back=args.days, skip_days=args.skip)
    
    if args.returns or args.returns_only:
        # Calculate forward returns
        backfill.calculate_all_forward_returns(forward_days=7)
        
        # Show validation summary
        print()
        print("=" * 80)
        print("VALIDATION SUMMARY")
        print("=" * 80)
        print()
        
        validation_df = backfill.storage.get_validation_data(days_forward=7, min_score=0)
        
        if not validation_df.empty:
            print(f"Total validated observations: {len(validation_df)}")
            print()
            
            for score in [5, 4, 3, 2]:
                score_df = validation_df[validation_df['score'] >= score]
                
                if len(score_df) > 0:
                    avg_ret = score_df['return_pct'].mean()
                    print(f"  Score {score}+: {avg_ret:+6.2f}% avg return ({len(score_df)} samples)")
        else:
            print("No validation data yet. Need to wait for future dates.")
