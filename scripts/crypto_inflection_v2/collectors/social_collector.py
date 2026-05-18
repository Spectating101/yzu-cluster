"""Social sentiment collector using Twitter and Reddit APIs"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import sys
import os

sys.path.append(str(Path(__file__).parent.parent))
from base import DataCollector


class TwitterCollector(DataCollector):
    """Collect sentiment from Twitter API v2 (free tier: 10K tweets/month)"""
    
    def __init__(self, bearer_token: Optional[str] = None):
        super().__init__("Twitter")
        self.bearer_token = bearer_token or os.getenv('TWITTER_BEARER_TOKEN', '')
        self.base_url = "https://api.twitter.com/2"
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect Twitter metrics for coins.
        
        Uses Twitter API v2 recent search endpoint (free tier).
        """
        results = {}
        
        # Map coin_ids to search terms
        search_terms = self._get_search_terms(coin_ids)
        
        for coin_id in coin_ids:
            query = search_terms.get(coin_id, f"${coin_id}")
            
            try:
                # Get tweet counts for last 7 days
                counts_7d = self._get_tweet_counts(query, days=7)
                counts_30d = self._get_tweet_counts(query, days=30)
                
                # Calculate momentum
                if counts_30d > 0:
                    mention_momentum = (counts_7d / (counts_30d / 4)) - 1  # Compare to weekly avg
                else:
                    mention_momentum = 0
                
                # Get sentiment (would require paid API or ML)
                sentiment_score = 0.0  # Stub
                
                results[coin_id] = {
                    'mention_count_7d': counts_7d,
                    'mention_count_30d': counts_30d,
                    'mention_momentum': mention_momentum,
                    'sentiment_score': sentiment_score,  # -1 to +1
                    'influencer_mentions': 0,  # Stub (requires follower count analysis)
                }
                
                time.sleep(1)  # Rate limiting
                
            except Exception as e:
                self.handle_error(e, {'coin_id': coin_id})
                results[coin_id] = self._empty_metrics()
        
        self.logger.info(f"Collected Twitter data for {len(results)} coins")
        return results
    
    def _get_search_terms(self, coin_ids: List[str]) -> Dict[str, str]:
        """Map CoinGecko IDs to Twitter search terms"""
        # Hardcoded examples - would load from config in production
        known_terms = {
            'bitcoin': '$BTC OR #Bitcoin',
            'ethereum': '$ETH OR #Ethereum',
            'solana': '$SOL OR #Solana',
            'cardano': '$ADA OR #Cardano',
        }
        
        return {cid: known_terms.get(cid, f"${cid}") for cid in coin_ids}
    
    def _get_tweet_counts(self, query: str, days: int) -> int:
        """Get tweet count for query in recent days"""
        if not self.bearer_token:
            return 0  # No API key
        
        try:
            # Calculate time range
            end_time = datetime.now()
            start_time = end_time - timedelta(days=days)
            
            # API call to counts endpoint
            params = {
                'query': query,
                'start_time': start_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'end_time': end_time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'granularity': 'day'
            }
            
            headers = {'Authorization': f'Bearer {self.bearer_token}'}
            
            response = requests.get(
                f"{self.base_url}/tweets/counts/recent",
                params=params,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                total = sum(bucket['tweet_count'] for bucket in data.get('data', []))
                return total
            
            return 0
            
        except Exception as e:
            self.logger.warning(f"Error getting tweet counts: {e}")
            return 0
    
    def _empty_metrics(self) -> Dict[str, Any]:
        return {
            'mention_count_7d': 0,
            'mention_count_30d': 0,
            'mention_momentum': 0,
            'sentiment_score': 0,
            'influencer_mentions': 0,
        }


class RedditCollector(DataCollector):
    """Collect sentiment from Reddit (free API, no key required)"""
    
    def __init__(self):
        super().__init__("Reddit")
        self.base_url = "https://www.reddit.com"
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect Reddit metrics using public API.
        
        Searches r/cryptocurrency and coin-specific subreddits.
        """
        results = {}
        
        for coin_id in coin_ids:
            try:
                # Search r/cryptocurrency
                search_term = coin_id
                posts_7d = self._search_subreddit('cryptocurrency', search_term, days=7)
                posts_30d = self._search_subreddit('cryptocurrency', search_term, days=30)
                
                # Calculate momentum
                if posts_30d > 0:
                    post_momentum = (posts_7d / (posts_30d / 4)) - 1
                else:
                    post_momentum = 0
                
                results[coin_id] = {
                    'post_count_7d': posts_7d,
                    'post_count_30d': posts_30d,
                    'post_momentum': post_momentum,
                    'avg_upvotes': 0,  # Stub
                    'top_post_score': 0,  # Stub
                }
                
                time.sleep(2)  # Be nice to Reddit's rate limits
                
            except Exception as e:
                self.handle_error(e, {'coin_id': coin_id})
                results[coin_id] = self._empty_metrics()
        
        self.logger.info(f"Collected Reddit data for {len(results)} coins")
        return results
    
    def _search_subreddit(self, subreddit: str, query: str, days: int) -> int:
        """Search subreddit and count recent posts"""
        try:
            # Reddit JSON API (no auth needed)
            url = f"{self.base_url}/r/{subreddit}/search.json"
            params = {
                'q': query,
                'restrict_sr': 'on',
                'sort': 'new',
                'limit': 100,
                't': 'month'  # Last month
            }
            
            headers = {'User-Agent': 'CryptoInflectionTracker/1.0'}
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                posts = data.get('data', {}).get('children', [])
                
                # Filter to recent days
                cutoff = datetime.now() - timedelta(days=days)
                recent_posts = [
                    p for p in posts
                    if datetime.fromtimestamp(p['data']['created_utc']) > cutoff
                ]
                
                return len(recent_posts)
            
            return 0
            
        except Exception as e:
            self.logger.warning(f"Error searching Reddit: {e}")
            return 0
    
    def _empty_metrics(self) -> Dict[str, Any]:
        return {
            'post_count_7d': 0,
            'post_count_30d': 0,
            'post_momentum': 0,
            'avg_upvotes': 0,
            'top_post_score': 0,
        }


if __name__ == "__main__":
    print("Testing social collectors...")
    
    test_coins = ['bitcoin', 'ethereum', 'solana']
    
    # Test Reddit (no API key needed)
    print("\nReddit collector (working without API key):")
    reddit = RedditCollector()
    reddit_data = reddit.collect(test_coins)
    
    for coin_id, metrics in reddit_data.items():
        print(f"\n{coin_id}:")
        print(f"  Posts (7d): {metrics['post_count_7d']}")
        print(f"  Posts (30d): {metrics['post_count_30d']}")
        print(f"  Momentum: {metrics['post_momentum']:.1%}")
    
    # Twitter requires API key
    print("\n\nTwitter collector:")
    twitter = TwitterCollector()
    if not twitter.bearer_token:
        print("  ⚠️  No Twitter API key found (set TWITTER_BEARER_TOKEN)")
        print("  Free tier: https://developer.twitter.com/en/portal/dashboard")
    else:
        twitter_data = twitter.collect(test_coins)
        for coin_id, metrics in twitter_data.items():
            print(f"{coin_id}: {metrics['mention_count_7d']} mentions (7d)")
    
    print("\n✓ Social collector framework ready")
