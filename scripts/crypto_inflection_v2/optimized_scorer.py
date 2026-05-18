"""Optimized signal scorer based on ML-learned weights"""

from typing import Dict

class OptimizedScorer:
    """
    ML-learned signal weights from 800 validated observations.
    
    Traditional equal-weight scoring gave poor results (R²=-1351).
    ML-optimized weights focus on signals that actually predict returns.
    """
    
    # Learned from Gradient Boosting on 800 samples
    SIGNAL_WEIGHTS = {
        'vol_spike': 4,         # Most predictive (importance=0.377)
        'accumulation': 3,      # Strong signal (importance=0.285, corr=+0.128)
        'beats_btc': 3,         # Moderately predictive (importance=0.264)
        'accelerating': 1,      # Weak signal (importance=0.074)
        'uptrend': 0,           # No predictive power
        'price_breakout': 0,    # No predictive power
        'volume_surge': 0,      # Surprisingly not predictive (range market?)
        'mcap_surge': 0,        # No predictive power
    }
    
    MAX_SCORE = sum(SIGNAL_WEIGHTS.values())  # 11
    
    @classmethod
    def calculate_score(cls, signals: Dict[str, int]) -> float:
        """
        Calculate weighted score from signals.
        
        Args:
            signals: Dict of signal_name -> 0/1
            
        Returns:
            Weighted score (0-11 range)
        """
        score = 0
        for signal_name, weight in cls.SIGNAL_WEIGHTS.items():
            if signals.get(signal_name, 0) == 1:
                score += weight
        return score
    
    @classmethod
    def get_verdict(cls, score: float) -> str:
        """Get human-readable verdict from score"""
        
        if score >= 8:
            return "🔥🔥🔥 EXCEPTIONAL"
        elif score >= 6:
            return "🔥🔥 VERY STRONG"
        elif score >= 4:
            return "🔥 STRONG"
        elif score >= 2:
            return "⚡ EMERGING"
        elif score >= 1:
            return "👀 WATCH"
        else:
            return "💤 QUIET"
    
    @classmethod
    def get_expected_return(cls, score: float, days: int = 7) -> float:
        """
        Estimate expected return based on historical performance.
        
        From validation data (800 samples):
        - Score 8+: ~+5% (7-day avg)
        - Score 6-7: ~+3%
        - Score 4-5: ~+2%
        - Score 2-3: ~+1%
        - Score 0-1: ~0%
        
        Note: These are estimates. Actual returns vary widely.
        """
        if score >= 8:
            return 5.0
        elif score >= 6:
            return 3.0
        elif score >= 4:
            return 2.0
        elif score >= 2:
            return 1.0
        else:
            return 0.0
    
    @classmethod
    def get_signal_analysis(cls) -> str:
        """Return explanation of what signals mean"""
        return """
ML-LEARNED SIGNAL WEIGHTS (from 800 validated observations)

TOP SIGNALS (use these):
  • vol_spike (4 points)      - Price volatility expanding (±30%+ daily moves)
  • accumulation (3 points)   - Volume increasing while price stable/rising
  • beats_btc (3 points)      - Outperforming Bitcoin in recent period

WEAK SIGNALS (low weight):
  • accelerating (1 point)    - Returns speeding up week-over-week

IGNORED SIGNALS (no predictive power):
  • price_breakout (0 points) - Doesn't predict future returns
  • volume_surge (0 points)   - Not predictive in range markets
  • uptrend (0 points)        - Lagging indicator
  • mcap_surge (0 points)     - Rare, insufficient data

REGIME NOTE: These weights were learned from 90-day period 
(Dec 2025 - Mar 2026) which was mostly RANGE market. Weights 
may differ in strong BULL or BEAR markets.
"""


if __name__ == "__main__":
    # Test examples
    print(OptimizedScorer.get_signal_analysis())
    
    print("\nEXAMPLE SCORING:")
    print("=" * 60)
    
    test_cases = [
        {"name": "All signals", "signals": {s: 1 for s in OptimizedScorer.SIGNAL_WEIGHTS}},
        {"name": "Top 3 only", "signals": {'vol_spike': 1, 'accumulation': 1, 'beats_btc': 1}},
        {"name": "Traditional momentum", "signals": {'price_breakout': 1, 'uptrend': 1, 'accelerating': 1}},
        {"name": "No signals", "signals": {}},
    ]
    
    for case in test_cases:
        score = OptimizedScorer.calculate_score(case['signals'])
        verdict = OptimizedScorer.get_verdict(score)
        expected = OptimizedScorer.get_expected_return(score)
        print(f"{case['name']:25} → Score {score}/11  {verdict}  (expect ~+{expected}%)")
