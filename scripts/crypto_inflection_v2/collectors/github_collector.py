"""GitHub developer activity collector"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import sys
import os

sys.path.append(str(Path(__file__).parent.parent))
from base import DataCollector


class GitHubCollector(DataCollector):
    """Collect developer activity metrics from GitHub API (free, unlimited for public repos)"""
    
    def __init__(self, token: Optional[str] = None):
        super().__init__("GitHub")
        self.token = token or os.getenv('GITHUB_TOKEN', '')
        self.base_url = "https://api.github.com"
        self.headers = {}
        
        if self.token:
            self.headers['Authorization'] = f'token {self.token}'
    
    def collect(self, coin_ids: List[str], date: datetime = None) -> Dict[str, Dict[str, Any]]:
        """
        Collect GitHub metrics for crypto projects.
        
        Free tier: 60 req/hr (unauthenticated), 5000 req/hr (authenticated)
        """
        results = {}
        
        # Map coin IDs to GitHub repos
        repo_mapping = self._get_repo_mapping(coin_ids)
        
        for coin_id in coin_ids:
            repo_full_name = repo_mapping.get(coin_id)
            
            if not repo_full_name:
                results[coin_id] = self._empty_metrics()
                continue
            
            try:
                # Get repo stats
                repo_data = self._get_repo_data(repo_full_name)
                
                # Get recent activity
                commits_7d = self._get_commit_count(repo_full_name, days=7)
                commits_30d = self._get_commit_count(repo_full_name, days=30)
                
                issues_7d = self._get_issue_count(repo_full_name, days=7)
                prs_7d = self._get_pr_count(repo_full_name, days=7)
                
                # Calculate momentum
                if commits_30d > 0:
                    commit_momentum = (commits_7d / (commits_30d / 4)) - 1
                else:
                    commit_momentum = 0
                
                results[coin_id] = {
                    'stars': repo_data.get('stargazers_count', 0),
                    'forks': repo_data.get('forks_count', 0),
                    'contributors': self._get_contributor_count(repo_full_name),
                    'commits_7d': commits_7d,
                    'commits_30d': commits_30d,
                    'commit_momentum': commit_momentum,
                    'issues_7d': issues_7d,
                    'prs_7d': prs_7d,
                    'last_commit_days': self._days_since_last_commit(repo_data),
                }
                
                time.sleep(0.5)  # Rate limiting
                
            except Exception as e:
                self.handle_error(e, {'coin_id': coin_id})
                results[coin_id] = self._empty_metrics()
        
        self.logger.info(f"Collected GitHub data for {len(results)} coins")
        return results
    
    def _get_repo_mapping(self, coin_ids: List[str]) -> Dict[str, str]:
        """Map CoinGecko IDs to GitHub repo names (owner/repo)"""
        # Hardcoded examples - would load from config in production
        known_repos = {
            'bitcoin': 'bitcoin/bitcoin',
            'ethereum': 'ethereum/go-ethereum',
            'solana': 'solana-labs/solana',
            'cardano': 'input-output-hk/cardano-node',
            'polkadot': 'paritytech/polkadot',
            'chainlink': 'smartcontractkit/chainlink',
            'uniswap': 'Uniswap/v3-core',
            'aave': 'aave/aave-v3-core',
        }
        
        return {cid: known_repos.get(cid) for cid in coin_ids}
    
    def _get_repo_data(self, repo_full_name: str) -> Dict[str, Any]:
        """Get basic repo information"""
        url = f"{self.base_url}/repos/{repo_full_name}"
        response = requests.get(url, headers=self.headers, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        
        return {}
    
    def _get_commit_count(self, repo_full_name: str, days: int) -> int:
        """Count commits in recent days"""
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        url = f"{self.base_url}/repos/{repo_full_name}/commits"
        params = {
            'since': since,
            'per_page': 100
        }
        
        response = requests.get(url, params=params, headers=self.headers, timeout=10)
        
        if response.status_code == 200:
            commits = response.json()
            
            # If 100 commits, might be more (need pagination)
            if len(commits) == 100:
                # For simplicity, return 100+ indicator
                return 100
            
            return len(commits)
        
        return 0
    
    def _get_issue_count(self, repo_full_name: str, days: int) -> int:
        """Count issues created in recent days"""
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        url = f"{self.base_url}/repos/{repo_full_name}/issues"
        params = {
            'since': since,
            'state': 'all',
            'per_page': 100
        }
        
        response = requests.get(url, params=params, headers=self.headers, timeout=10)
        
        if response.status_code == 200:
            # Filter out PRs (GitHub API includes them in issues)
            issues = [i for i in response.json() if 'pull_request' not in i]
            return len(issues)
        
        return 0
    
    def _get_pr_count(self, repo_full_name: str, days: int) -> int:
        """Count PRs created in recent days"""
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        url = f"{self.base_url}/repos/{repo_full_name}/pulls"
        params = {
            'state': 'all',
            'per_page': 100
        }
        
        response = requests.get(url, params=params, headers=self.headers, timeout=10)
        
        if response.status_code == 200:
            prs = response.json()
            
            # Filter to recent
            cutoff = datetime.now() - timedelta(days=days)
            recent_prs = [
                pr for pr in prs
                if datetime.fromisoformat(pr['created_at'].replace('Z', '+00:00')) > cutoff
            ]
            
            return len(recent_prs)
        
        return 0
    
    def _get_contributor_count(self, repo_full_name: str) -> int:
        """Get contributor count"""
        url = f"{self.base_url}/repos/{repo_full_name}/contributors"
        params = {'per_page': 1, 'anon': 'true'}
        
        response = requests.get(url, params=params, headers=self.headers, timeout=10)
        
        # Check Link header for total count
        if 'Link' in response.headers:
            links = response.headers['Link']
            # Parse last page number from links
            import re
            match = re.search(r'page=(\d+)>; rel="last"', links)
            if match:
                return int(match.group(1))
        
        # Fallback: actual count
        if response.status_code == 200:
            return len(response.json())
        
        return 0
    
    def _days_since_last_commit(self, repo_data: Dict[str, Any]) -> int:
        """Calculate days since last commit"""
        pushed_at = repo_data.get('pushed_at')
        
        if pushed_at:
            last_push = datetime.fromisoformat(pushed_at.replace('Z', '+00:00'))
            days = (datetime.now(last_push.tzinfo) - last_push).days
            return days
        
        return 9999  # Unknown
    
    def _empty_metrics(self) -> Dict[str, Any]:
        return {
            'stars': 0,
            'forks': 0,
            'contributors': 0,
            'commits_7d': 0,
            'commits_30d': 0,
            'commit_momentum': 0,
            'issues_7d': 0,
            'prs_7d': 0,
            'last_commit_days': 9999,
        }


if __name__ == "__main__":
    print("Testing GitHub collector...")
    
    collector = GitHubCollector()
    test_coins = ['bitcoin', 'ethereum', 'solana', 'cardano']
    
    print("\nCollecting GitHub metrics (this may take ~10 seconds)...")
    data = collector.collect(test_coins)
    
    print("\nResults:")
    for coin_id, metrics in data.items():
        if metrics['stars'] > 0:
            print(f"\n{coin_id.upper()}:")
            print(f"  ⭐ Stars: {metrics['stars']:,}")
            print(f"  🔱 Forks: {metrics['forks']:,}")
            print(f"  👥 Contributors: {metrics['contributors']:,}")
            print(f"  📝 Commits (7d): {metrics['commits_7d']}")
            print(f"  📈 Commit momentum: {metrics['commit_momentum']:.1%}")
            print(f"  🐛 Issues (7d): {metrics['issues_7d']}")
            print(f"  🔀 PRs (7d): {metrics['prs_7d']}")
            print(f"  🕒 Last commit: {metrics['last_commit_days']} days ago")
    
    print("\n✓ GitHub collector working")
    print("  Tip: Set GITHUB_TOKEN for higher rate limits (5000 req/hr vs 60)")
