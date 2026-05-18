"""
CoinGecko data collector - price, volume, market cap
"""

import pandas as pd
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))
from base import DataCollector


class CoinGeckoCollector(DataCollector):
    """Collects price, volume, and market cap data from CoinGecko export"""
    
    def __init__(self, data_path: str = None):
        super().__init__("CoinGecko")
        
        # Default to existing price panel
        if data_path is None:
            base = Path(__file__).parent.parent.parent.parent
            data_path = base / "data_lake/crypto_pipeline/exports/price_panel_long.csv"
        
        self.data_path = Path(data_path)
        self.df = None
        self._load_data()
    
    def _load_data(self):
        """Load price data into memory"""
        try:
            self.df = pd.read_csv(self.data_path)
            self.df = self.df.rename(columns={'cg_id': 'coingecko_id'})
            self.df['date'] = pd.to_datetime(self.df['date'])
            self.logger.info(f"Loaded {len(self.df)} price records")
        except Exception as e:
            self.logger.error(f"Failed to load data: {e}")
            raise
    
    def collect(self, coin_ids: List[str], date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Collect price data for specified coins.
        
        Returns:
            {
                'bitcoin': {
                    'price_usd': 72000.0,
                    'volume_usd': 25000000000.0,
                    'market_cap_usd': 1400000000000.0,
                    'history_7d': [...],  # last 7 days of prices
                    'history_30d': [...], # last 30 days of prices
                    'history_90d': [...], # last 90 days of prices
                },
                ...
            }
        """
        if date is None:
            date = self.df['date'].max()
        
        results = {}
        
        for coin_id in coin_ids:
            try:
                # Get coin data
                coin_data = self.df[self.df['coingecko_id'] == coin_id].copy()
                
                if len(coin_data) == 0:
                    self.logger.warning(f"No data for {coin_id}")
                    continue
                
                # Sort by date
                coin_data = coin_data.sort_values('date')
                
                # Get latest snapshot
                latest = coin_data[coin_data['date'] <= date].tail(1)
                
                if len(latest) == 0:
                    continue
                
                # Get historical windows
                hist_90d = coin_data[coin_data['date'] <= date].tail(90)
                hist_30d = hist_90d.tail(30)
                hist_7d = hist_90d.tail(7)
                
                results[coin_id] = {
                    'price_usd': float(latest['price_usd'].iloc[0]),
                    'volume_usd': float(latest['volume_usd'].iloc[0]),
                    'market_cap_usd': float(latest['market_cap_usd'].iloc[0]),
                    'date': latest['date'].iloc[0].isoformat(),
                    'name': latest['name'].iloc[0] if 'name' in latest.columns else coin_id,
                    
                    # Historical data for signal calculation
                    'history_7d': hist_7d[['date', 'price_usd', 'volume_usd', 'market_cap_usd']].to_dict('records'),
                    'history_30d': hist_30d[['date', 'price_usd', 'volume_usd', 'market_cap_usd']].to_dict('records'),
                    'history_90d': hist_90d[['date', 'price_usd', 'volume_usd', 'market_cap_usd']].to_dict('records'),
                }
                
            except Exception as e:
                self.handle_error(coin_id, e)
        
        self.logger.info(f"Collected data for {len(results)}/{len(coin_ids)} coins")
        return results


if __name__ == "__main__":
    # Test the collector
    collector = CoinGeckoCollector()
    
    test_coins = ['bitcoin', 'ethereum', 'solana', 'cardano']
    data = collector.collect(test_coins)
    
    print(f"\nCollected data for {len(data)} coins:")
    for coin_id, metrics in data.items():
        print(f"\n{coin_id}:")
        print(f"  Price: ${metrics['price_usd']:,.2f}")
        print(f"  Volume: ${metrics['volume_usd']:,.0f}")
        print(f"  Market Cap: ${metrics['market_cap_usd']:,.0f}")
        print(f"  History: {len(metrics['history_90d'])} days")
