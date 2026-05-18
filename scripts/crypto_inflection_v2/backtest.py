"""Backtesting framework for inflection signals"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List
import sys

sys.path.append(str(Path(__file__).parent.parent))
from collectors.coingecko_collector import CoinGeckoCollector
from processors.price_signals import PriceSignalCalculator


class InflectionBacktest:
    """
    Historical backtest of inflection signals.
    
    Tests whether signals predict future returns.
    """
    
    def __init__(self):
        self.collector = CoinGeckoCollector()
        self.signal_calc = PriceSignalCalculator()
    
    def run_backtest(self, coin_ids: List[str], 
                     lookback_months: int = 3,
                     forward_days: int = 7) -> pd.DataFrame:
        """
        Run historical backtest.
        
        For each month in lookback period:
        1. Calculate signals as of that date
        2. Measure forward returns
        3. Group by score
        4. Analyze signal → return relationship
        
        Args:
            coin_ids: List of coins to test
            lookback_months: How many months to test
            forward_days: Forward return period (7, 14, 30)
        
        Returns:
            DataFrame with date, coin, score, signals, forward_return
        """
        print(f"📊 Running backtest on {len(coin_ids)} coins...")
        print(f"   Lookback: {lookback_months} months")
        print(f"   Forward period: {forward_days} days")
        print()
        
        results = []
        
        # Test each month
        end_date = datetime.now()
        
        for month_offset in range(lookback_months):
            test_date = end_date - timedelta(days=30 * (month_offset + 1))
            
            print(f"  Testing {test_date.strftime('%Y-%m-%d')}...", end=' ')
            
            # Collect historical data as of test date
            data = self.collector.collect(coin_ids, date=test_date)
            btc_data = data.get('bitcoin')
            
            # Calculate signals
            for coin_id, coin_data in data.items():
                try:
                    signals = self.signal_calc.calculate(coin_data, btc_data=btc_data)
                    score = self.signal_calc.calculate_score(signals)
                    
                    # Get forward return
                    forward_return = self._calculate_forward_return(
                        coin_data, forward_days
                    )
                    
                    results.append({
                        'date': test_date,
                        'coin_id': coin_id,
                        'name': coin_data.get('name', coin_id),
                        'price': coin_data['price_usd'],
                        **signals,
                        'score': score,
                        'forward_return': forward_return,
                    })
                    
                except Exception as e:
                    continue
            
            print(f"{len(results)} samples")
        
        df = pd.DataFrame(results)
        
        print(f"\n✓ Backtest complete: {len(df)} total samples")
        
        return df
    
    def _calculate_forward_return(self, coin_data: Dict, days: int) -> float:
        """Calculate forward return from historical data"""
        hist = coin_data.get('history_30d', [])
        
        if len(hist) < days:
            return np.nan
        
        # hist is ordered oldest to newest
        # Current price is coin_data['price_usd']
        # Price N days ago from "now" is hist[-days]
        
        # Actually, we need to think of this differently
        # The history is AS OF the test date
        # So we need to look FORWARD from the test date
        
        # For now, use rough approximation:
        # If we have 30 days of history and want 7-day forward,
        # compare price 7 days ago vs today (in the historical context)
        
        current_price = coin_data['price_usd']
        
        # This is a limitation of using cached data
        # In production, would need to fetch future prices
        
        return np.nan  # Stub - needs proper implementation
    
    def analyze_results(self, backtest_df: pd.DataFrame) -> Dict:
        """
        Analyze backtest results.
        
        Returns statistics by score bucket.
        """
        print("\n" + "=" * 80)
        print("BACKTEST ANALYSIS")
        print("=" * 80)
        print()
        
        # Remove NaN returns
        df = backtest_df[~backtest_df['forward_return'].isna()].copy()
        
        if len(df) == 0:
            print("⚠️  No valid forward returns calculated")
            return {}
        
        print(f"Valid samples: {len(df)}")
        print()
        
        # Group by score
        score_buckets = {
            '5+': df[df['score'] >= 5],
            '4': df[df['score'] == 4],
            '3': df[df['score'] == 3],
            '2': df[df['score'] == 2],
            '0-1': df[df['score'] <= 1],
        }
        
        results = {}
        
        for bucket_name, bucket_df in score_buckets.items():
            if len(bucket_df) == 0:
                continue
            
            avg_return = bucket_df['forward_return'].mean()
            median_return = bucket_df['forward_return'].median()
            std_return = bucket_df['forward_return'].std()
            win_rate = (bucket_df['forward_return'] > 0).mean()
            
            results[bucket_name] = {
                'count': len(bucket_df),
                'avg_return': avg_return,
                'median_return': median_return,
                'std_return': std_return,
                'win_rate': win_rate,
            }
            
            print(f"Score {bucket_name}:")
            print(f"  Samples: {len(bucket_df)}")
            print(f"  Avg return: {avg_return:+.2f}%")
            print(f"  Median return: {median_return:+.2f}%")
            print(f"  Std dev: {std_return:.2f}%")
            print(f"  Win rate: {win_rate:.1%}")
            print()
        
        return results
    
    def signal_analysis(self, backtest_df: pd.DataFrame):
        """Analyze which signals are most predictive"""
        print("=" * 80)
        print("SIGNAL ANALYSIS")
        print("=" * 80)
        print()
        
        df = backtest_df[~backtest_df['forward_return'].isna()].copy()
        
        if len(df) == 0:
            print("⚠️  No valid samples")
            return
        
        signal_names = ['price_breakout', 'volume_surge', 'accelerating', 
                       'mcap_surge', 'beats_btc', 'vol_spike', 'uptrend', 'accumulation']
        
        # Calculate average return when signal is ON vs OFF
        signal_predictiveness = []
        
        for signal in signal_names:
            if signal not in df.columns:
                continue
            
            on_df = df[df[signal] > 0.5]
            off_df = df[df[signal] <= 0.5]
            
            if len(on_df) > 0 and len(off_df) > 0:
                avg_on = on_df['forward_return'].mean()
                avg_off = off_df['forward_return'].mean()
                lift = avg_on - avg_off
                
                signal_predictiveness.append({
                    'signal': signal,
                    'avg_return_on': avg_on,
                    'avg_return_off': avg_off,
                    'lift': lift,
                    'count_on': len(on_df),
                })
        
        # Sort by lift
        signal_predictiveness.sort(key=lambda x: x['lift'], reverse=True)
        
        print("Signal predictiveness (sorted by lift):")
        print()
        
        for s in signal_predictiveness:
            print(f"{s['signal']:25s} | ON: {s['avg_return_on']:+6.2f}% | OFF: {s['avg_return_off']:+6.2f}% | Lift: {s['lift']:+6.2f}% | N: {s['count_on']}")


if __name__ == "__main__":
    print("Testing backtest framework...")
    print()
    
    # Load test coins
    import csv
    
    regime_path = Path(__file__).parent.parent.parent / "data_lake/crypto_pipeline/context/current_regime_browsed_master_summary.csv"
    
    with open(regime_path) as f:
        regime_rows = list(csv.DictReader(f))
    
    # Test on top 30 coins
    test_coins = [r['coingecko_id'] for r in regime_rows[:30]]
    
    backtest = InflectionBacktest()
    
    # Run 3-month backtest
    df = backtest.run_backtest(test_coins, lookback_months=3, forward_days=7)
    
    # NOTE: Forward returns will be NaN without proper implementation
    # This is a framework stub - production would need:
    # 1. Separate price data loading for future dates
    # 2. Proper date alignment
    # 3. Survivorship bias handling
    
    print("\n⚠️  Note: Forward return calculation is stubbed")
    print("   Production implementation needs:")
    print("   1. Load price data for future dates")
    print("   2. Handle missing data (delistings)")
    print("   3. Account for survivorship bias")
    print()
    print(f"✓ Backtest framework ready ({len(df)} samples collected)")
    print(f"  Saved sample: {df.head(3).to_string(index=False)}")
