"""
Price-based signal calculator
Implements the 8 signals from the proven prototype
"""

import numpy as np
from typing import Dict, List, Any
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))
from base import SignalCalculator


class PriceSignalCalculator(SignalCalculator):
    """Calculates inflection signals from price/volume data"""
    
    def __init__(self):
        super().__init__("PriceSignals")
    
    def calculate(self, data: Dict[str, Any], btc_data: Dict[str, Any] = None) -> Dict[str, float]:
        """
        Calculate 8 price-based signals.
        
        Expected data structure:
        {
            'price_usd': float,
            'volume_usd': float,
            'market_cap_usd': float,
            'history_7d': [{'date': ..., 'price_usd': ..., 'volume_usd': ...}, ...],
            'history_30d': [...],
            'history_90d': [...],
        }
        
        btc_data: Optional Bitcoin data for comparison (same structure as data)
        
        Returns:
            {
                'price_breakout': 0 or 1,
                'volume_surge': 0 or 1,
                'accelerating': 0 or 1,
                'mcap_surge': 0 or 1,
                'beats_btc': 0 or 1,
                'vol_spike': 0 or 1,
                'uptrend': 0 or 1,
                'accumulation': 0 or 1,
            }
        """
        
        signals = {}
        
        try:
            # Extract price histories
            hist_90d = data.get('history_90d', [])
            hist_30d = data.get('history_30d', [])
            hist_7d = data.get('history_7d', [])
            
            if len(hist_7d) < 2 or len(hist_30d) < 7:
                # Not enough data
                return self._empty_signals()
            
            # Current values
            latest_price = data['price_usd']
            
            # 1. PRICE BREAKOUT: At/near 90-day high
            if len(hist_90d) > 0:
                prices_90d = [h['price_usd'] for h in hist_90d]
                high_90d = max(prices_90d)
                signals['price_breakout'] = 1 if latest_price >= high_90d * 0.95 else 0
            else:
                signals['price_breakout'] = 0
            
            # 2. VOLUME SURGE: Volume up 50%+ vs last week
            if len(hist_7d) >= 7 and len(hist_30d) >= 14:
                recent_vol = np.mean([h['volume_usd'] for h in hist_7d[-7:]])
                prev_vol = np.mean([h['volume_usd'] for h in hist_30d[-14:-7]])
                
                if prev_vol > 0:
                    vol_change = (recent_vol / prev_vol) - 1
                    signals['volume_surge'] = 1 if vol_change > 0.5 else 0
                else:
                    signals['volume_surge'] = 0
            else:
                signals['volume_surge'] = 0
            
            # 3. ACCELERATING: Returns accelerating
            if len(hist_7d) >= 7 and len(hist_30d) >= 14:
                price_7d_ago = hist_7d[0]['price_usd']
                price_14d_ago = hist_30d[-14]['price_usd'] if len(hist_30d) >= 14 else hist_7d[0]['price_usd']
                
                if price_7d_ago > 0 and price_14d_ago > 0:
                    ret_this_week = (latest_price / price_7d_ago) - 1
                    ret_last_week = (price_7d_ago / price_14d_ago) - 1
                    
                    signals['accelerating'] = 1 if (ret_this_week > ret_last_week and ret_this_week > 0.1) else 0
                else:
                    signals['accelerating'] = 0
            else:
                signals['accelerating'] = 0
            
            # 4. MCAP SURGE: Market cap up 20%+ in 30 days
            if len(hist_30d) > 0:
                mcap_now = data.get('market_cap_usd', 0)
                mcap_30d = hist_30d[0].get('market_cap_usd', 0)
                
                if mcap_30d > 0 and mcap_now > 0:
                    mcap_change = (mcap_now / mcap_30d) - 1
                    signals['mcap_surge'] = 1 if mcap_change > 0.2 else 0
                else:
                    signals['mcap_surge'] = 0
            else:
                signals['mcap_surge'] = 0
            
            # 5. BEATS BTC: Outperforming Bitcoin
            if btc_data and len(hist_30d) > 0 and len(btc_data.get('history_30d', [])) > 0:
                coin_price_30d = hist_30d[0]['price_usd']
                btc_price_30d = btc_data['history_30d'][0]['price_usd']
                
                if coin_price_30d > 0 and btc_price_30d > 0:
                    coin_ret = (latest_price / coin_price_30d) - 1
                    btc_ret = (btc_data['price_usd'] / btc_price_30d) - 1
                    
                    signals['beats_btc'] = 1 if coin_ret > btc_ret else 0
                else:
                    signals['beats_btc'] = 0
            else:
                signals['beats_btc'] = 0
            
            # 6. VOLATILITY SPIKE: Volatility increasing
            if len(hist_7d) >= 7 and len(hist_30d) >= 14:
                prices_7d = [h['price_usd'] for h in hist_7d[-7:]]
                prices_prev_7d = [h['price_usd'] for h in hist_30d[-14:-7]]
                
                returns_7d = np.diff(prices_7d) / prices_7d[:-1]
                returns_prev = np.diff(prices_prev_7d) / prices_prev_7d[:-1]
                
                vol_7d = np.std(returns_7d) if len(returns_7d) > 0 else 0
                vol_prev = np.std(returns_prev) if len(returns_prev) > 0 else 0
                
                signals['vol_spike'] = 1 if (vol_prev > 0 and vol_7d > vol_prev * 1.5) else 0
            else:
                signals['vol_spike'] = 0
            
            # 7. UPTREND: Higher lows pattern
            if len(hist_7d) >= 7:
                prices_7d = [h['price_usd'] for h in hist_7d[-7:]]
                higher_lows = sum(prices_7d[i] > prices_7d[i-1] for i in range(1, len(prices_7d))) / len(prices_7d)
                signals['uptrend'] = 1 if higher_lows > 0.6 else 0
            else:
                signals['uptrend'] = 0
            
            # 8. ACCUMULATION: Volume leading (volume surge without price breakout)
            signals['accumulation'] = 1 if (signals.get('volume_surge', 0) and not signals.get('price_breakout', 0)) else 0
            
        except Exception as e:
            self.logger.error(f"Error calculating signals: {e}")
            return self._empty_signals()
        
        return signals
    
    def _empty_signals(self) -> Dict[str, float]:
        """Return all signals as 0"""
        return {
            'price_breakout': 0,
            'volume_surge': 0,
            'accelerating': 0,
            'mcap_surge': 0,
            'beats_btc': 0,
            'vol_spike': 0,
            'uptrend': 0,
            'accumulation': 0,
        }
    
    def calculate_score(self, signals: Dict[str, float]) -> float:
        """Calculate total score (sum of signals)"""
        return sum(signals.values())


if __name__ == "__main__":
    # Test signal calculator with CoinGecko data
    sys.path.append(str(Path(__file__).parent.parent / 'collectors'))
    from coingecko_collector import CoinGeckoCollector
    
    print("Testing signal calculator...")
    
    # Collect data
    collector = CoinGeckoCollector()
    test_coins = ['bitcoin', 'ethereum', 'solana', 'cardano', 'mantle']
    data = collector.collect(test_coins)
    
    # Calculate signals
    calculator = PriceSignalCalculator()
    
    print(f"\nCalculating signals for {len(data)} coins:")
    print()
    
    for coin_id, coin_data in data.items():
        signals = calculator.calculate(coin_data)
        score = calculator.calculate_score(signals)
        
        # Get fired signals
        fired = [k for k, v in signals.items() if v > 0.5]
        
        print(f"{coin_id:20s} | Score: {score:.0f}/8 | Signals: {', '.join(fired) if fired else 'none'}")
