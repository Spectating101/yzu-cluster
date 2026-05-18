"""On-chain metrics collector using Etherscan API"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import sys
import os

sys.path.append(str(Path(__file__).parent.parent))
from base import DataCollector


class EtherscanCollector(DataCollector):
    """Collect on-chain metrics from Etherscan API (free tier)"""
    
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("Etherscan")
        
        # Try to get API key from env or use free endpoint
        self.api_key = api_key or os.getenv('ETHERSCAN_API_KEY', '')
        self.base_url = "https://api.etherscan.io/api"
        self.rate_limit_delay = 0.2  # 5 calls/sec for free tier
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect on-chain metrics for Ethereum-based tokens.
        
        Note: Only works for ERC-20 tokens. For non-Ethereum coins, returns empty.
        """
        results = {}
        
        # Load token address mapping (would need to be built separately)
        token_addresses = self._get_token_addresses(coin_ids)
        
        for coin_id in coin_ids:
            contract_address = token_addresses.get(coin_id)
            
            if not contract_address:
                # Not an Ethereum token, skip
                results[coin_id] = self._empty_metrics()
                continue
            
            try:
                metrics = {
                    'active_addresses_7d': self._get_active_addresses(contract_address, days=7),
                    'active_addresses_30d': self._get_active_addresses(contract_address, days=30),
                    'transaction_count_7d': self._get_transaction_count(contract_address, days=7),
                    'unique_holders': self._get_holder_count(contract_address),
                    'whale_transactions_7d': self._get_whale_transactions(contract_address, days=7),
                }
                
                results[coin_id] = metrics
                time.sleep(self.rate_limit_delay)
                
            except Exception as e:
                self.handle_error(e, {'coin_id': coin_id})
                results[coin_id] = self._empty_metrics()
        
        self.logger.info(f"Collected on-chain data for {len(results)} coins")
        return results
    
    def _get_token_addresses(self, coin_ids: List[str]) -> Dict[str, str]:
        """
        Map CoinGecko IDs to Ethereum contract addresses.
        
        This is a stub - in production, would query CoinGecko API or use cached mapping.
        """
        # Hardcoded examples for testing
        known_addresses = {
            'uniswap': '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
            'chainlink': '0x514910771af9ca656af840dff83e8264ecf986ca',
            'aave': '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
        }
        
        return {cid: known_addresses.get(cid) for cid in coin_ids}
    
    def _get_active_addresses(self, contract_address: str, days: int) -> int:
        """Get count of unique addresses interacting with token (approximation)"""
        # Etherscan free tier doesn't provide this directly
        # Would need to aggregate transaction data or use paid analytics
        return 0  # Stub
    
    def _get_transaction_count(self, contract_address: str, days: int) -> int:
        """Get transaction count for recent period"""
        try:
            # Get recent transactions
            params = {
                'module': 'account',
                'action': 'tokentx',
                'contractaddress': contract_address,
                'page': 1,
                'offset': 1000,  # Max for free tier
                'sort': 'desc',
                'apikey': self.api_key
            }
            
            response = requests.get(self.base_url, params=params, timeout=10)
            data = response.json()
            
            if data['status'] == '1':
                # Filter to recent days
                cutoff = datetime.now() - timedelta(days=days)
                recent_txs = [
                    tx for tx in data['result']
                    if datetime.fromtimestamp(int(tx['timeStamp'])) > cutoff
                ]
                return len(recent_txs)
            
            return 0
        except Exception as e:
            self.logger.warning(f"Error getting transaction count: {e}")
            return 0
    
    def _get_holder_count(self, contract_address: str) -> int:
        """Get unique holder count (requires paid API)"""
        # Free tier doesn't provide this
        return 0  # Stub
    
    def _get_whale_transactions(self, contract_address: str, days: int) -> int:
        """Count large transactions (>$100K equivalent)"""
        # Would need to combine transaction data with price data
        return 0  # Stub
    
    def _empty_metrics(self) -> Dict[str, Any]:
        """Return empty metrics structure"""
        return {
            'active_addresses_7d': 0,
            'active_addresses_30d': 0,
            'transaction_count_7d': 0,
            'unique_holders': 0,
            'whale_transactions_7d': 0,
        }


class DuneCollector(DataCollector):
    """
    Alternative: Dune Analytics (better free tier for on-chain metrics)
    
    Dune provides pre-aggregated on-chain metrics via SQL queries.
    More suitable for this use case than raw Etherscan data.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("Dune")
        self.api_key = api_key or os.getenv('DUNE_API_KEY', '')
        self.base_url = "https://api.dune.com/api/v1"
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect on-chain metrics from Dune Analytics.
        
        Requires pre-built Dune queries for metrics.
        """
        results = {}
        
        for coin_id in coin_ids:
            # Stub - would execute Dune query and parse results
            results[coin_id] = {
                'active_addresses_7d': 0,
                'active_addresses_30d': 0,
                'dex_volume_7d': 0,
                'unique_traders_7d': 0,
                'net_flow_cex': 0,  # Positive = accumulation
            }
        
        self.logger.info(f"Collected on-chain data from Dune for {len(results)} coins")
        return results


if __name__ == "__main__":
    print("Testing on-chain collectors...")
    
    # Test Etherscan
    collector = EtherscanCollector()
    test_coins = ['uniswap', 'chainlink', 'aave']
    
    print("\nEtherscan collector:")
    data = collector.collect(test_coins)
    
    for coin_id, metrics in data.items():
        print(f"\n{coin_id}:")
        print(f"  Transactions (7d): {metrics['transaction_count_7d']}")
        print(f"  Active addresses (7d): {metrics['active_addresses_7d']}")
    
    print("\n✓ On-chain collector framework ready")
    print("  Note: Requires API keys and address mapping for production use")
    print("  Recommendation: Use Dune Analytics for better free tier access")
