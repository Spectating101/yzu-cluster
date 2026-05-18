"""Daily orchestrator - automated inflection tracking"""

import pandas as pd
from pathlib import Path
from datetime import datetime
import sys
import argparse

sys.path.append(str(Path(__file__).parent))
from tracker import InflectionTracker
from storage import SQLiteStorage


class DailyOrchestrator:
    """Runs daily inflection tracking and stores results"""
    
    def __init__(self, db_path: str = None):
        self.tracker = InflectionTracker()
        self.storage = SQLiteStorage(db_path)
    
    def run_daily(self, coin_ids: list = None, top_n: int = 100):
        """
        Run daily inflection tracking.
        
        Args:
            coin_ids: List of coin IDs to track (default: top 100 from regime dataset)
            top_n: Number of coins to track if coin_ids not provided
        """
        # Get coin list
        if coin_ids is None:
            coin_ids = self._get_default_coins(top_n)
        
        print(f"📅 Running daily inflection tracker for {len(coin_ids)} coins...")
        print(f"   Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        
        # Run tracker
        df = self.tracker.run(coin_ids)
        
        # Save to storage
        today = datetime.now()
        
        # Write to database
        data = df.to_dict('records')
        self.storage.write_snapshot(today, data)
        
        # Also save CSV for quick inspection
        csv_dir = Path(__file__).parent.parent.parent / "data_lake/crypto_inflection/daily_snapshots"
        csv_dir.mkdir(parents=True, exist_ok=True)
        
        csv_path = csv_dir / f"inflection_{today.strftime('%Y%m%d')}.csv"
        df.to_csv(csv_path, index=False)
        
        print(f"✓ Saved to database: {self.storage.db_path}")
        print(f"✓ Saved to CSV: {csv_path}")
        print()
        
        # Summary stats
        self._print_summary(df)
        
        return df
    
    def calculate_forward_returns(self, days_ago: int = 7):
        """
        Calculate forward returns for a snapshot from N days ago.
        
        This validates whether our signals predicted future performance.
        """
        snapshot_date = datetime.now() - pd.Timedelta(days=days_ago)
        
        print(f"📊 Calculating {days_ago}-day forward returns for {snapshot_date.strftime('%Y-%m-%d')}...")
        
        # Get historical snapshot
        snapshot_df = self.storage.read_snapshot(snapshot_date)
        
        if snapshot_df.empty:
            print(f"  ⚠️  No snapshot found for {snapshot_date.strftime('%Y-%m-%d')}")
            return
        
        # Get current prices
        coin_ids = snapshot_df['coin_id'].tolist()
        current_data = self.tracker.collector.collect(coin_ids)
        
        # Calculate returns
        returns_recorded = 0
        
        for _, row in snapshot_df.iterrows():
            coin_id = row['coin_id']
            old_price = row['price_usd']
            
            if coin_id in current_data and old_price > 0:
                new_price = current_data[coin_id]['price_usd']
                return_pct = ((new_price / old_price) - 1) * 100
                
                # Record to database
                self.storage.record_forward_return(
                    snapshot_date, coin_id, days_ago, return_pct
                )
                
                returns_recorded += 1
        
        print(f"✓ Recorded {returns_recorded} forward returns")
        
        # Show validation summary
        validation_df = self.storage.get_validation_data(days_forward=days_ago, min_score=3.0)
        
        if not validation_df.empty:
            print("\nValidation Results:")
            
            for score in [5, 4, 3]:
                score_df = validation_df[validation_df['score'] >= score]
                
                if len(score_df) > 0:
                    avg_return = score_df['return_pct'].mean()
                    print(f"  Score {score}+: {avg_return:+.2f}% avg return ({len(score_df)} coins)")
    
    def _get_default_coins(self, top_n: int = 100) -> list:
        """Get default coin list from regime dataset"""
        import csv
        
        regime_path = Path(__file__).parent.parent.parent / "data_lake/crypto_pipeline/context/current_regime_browsed_master_summary.csv"
        
        with open(regime_path) as f:
            regime_rows = list(csv.DictReader(f))
        
        # Ensure bitcoin is included for comparison
        coin_ids = ['bitcoin'] + [r['coingecko_id'] for r in regime_rows[:top_n] if r['coingecko_id'] != 'bitcoin']
        
        return coin_ids[:top_n]
    
    def _print_summary(self, df: pd.DataFrame):
        """Print summary statistics"""
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print()
        print(f"Total coins: {len(df)}")
        print(f"  🔥🔥 Score 5+: {len(df[df['score'] >= 5])} coins")
        print(f"  🔥  Score 4:  {len(df[df['score'] == 4])} coins")
        print(f"  📈  Score 3:  {len(df[df['score'] == 3])} coins")
        print(f"  ⚖️  Score 2:  {len(df[df['score'] == 2])} coins")
        print(f"  ❄️  Score 0-1: {len(df[df['score'] <= 1])} coins")
        print()
        
        # Top signals
        top_df = df[df['score'] >= 3]
        
        if not top_df.empty:
            print("Top Inflections (Score 3+):")
            for _, row in top_df.head(10).iterrows():
                print(f"  {row['verdict']:20s} {row['name'][:30]:30s} ${row['price_usd']:12,.2f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Daily crypto inflection tracker')
    parser.add_argument('--coins', type=int, default=100, help='Number of coins to track')
    parser.add_argument('--validate', type=int, help='Calculate forward returns for N days ago')
    args = parser.parse_args()
    
    orchestrator = DailyOrchestrator()
    
    if args.validate:
        # Validation mode: calculate forward returns
        orchestrator.calculate_forward_returns(days_ago=args.validate)
    else:
        # Normal mode: run daily tracking
        orchestrator.run_daily(top_n=args.coins)
