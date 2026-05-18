"""Token address mapping for on-chain data collection"""

import json
from pathlib import Path
from typing import Dict, List, Optional
import requests
import time


class TokenAddressMapper:
    """
    Maps CoinGecko IDs to blockchain contract addresses.
    
    Uses CoinGecko API to fetch contract addresses automatically.
    Falls back to hardcoded mapping for common tokens.
    """
    
    def __init__(self, cache_path: Optional[str] = None):
        if cache_path is None:
            cache_dir = Path(__file__).parent.parent.parent / "data_lake/crypto_inflection"
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path = cache_dir / "token_address_mapping.json"
        
        self.cache_path = Path(cache_path)
        self.mapping = self._load_cache()
    
    def _load_cache(self) -> Dict[str, Dict[str, str]]:
        """Load cached mapping"""
        if self.cache_path.exists():
            with open(self.cache_path) as f:
                return json.load(f)
        
        return self._get_hardcoded_mapping()
    
    def _save_cache(self):
        """Save mapping to cache"""
        with open(self.cache_path, 'w') as f:
            json.dump(self.mapping, f, indent=2)
    
    def _get_hardcoded_mapping(self) -> Dict[str, Dict[str, str]]:
        """
        Hardcoded mapping for top tokens.
        
        Format: {coin_id: {chain: address}}
        """
        return {
            'ethereum': {
                'ethereum': '0x0000000000000000000000000000000000000000'  # Native ETH
            },
            'uniswap': {
                'ethereum': '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
            },
            'chainlink': {
                'ethereum': '0x514910771af9ca656af840dff83e8264ecf986ca'
            },
            'aave': {
                'ethereum': '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'
            },
            'maker': {
                'ethereum': '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'
            },
            'compound-governance-token': {
                'ethereum': '0xc00e94cb662c3520282e6f5717214004a7f26888'
            },
            'curve-dao-token': {
                'ethereum': '0xd533a949740bb3306d119cc777fa900ba034cd52'
            },
            'synthetix-network-token': {
                'ethereum': '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'
            },
            'the-graph': {
                'ethereum': '0xc944e90c64b2c07662a292be6244bdf05cda44a7'
            },
            'balancer': {
                'ethereum': '0xba100000625a3754423978a60c9317c58a424e3d'
            },
            'sushi': {
                'ethereum': '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'
            },
            '1inch': {
                'ethereum': '0x111111111117dc0aa78b770fa6a738034120c302'
            },
            'wrapped-bitcoin': {
                'ethereum': '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'
            },
            'usd-coin': {
                'ethereum': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                'polygon-pos': '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
            },
            'tether': {
                'ethereum': '0xdac17f958d2ee523a2206206994597c13d831ec7',
                'tron': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
            },
            'dai': {
                'ethereum': '0x6b175474e89094c44da98b954eedeac495271d0f'
            },
        }
    
    def get_address(self, coin_id: str, chain: str = 'ethereum') -> Optional[str]:
        """
        Get contract address for a coin.
        
        Args:
            coin_id: CoinGecko coin ID
            chain: Blockchain (ethereum, polygon-pos, binance-smart-chain, etc)
        
        Returns:
            Contract address or None
        """
        if coin_id in self.mapping:
            return self.mapping[coin_id].get(chain)
        
        return None
    
    def fetch_from_coingecko(self, coin_ids: List[str], update_cache: bool = True) -> Dict[str, Dict[str, str]]:
        """
        Fetch contract addresses from CoinGecko API.
        
        Free tier: No rate limit for this endpoint
        """
        print(f"Fetching contract addresses for {len(coin_ids)} coins...")
        
        new_mappings = {}
        
        for coin_id in coin_ids:
            try:
                # Get coin details from CoinGecko
                url = f"https://api.coingecko.com/api/v3/coins/{coin_id}"
                response = requests.get(url, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    platforms = data.get('platforms', {})
                    
                    # Extract contract addresses for each chain
                    addresses = {}
                    for platform, address in platforms.items():
                        if address and address != '':
                            addresses[platform] = address
                    
                    if addresses:
                        new_mappings[coin_id] = addresses
                        print(f"  ✓ {coin_id}: {len(addresses)} chains")
                    else:
                        print(f"  ⚠️ {coin_id}: No contract addresses")
                
                elif response.status_code == 429:
                    print(f"  ⚠️ Rate limited, waiting 60s...")
                    time.sleep(60)
                    continue
                
                else:
                    print(f"  ❌ {coin_id}: HTTP {response.status_code}")
                
                time.sleep(1.5)  # Be nice to CoinGecko API
                
            except Exception as e:
                print(f"  ❌ {coin_id}: {e}")
                continue
        
        # Merge with existing mapping
        if update_cache:
            self.mapping.update(new_mappings)
            self._save_cache()
            print(f"\n✓ Saved {len(new_mappings)} mappings to cache")
        
        return new_mappings
    
    def get_ethereum_tokens(self) -> Dict[str, str]:
        """Get all Ethereum token addresses"""
        eth_tokens = {}
        
        for coin_id, chains in self.mapping.items():
            if 'ethereum' in chains:
                eth_tokens[coin_id] = chains['ethereum']
        
        return eth_tokens
    
    def print_summary(self):
        """Print mapping summary"""
        print(f"Token Address Mapping:")
        print(f"  Total coins: {len(self.mapping)}")
        print()
        
        # Count by chain
        chain_counts = {}
        for coin_id, chains in self.mapping.items():
            for chain in chains.keys():
                chain_counts[chain] = chain_counts.get(chain, 0) + 1
        
        print("By chain:")
        for chain, count in sorted(chain_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {chain:30s}: {count:4d} tokens")


if __name__ == "__main__":
    import sys
    import csv
    
    mapper = TokenAddressMapper()
    
    if '--fetch' in sys.argv:
        # Fetch addresses for regime dataset coins
        regime_path = Path(__file__).parent.parent.parent / "data_lake/crypto_pipeline/context/current_regime_browsed_master_summary.csv"
        
        with open(regime_path) as f:
            regime_rows = list(csv.DictReader(f))
        
        # Get top 100 coins
        coin_ids = [r['coingecko_id'] for r in regime_rows[:100]]
        
        # Fetch from CoinGecko
        mapper.fetch_from_coingecko(coin_ids, update_cache=True)
        
        print("\n" + "=" * 80)
        mapper.print_summary()
    
    elif '--test' in sys.argv:
        # Test on a few coins
        test_coins = ['uniswap', 'chainlink', 'aave', 'bitcoin', 'ethereum']
        
        print("Testing address lookup:")
        for coin_id in test_coins:
            addr = mapper.get_address(coin_id, 'ethereum')
            
            if addr:
                print(f"  {coin_id:20s}: {addr}")
            else:
                print(f"  {coin_id:20s}: Not found")
    
    else:
        print("Token Address Mapper")
        print()
        mapper.print_summary()
        print()
        print("Usage:")
        print(f"  python3 {__file__} --fetch    # Fetch from CoinGecko API")
        print(f"  python3 {__file__} --test     # Test on sample coins")
