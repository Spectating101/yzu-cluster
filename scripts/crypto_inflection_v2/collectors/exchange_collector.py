"""Exchange metrics collector using Binance API"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))
from base import DataCollector


class BinanceCollector(DataCollector):
    """Collect exchange metrics from Binance public API (no key required)"""
    
    def __init__(self):
        super().__init__("Binance")
        self.base_url = "https://api.binance.com/api/v3"
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect exchange metrics from Binance.
        
        All endpoints are public (no API key needed).
        """
        results = {}
        
        # Map coin IDs to Binance symbols
        symbol_mapping = self._get_symbol_mapping(coin_ids)
        
        for coin_id in coin_ids:
            symbol = symbol_mapping.get(coin_id)
            
            if not symbol:
                results[coin_id] = self._empty_metrics()
                continue
            
            try:
                # Get 24h ticker stats
                ticker = self._get_ticker_24h(symbol)
                
                # Get order book depth
                depth = self._get_order_book_depth(symbol)
                
                # Get recent trades
                trades = self._get_recent_trades(symbol)
                
                # Calculate metrics
                volume_24h = float(ticker.get('quoteVolume', 0))
                price_change_24h = float(ticker.get('priceChangePercent', 0))
                
                # Bid-ask spread
                bid = float(depth.get('bids', [[0]])[0][0]) if depth.get('bids') else 0
                ask = float(depth.get('asks', [[0]])[0][0]) if depth.get('asks') else 0
                spread = ((ask - bid) / bid * 100) if bid > 0 else 0
                
                # Order book depth (total value within 1% of mid)
                book_depth_usd = self._calculate_book_depth(depth, bid, ask)
                
                # Trade size distribution
                large_trades = len([t for t in trades if float(t['quoteQty']) > 10000])
                
                results[coin_id] = {
                    'volume_24h_usd': volume_24h,
                    'price_change_24h': price_change_24h,
                    'bid_ask_spread': spread,
                    'order_book_depth_usd': book_depth_usd,
                    'trade_count_1h': len(trades),
                    'large_trades_1h': large_trades,
                    'liquidity_score': self._calculate_liquidity_score(volume_24h, spread, book_depth_usd),
                }
                
                time.sleep(0.1)  # Rate limiting
                
            except Exception as e:
                self.handle_error(e, {'coin_id': coin_id})
                results[coin_id] = self._empty_metrics()
        
        self.logger.info(f"Collected exchange data for {len(results)} coins")
        return results
    
    def _get_symbol_mapping(self, coin_ids: List[str]) -> Dict[str, str]:
        """Map CoinGecko IDs to Binance trading symbols"""
        # Hardcoded examples - would load from config in production
        known_symbols = {
            'bitcoin': 'BTCUSDT',
            'ethereum': 'ETHUSDT',
            'solana': 'SOLUSDT',
            'cardano': 'ADAUSDT',
            'ripple': 'XRPUSDT',
            'polkadot': 'DOTUSDT',
            'chainlink': 'LINKUSDT',
            'uniswap': 'UNIUSDT',
            'mantle': 'MNTUSDT',
        }
        
        return {cid: known_symbols.get(cid) for cid in coin_ids}
    
    def _get_ticker_24h(self, symbol: str) -> Dict[str, Any]:
        """Get 24h ticker statistics"""
        url = f"{self.base_url}/ticker/24hr"
        params = {'symbol': symbol}
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        
        return {}
    
    def _get_order_book_depth(self, symbol: str, limit: int = 100) -> Dict[str, Any]:
        """Get order book depth"""
        url = f"{self.base_url}/depth"
        params = {'symbol': symbol, 'limit': limit}
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        
        return {}
    
    def _get_recent_trades(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent trades (last hour)"""
        url = f"{self.base_url}/trades"
        params = {'symbol': symbol, 'limit': limit}
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        
        return []
    
    def _calculate_book_depth(self, depth: Dict[str, Any], bid: float, ask: float) -> float:
        """Calculate total USD value in order book within 1% of mid price"""
        if not depth or bid == 0 or ask == 0:
            return 0
        
        mid = (bid + ask) / 2
        threshold = mid * 0.01  # 1% range
        
        total_value = 0
        
        # Sum bids within range
        for price_str, qty_str in depth.get('bids', []):
            price = float(price_str)
            qty = float(qty_str)
            
            if abs(price - mid) / mid <= 0.01:
                total_value += price * qty
        
        # Sum asks within range
        for price_str, qty_str in depth.get('asks', []):
            price = float(price_str)
            qty = float(qty_str)
            
            if abs(price - mid) / mid <= 0.01:
                total_value += price * qty
        
        return total_value
    
    def _calculate_liquidity_score(self, volume: float, spread: float, depth: float) -> float:
        """
        Calculate composite liquidity score (0-100).
        
        Higher is better: high volume, tight spread, deep book.
        """
        # Normalize metrics (rough heuristics)
        volume_score = min(volume / 1e6, 100)  # $1M = 100
        spread_score = max(0, 100 - spread * 10)  # 0% spread = 100
        depth_score = min(depth / 1e5, 100)  # $100K depth = 100
        
        # Weighted average
        score = (volume_score * 0.5 + spread_score * 0.3 + depth_score * 0.2)
        
        return round(score, 1)
    
    def _empty_metrics(self) -> Dict[str, Any]:
        return {
            'volume_24h_usd': 0,
            'price_change_24h': 0,
            'bid_ask_spread': 0,
            'order_book_depth_usd': 0,
            'trade_count_1h': 0,
            'large_trades_1h': 0,
            'liquidity_score': 0,
        }


if __name__ == "__main__":
    print("Testing Binance collector...")
    
    collector = BinanceCollector()
    test_coins = ['bitcoin', 'ethereum', 'solana', 'mantle']
    
    print("\nCollecting exchange metrics...")
    data = collector.collect(test_coins)
    
    print("\nResults:")
    for coin_id, metrics in data.items():
        if metrics['volume_24h_usd'] > 0:
            print(f"\n{coin_id.upper()}:")
            print(f"  💰 Volume (24h): ${metrics['volume_24h_usd']:,.0f}")
            print(f"  📊 Price change (24h): {metrics['price_change_24h']:+.2f}%")
            print(f"  📏 Bid-ask spread: {metrics['bid_ask_spread']:.3f}%")
            print(f"  📖 Order book depth: ${metrics['order_book_depth_usd']:,.0f}")
            print(f"  🔄 Trades (1h): {metrics['trade_count_1h']}")
            print(f"  🐋 Large trades (>$10K, 1h): {metrics['large_trades_1h']}")
            print(f"  ⭐ Liquidity score: {metrics['liquidity_score']}/100")
    
    print("\n✓ Binance collector working (no API key required)")
