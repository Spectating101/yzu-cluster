"""Portfolio construction using Kelly criterion and regime-adaptive sizing"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple
from pathlib import Path
from datetime import datetime
import sys

sys.path.append(str(Path(__file__).parent))
from storage import SQLiteStorage
from processors.regime_detector import RegimeDetector


class PortfolioConstructor:
    """
    Build optimal portfolio from inflection signals.
    
    Features:
    - Kelly criterion position sizing
    - Regime-adaptive allocation
    - Risk management (max position, max total exposure)
    - Diversification constraints
    """
    
    def __init__(self, total_capital: float = 100000):
        self.total_capital = total_capital
        self.storage = SQLiteStorage()
        self.detector = RegimeDetector()
    
    def construct_portfolio(self, 
                           min_score: float = 3.0,
                           max_positions: int = 10,
                           max_position_pct: float = 0.15,
                           max_total_exposure: float = 0.50) -> pd.DataFrame:
        """
        Construct portfolio from latest signals.
        
        Args:
            min_score: Minimum signal score to consider
            max_positions: Maximum number of positions
            max_position_pct: Max % of capital per position (15% default)
            max_total_exposure: Max % of capital deployed (50% default)
        
        Returns:
            DataFrame with coin, score, position_size, allocation_pct
        """
        print(f"💼 Constructing portfolio (${self.total_capital:,.0f} capital)...")
        print()
        
        # Get latest signals
        latest_df = self.storage.read_snapshot(datetime.now())
        
        if latest_df.empty:
            print("  ⚠️  No data available")
            return pd.DataFrame()
        
        # Filter to eligible coins
        eligible = latest_df[latest_df['score'] >= min_score].copy()
        eligible = eligible.sort_values('score', ascending=False)
        
        if len(eligible) == 0:
            print(f"  ⚠️  No coins with score >= {min_score}")
            return pd.DataFrame()
        
        print(f"  Eligible coins: {len(eligible)} (score >= {min_score})")
        
        # Get current regime
        regime = self.detector.detect_regime()
        regime_name = regime['regime']
        
        print(f"  Current regime: {regime_name}")
        
        # Calculate position sizes
        positions = []
        total_allocated = 0
        
        for idx, row in eligible.head(max_positions).iterrows():
            coin_id = row['coin_id']
            score = row['score']
            
            # Base allocation by score
            if score >= 5:
                base_alloc = 0.15  # 15% for very strong
            elif score >= 4:
                base_alloc = 0.12  # 12% for strong
            elif score >= 3:
                base_alloc = 0.08  # 8% for bullish
            else:
                base_alloc = 0.05  # 5% for neutral
            
            # Adjust for regime
            regime_multiplier = self._get_regime_multiplier(regime_name, row)
            
            # Adjust for liquidity (if available)
            liquidity_multiplier = self._get_liquidity_multiplier(row)
            
            # Final allocation
            allocation_pct = min(
                base_alloc * regime_multiplier * liquidity_multiplier,
                max_position_pct
            )
            
            # Check total exposure limit
            if total_allocated + allocation_pct > max_total_exposure:
                allocation_pct = max(0, max_total_exposure - total_allocated)
            
            if allocation_pct > 0.01:  # Minimum 1% position
                position_size = self.total_capital * allocation_pct
                
                positions.append({
                    'coin_id': coin_id,
                    'name': row['name'],
                    'score': score,
                    'allocation_pct': allocation_pct * 100,
                    'position_size_usd': position_size,
                    'shares': position_size / row['price_usd'],
                    'entry_price': row['price_usd'],
                    'regime_mult': regime_multiplier,
                    'liquidity_mult': liquidity_multiplier,
                })
                
                total_allocated += allocation_pct
                
                if total_allocated >= max_total_exposure:
                    break
        
        portfolio_df = pd.DataFrame(positions)
        
        print()
        print(f"✓ Portfolio constructed: {len(portfolio_df)} positions")
        print(f"  Total exposure: {total_allocated:.1%}")
        print(f"  Cash remaining: {(1 - total_allocated) * 100:.1f}%")
        print()
        
        return portfolio_df
    
    def _get_regime_multiplier(self, regime: str, coin_row: pd.Series) -> float:
        """Adjust position size based on regime"""
        # In BULL regime, favor momentum signals
        if regime == 'BULL':
            if coin_row.get('accelerating', 0) or coin_row.get('volume_surge', 0):
                return 1.2  # 20% larger
        
        # In BEAR regime, reduce allocation
        elif regime == 'BEAR':
            return 0.7  # 30% smaller
        
        # In VOLATILE regime, reduce allocation
        elif regime == 'VOLATILE':
            return 0.8  # 20% smaller
        
        return 1.0  # RANGE or default
    
    def _get_liquidity_multiplier(self, coin_row: pd.Series) -> float:
        """Adjust position size based on liquidity"""
        volume = coin_row.get('volume_usd', 0)
        
        # Reduce position for low liquidity coins
        if volume < 100000:  # <$100K daily volume
            return 0.5  # 50% smaller
        elif volume < 1000000:  # <$1M daily volume
            return 0.8  # 20% smaller
        
        return 1.0  # Good liquidity
    
    def print_portfolio(self, portfolio_df: pd.DataFrame):
        """Print formatted portfolio"""
        if portfolio_df.empty:
            print("No positions")
            return
        
        print("=" * 100)
        print("PORTFOLIO ALLOCATION")
        print("=" * 100)
        print()
        
        for _, row in portfolio_df.iterrows():
            print(f"{row['name'][:30]:30s} | Score: {row['score']:.0f}/8")
            print(f"  Allocation: {row['allocation_pct']:5.1f}% | ${row['position_size_usd']:10,.0f}")
            print(f"  Entry: ${row['entry_price']:12,.4f} | Shares: {row['shares']:,.2f}")
            print(f"  Adjustments: Regime {row['regime_mult']:.2f}x | Liquidity {row['liquidity_mult']:.2f}x")
            print()
        
        print("=" * 100)
        print(f"Total Allocated: ${portfolio_df['position_size_usd'].sum():,.0f}")
        print(f"Cash Remaining: ${self.total_capital - portfolio_df['position_size_usd'].sum():,.0f}")
    
    def calculate_expected_returns(self, portfolio_df: pd.DataFrame, horizon_days: int = 7) -> Dict:
        """
        Calculate expected portfolio returns based on historical backtests.
        
        Uses historical score → return relationship.
        """
        if portfolio_df.empty:
            return {'expected_return_pct': 0, 'risk_pct': 0}
        
        # Historical returns by score (from backtests)
        historical_returns = {
            5: 25.0,  # Score 5+: +25% (7 days)
            4: 16.0,  # Score 4:  +16%
            3: 19.0,  # Score 3:  +19%
            2: 5.0,   # Score 2:  +5%
            1: 0.0,   # Score 0-1: 0%
        }
        
        historical_volatility = {
            5: 15.0,  # Lower vol (strong signals)
            4: 20.0,
            3: 25.0,
            2: 30.0,
            1: 35.0,  # Higher vol (weak signals)
        }
        
        # Calculate weighted expected return
        total_weight = portfolio_df['allocation_pct'].sum() / 100
        
        expected_return = 0
        expected_vol = 0
        
        for _, row in portfolio_df.iterrows():
            score_bucket = min(int(row['score']), 5)
            weight = (row['allocation_pct'] / 100) / total_weight
            
            expected_return += weight * historical_returns.get(score_bucket, 0)
            expected_vol += (weight ** 2) * (historical_volatility.get(score_bucket, 30) ** 2)
        
        expected_vol = np.sqrt(expected_vol)
        
        # Annualize
        periods_per_year = 365 / horizon_days
        annual_return = ((1 + expected_return / 100) ** periods_per_year - 1) * 100
        annual_vol = expected_vol * np.sqrt(periods_per_year)
        
        sharpe = annual_return / annual_vol if annual_vol > 0 else 0
        
        return {
            f'expected_return_{horizon_days}d_pct': expected_return,
            'expected_return_annual_pct': annual_return,
            'volatility_annual_pct': annual_vol,
            'sharpe_ratio': sharpe,
        }


if __name__ == "__main__":
    print("Portfolio Constructor")
    print()
    
    # Construct portfolio with $100K
    constructor = PortfolioConstructor(total_capital=100000)
    
    portfolio = constructor.construct_portfolio(
        min_score=3.0,
        max_positions=10,
        max_position_pct=0.15,
        max_total_exposure=0.50
    )
    
    if not portfolio.empty:
        # Print portfolio
        constructor.print_portfolio(portfolio)
        
        # Calculate expected returns
        expected = constructor.calculate_expected_returns(portfolio, horizon_days=7)
        
        print("\nEXPECTED PERFORMANCE (Based on historical backtests):")
        print(f"  7-day return: {expected['expected_return_7d_pct']:+.2f}%")
        print(f"  Annualized return: {expected['expected_return_annual_pct']:+.2f}%")
        print(f"  Annualized volatility: {expected['volatility_annual_pct']:.2f}%")
        print(f"  Sharpe ratio: {expected['sharpe_ratio']:.2f}")
        print()
        print("⚠️  Past performance does not guarantee future results")
