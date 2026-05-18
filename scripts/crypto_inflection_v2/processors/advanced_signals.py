"""Advanced signal calculator combining multiple data sources"""

import numpy as np
from typing import Dict, List, Any
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))
from base import SignalCalculator


class AdvancedSignalCalculator(SignalCalculator):
    """
    Multi-dimensional signal calculator.
    
    Combines:
    - Price signals (8)
    - On-chain signals (5)
    - Social signals (5)
    - Developer signals (4)
    - Exchange signals (3)
    
    Total: 25 signals across 5 dimensions
    """
    
    def __init__(self):
        super().__init__("AdvancedSignals")
    
    def calculate(self, price_data: Dict[str, Any], 
                  onchain_data: Dict[str, Any] = None,
                  social_data: Dict[str, Any] = None,
                  github_data: Dict[str, Any] = None,
                  exchange_data: Dict[str, Any] = None) -> Dict[str, float]:
        """
        Calculate advanced signals from multiple data sources.
        
        Returns dict with ~25 signal keys.
        """
        signals = {}
        
        # PRICE SIGNALS (8) - from existing calculator
        signals.update(self._price_signals(price_data))
        
        # ON-CHAIN SIGNALS (5)
        if onchain_data:
            signals.update(self._onchain_signals(onchain_data))
        else:
            signals.update(self._empty_onchain())
        
        # SOCIAL SIGNALS (5)
        if social_data:
            signals.update(self._social_signals(social_data))
        else:
            signals.update(self._empty_social())
        
        # DEVELOPER SIGNALS (4)
        if github_data:
            signals.update(self._github_signals(github_data))
        else:
            signals.update(self._empty_github())
        
        # EXCHANGE SIGNALS (3)
        if exchange_data:
            signals.update(self._exchange_signals(exchange_data))
        else:
            signals.update(self._empty_exchange())
        
        return signals
    
    def _price_signals(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Price-based signals (reuse from PriceSignalCalculator)"""
        from price_signals import PriceSignalCalculator
        
        calc = PriceSignalCalculator()
        return calc.calculate(data)
    
    def _onchain_signals(self, data: Dict[str, Any]) -> Dict[str, float]:
        """On-chain activity signals"""
        signals = {}
        
        # 1. Active address growth
        active_7d = data.get('active_addresses_7d', 0)
        active_30d = data.get('active_addresses_30d', 0)
        
        if active_30d > 0:
            expected = active_30d / 4  # Weekly average
            growth = (active_7d / expected) - 1 if expected > 0 else 0
            signals['onchain_address_surge'] = 1 if growth > 0.3 else 0
        else:
            signals['onchain_address_surge'] = 0
        
        # 2. Transaction surge
        tx_7d = data.get('transaction_count_7d', 0)
        signals['onchain_tx_surge'] = 1 if tx_7d > 1000 else 0
        
        # 3. Whale activity
        whale_tx = data.get('whale_transactions_7d', 0)
        signals['onchain_whale_activity'] = 1 if whale_tx > 5 else 0
        
        # 4. Exchange flows (negative = accumulation)
        net_flow = data.get('net_flow_cex', 0)
        signals['onchain_accumulation'] = 1 if net_flow < -1e6 else 0  # $1M+ outflow
        
        # 5. Holder growth
        holders = data.get('unique_holders', 0)
        signals['onchain_holder_growth'] = 1 if holders > 10000 else 0
        
        return signals
    
    def _social_signals(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Social sentiment signals"""
        signals = {}
        
        # Twitter
        twitter_momentum = data.get('twitter_mention_momentum', 0)
        signals['social_twitter_surge'] = 1 if twitter_momentum > 0.5 else 0
        
        twitter_sentiment = data.get('twitter_sentiment_score', 0)
        signals['social_positive_sentiment'] = 1 if twitter_sentiment > 0.3 else 0
        
        # Reddit
        reddit_momentum = data.get('reddit_post_momentum', 0)
        signals['social_reddit_surge'] = 1 if reddit_momentum > 0.5 else 0
        
        # Influencer attention
        influencer_mentions = data.get('influencer_mentions', 0)
        signals['social_influencer_buzz'] = 1 if influencer_mentions > 3 else 0
        
        # Viral potential (high volume + positive sentiment)
        mentions_7d = data.get('twitter_mention_count_7d', 0)
        signals['social_viral_momentum'] = 1 if (mentions_7d > 1000 and twitter_sentiment > 0.2) else 0
        
        return signals
    
    def _github_signals(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Developer activity signals"""
        signals = {}
        
        # 1. Development activity surge
        commit_momentum = data.get('commit_momentum', 0)
        signals['dev_commit_surge'] = 1 if commit_momentum > 0.3 else 0
        
        # 2. Active development (recent commits)
        last_commit_days = data.get('last_commit_days', 9999)
        signals['dev_actively_maintained'] = 1 if last_commit_days < 7 else 0
        
        # 3. Growing community
        stars = data.get('stars', 0)
        signals['dev_popular_repo'] = 1 if stars > 5000 else 0
        
        # 4. High activity (lots of PRs/issues = engaged community)
        prs_7d = data.get('prs_7d', 0)
        issues_7d = data.get('issues_7d', 0)
        signals['dev_high_activity'] = 1 if (prs_7d + issues_7d) > 10 else 0
        
        return signals
    
    def _exchange_signals(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Exchange liquidity signals"""
        signals = {}
        
        # 1. High liquidity
        liquidity_score = data.get('liquidity_score', 0)
        signals['exchange_liquid'] = 1 if liquidity_score > 70 else 0
        
        # 2. Tight spread (good for execution)
        spread = data.get('bid_ask_spread', 999)
        signals['exchange_tight_spread'] = 1 if spread < 0.1 else 0
        
        # 3. Whale accumulation (large trades)
        large_trades = data.get('large_trades_1h', 0)
        signals['exchange_whale_buying'] = 1 if large_trades > 5 else 0
        
        return signals
    
    def _empty_onchain(self) -> Dict[str, float]:
        return {
            'onchain_address_surge': 0,
            'onchain_tx_surge': 0,
            'onchain_whale_activity': 0,
            'onchain_accumulation': 0,
            'onchain_holder_growth': 0,
        }
    
    def _empty_social(self) -> Dict[str, float]:
        return {
            'social_twitter_surge': 0,
            'social_positive_sentiment': 0,
            'social_reddit_surge': 0,
            'social_influencer_buzz': 0,
            'social_viral_momentum': 0,
        }
    
    def _empty_github(self) -> Dict[str, float]:
        return {
            'dev_commit_surge': 0,
            'dev_actively_maintained': 0,
            'dev_popular_repo': 0,
            'dev_high_activity': 0,
        }
    
    def _empty_exchange(self) -> Dict[str, float]:
        return {
            'exchange_liquid': 0,
            'exchange_tight_spread': 0,
            'exchange_whale_buying': 0,
        }
    
    def calculate_score(self, signals: Dict[str, float]) -> float:
        """Calculate total score (sum of all signals)"""
        return sum(signals.values())
    
    def calculate_dimensional_scores(self, signals: Dict[str, float]) -> Dict[str, float]:
        """
        Calculate scores by dimension.
        
        Returns:
            {
                'price': 0-8,
                'onchain': 0-5,
                'social': 0-5,
                'dev': 0-4,
                'exchange': 0-3,
                'total': 0-25
            }
        """
        price_signals = [k for k in signals if not k.startswith(('onchain_', 'social_', 'dev_', 'exchange_'))]
        
        return {
            'price': sum(signals.get(k, 0) for k in price_signals),
            'onchain': sum(signals.get(k, 0) for k in signals if k.startswith('onchain_')),
            'social': sum(signals.get(k, 0) for k in signals if k.startswith('social_')),
            'dev': sum(signals.get(k, 0) for k in signals if k.startswith('dev_')),
            'exchange': sum(signals.get(k, 0) for k in signals if k.startswith('exchange_')),
            'total': sum(signals.values()),
        }


if __name__ == "__main__":
    print("Testing advanced signal calculator...")
    
    # Mock data for all dimensions
    price_data = {
        'price_usd': 50000,
        'volume_usd': 1e9,
        'history_7d': [{'price_usd': 48000, 'volume_usd': 8e8}] * 7,
        'history_30d': [{'price_usd': 45000, 'volume_usd': 5e8}] * 30,
        'history_90d': [{'price_usd': 40000, 'volume_usd': 4e8}] * 90,
    }
    
    onchain_data = {
        'active_addresses_7d': 100000,
        'active_addresses_30d': 200000,
        'transaction_count_7d': 5000,
        'whale_transactions_7d': 10,
        'net_flow_cex': -2e6,
        'unique_holders': 50000,
    }
    
    social_data = {
        'twitter_mention_momentum': 0.8,
        'twitter_sentiment_score': 0.5,
        'twitter_mention_count_7d': 5000,
        'reddit_post_momentum': 0.6,
        'influencer_mentions': 5,
    }
    
    github_data = {
        'commit_momentum': 0.4,
        'last_commit_days': 2,
        'stars': 10000,
        'prs_7d': 15,
        'issues_7d': 8,
    }
    
    exchange_data = {
        'liquidity_score': 85,
        'bid_ask_spread': 0.05,
        'large_trades_1h': 8,
    }
    
    # Calculate signals
    calc = AdvancedSignalCalculator()
    signals = calc.calculate(price_data, onchain_data, social_data, github_data, exchange_data)
    
    # Dimensional scores
    dim_scores = calc.calculate_dimensional_scores(signals)
    
    print("\nDimensional Scores:")
    print(f"  Price:     {dim_scores['price']:.0f}/8   ({'█' * int(dim_scores['price'])})")
    print(f"  On-chain:  {dim_scores['onchain']:.0f}/5   ({'█' * int(dim_scores['onchain'])})")
    print(f"  Social:    {dim_scores['social']:.0f}/5   ({'█' * int(dim_scores['social'])})")
    print(f"  Developer: {dim_scores['dev']:.0f}/4   ({'█' * int(dim_scores['dev'])})")
    print(f"  Exchange:  {dim_scores['exchange']:.0f}/3   ({'█' * int(dim_scores['exchange'])})")
    print(f"  TOTAL:     {dim_scores['total']:.0f}/25  ({'█' * int(dim_scores['total'])})")
    
    print(f"\n✓ Advanced calculator ready with {len(signals)} total signals")
