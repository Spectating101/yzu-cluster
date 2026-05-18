"""Regime detector - identifies market conditions"""

import pandas as pd
import numpy as np
from typing import Dict, Any
from pathlib import Path
from datetime import datetime, timedelta
import sys

sys.path.append(str(Path(__file__).parent.parent))
from collectors.coingecko_collector import CoinGeckoCollector


class RegimeDetector:
    """
    Detects current market regime.
    
    Regimes:
    - BULL: Strong uptrend, high volume
    - BEAR: Strong downtrend, capitulation
    - RANGE: Sideways, low volatility
    - VOLATILE: High volatility, no clear trend
    """
    
    def __init__(self):
        self.collector = CoinGeckoCollector()
    
    def detect_regime(self, lookback_days: int = 30) -> Dict[str, Any]:
        """
        Detect current market regime based on BTC and major coins.
        
        Returns:
            {
                'regime': 'BULL' | 'BEAR' | 'RANGE' | 'VOLATILE',
                'btc_trend': float (-1 to +1),
                'btc_volatility': float,
                'market_breadth': float (% of coins up),
                'volume_trend': 'increasing' | 'decreasing' | 'stable',
                'confidence': float (0-1)
            }
        """
        # Get BTC and major coins data
        major_coins = ['bitcoin', 'ethereum', 'solana', 'ripple', 'cardano']
        data = self.collector.collect(major_coins)
        
        btc_data = data.get('bitcoin', {})
        
        if not btc_data:
            return self._empty_regime()
        
        # Calculate metrics
        btc_trend = self._calculate_trend(btc_data)
        btc_vol = self._calculate_volatility(btc_data)
        breadth = self._calculate_breadth(data)
        volume_trend = self._calculate_volume_trend(btc_data)
        
        # Classify regime
        regime, confidence = self._classify_regime(btc_trend, btc_vol, breadth)
        
        return {
            'regime': regime,
            'btc_trend': btc_trend,
            'btc_volatility': btc_vol,
            'market_breadth': breadth,
            'volume_trend': volume_trend,
            'confidence': confidence,
            'timestamp': datetime.now().isoformat(),
        }
    
    def _calculate_trend(self, coin_data: Dict[str, Any]) -> float:
        """
        Calculate trend strength (-1 to +1).
        
        Uses 7d vs 30d price comparison.
        """
        hist_30d = coin_data.get('history_30d', [])
        
        if len(hist_30d) < 30:
            return 0.0
        
        prices = [h['price_usd'] for h in hist_30d]
        
        # Linear regression slope
        x = np.arange(len(prices))
        slope, _ = np.polyfit(x, prices, 1)
        
        # Normalize by current price
        current_price = coin_data['price_usd']
        
        if current_price > 0:
            trend = (slope * 30) / current_price  # 30-day change
            return np.clip(trend, -1, 1)
        
        return 0.0
    
    def _calculate_volatility(self, coin_data: Dict[str, Any]) -> float:
        """Calculate annualized volatility"""
        hist_30d = coin_data.get('history_30d', [])
        
        if len(hist_30d) < 2:
            return 0.0
        
        prices = [h['price_usd'] for h in hist_30d]
        returns = np.diff(prices) / prices[:-1]
        
        vol = np.std(returns) * np.sqrt(365)  # Annualized
        
        return vol
    
    def _calculate_breadth(self, data: Dict[str, Dict[str, Any]]) -> float:
        """Calculate market breadth (% of coins with positive 7d returns)"""
        positive_count = 0
        total_count = 0
        
        for coin_id, coin_data in data.items():
            hist_7d = coin_data.get('history_7d', [])
            
            if len(hist_7d) > 0:
                price_7d_ago = hist_7d[0]['price_usd']
                current_price = coin_data['price_usd']
                
                if price_7d_ago > 0:
                    ret = (current_price / price_7d_ago) - 1
                    
                    if ret > 0:
                        positive_count += 1
                    
                    total_count += 1
        
        if total_count > 0:
            return positive_count / total_count
        
        return 0.5
    
    def _calculate_volume_trend(self, coin_data: Dict[str, Any]) -> str:
        """Determine if volume is increasing, decreasing, or stable"""
        hist_30d = coin_data.get('history_30d', [])
        
        if len(hist_30d) < 14:
            return 'stable'
        
        vol_recent = np.mean([h['volume_usd'] for h in hist_30d[-7:]])
        vol_prev = np.mean([h['volume_usd'] for h in hist_30d[-14:-7]])
        
        if vol_prev > 0:
            change = (vol_recent / vol_prev) - 1
            
            if change > 0.2:
                return 'increasing'
            elif change < -0.2:
                return 'decreasing'
        
        return 'stable'
    
    def _classify_regime(self, trend: float, volatility: float, breadth: float) -> tuple:
        """
        Classify market regime.
        
        Returns: (regime_name, confidence)
        """
        # BULL: Positive trend + high breadth
        if trend > 0.15 and breadth > 0.6:
            return 'BULL', min(abs(trend) + breadth - 0.6, 1.0)
        
        # BEAR: Negative trend + low breadth
        if trend < -0.15 and breadth < 0.4:
            return 'BEAR', min(abs(trend) + (1 - breadth), 1.0)
        
        # VOLATILE: High volatility + mixed signals
        if volatility > 1.0:
            return 'VOLATILE', min(volatility, 1.0)
        
        # RANGE: Low volatility + neutral trend
        return 'RANGE', 1.0 - abs(trend)
    
    def _empty_regime(self) -> Dict[str, Any]:
        return {
            'regime': 'UNKNOWN',
            'btc_trend': 0.0,
            'btc_volatility': 0.0,
            'market_breadth': 0.5,
            'volume_trend': 'stable',
            'confidence': 0.0,
            'timestamp': datetime.now().isoformat(),
        }
    
    def get_regime_weights(self, regime: str) -> Dict[str, float]:
        """
        Get signal weights for a given regime.
        
        Different regimes favor different signals:
        - BULL: Momentum signals
        - BEAR: Quality/development signals
        - RANGE: Mean reversion signals
        - VOLATILE: Liquidity signals
        """
        weights = {
            'BULL': {
                'price_breakout': 1.5,
                'volume_surge': 1.3,
                'accelerating': 1.5,
                'beats_btc': 1.2,
                'social_viral_momentum': 1.4,
                'dev_commit_surge': 0.8,
                'exchange_liquid': 1.0,
            },
            'BEAR': {
                'price_breakout': 0.7,
                'volume_surge': 1.0,
                'onchain_accumulation': 1.5,
                'dev_actively_maintained': 1.4,
                'dev_high_activity': 1.3,
                'exchange_tight_spread': 1.2,
            },
            'RANGE': {
                'price_breakout': 1.0,
                'uptrend': 1.2,
                'social_positive_sentiment': 1.1,
                'dev_popular_repo': 1.0,
            },
            'VOLATILE': {
                'vol_spike': 0.5,  # Reduce weight in volatile regime
                'exchange_liquid': 1.5,
                'exchange_tight_spread': 1.4,
                'onchain_whale_activity': 1.2,
            },
        }
        
        return weights.get(regime, {})


if __name__ == "__main__":
    print("Testing regime detector...")
    
    detector = RegimeDetector()
    regime = detector.detect_regime()
    
    print(f"\nCurrent Market Regime:")
    print(f"  Regime: {regime['regime']} (confidence: {regime['confidence']:.1%})")
    print(f"  BTC trend: {regime['btc_trend']:+.2%}")
    print(f"  BTC volatility: {regime['btc_volatility']:.1%}")
    print(f"  Market breadth: {regime['market_breadth']:.1%} of coins up")
    print(f"  Volume trend: {regime['volume_trend']}")
    
    # Show recommended signal weights
    weights = detector.get_regime_weights(regime['regime'])
    
    if weights:
        print(f"\n  Recommended signal weights for {regime['regime']} regime:")
        for signal, weight in sorted(weights.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"    {signal}: {weight}x")
    
    print("\n✓ Regime detector ready")
