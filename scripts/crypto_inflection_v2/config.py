"""API key management and configuration"""

import os
from pathlib import Path
from typing import Dict, Optional
import json


class Config:
    """
    Centralized configuration for all API keys and settings.
    
    Priority order:
    1. Environment variables
    2. Local config file (~/.crypto_inflection/config.json)
    3. Repository config file (ignored by git)
    4. Defaults (empty/None)
    """
    
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            # Check user home directory first
            home_config = Path.home() / ".crypto_inflection" / "config.json"
            
            # Then check repo directory
            repo_config = Path(__file__).parent.parent.parent.parent / "config" / "crypto_inflection.json"
            
            if home_config.exists():
                config_path = str(home_config)
            elif repo_config.exists():
                config_path = str(repo_config)
        
        self.config_path = config_path
        self.config = self._load_config()
    
    def _load_config(self) -> Dict:
        """Load config from file if exists"""
        if self.config_path and Path(self.config_path).exists():
            with open(self.config_path) as f:
                return json.load(f)
        
        return {}
    
    def get(self, key: str, default: any = None) -> any:
        """
        Get config value with priority: env > config file > default
        """
        # Try environment variable first
        env_value = os.getenv(key.upper())
        if env_value:
            return env_value
        
        # Try config file
        if key in self.config:
            return self.config[key]
        
        # Return default
        return default
    
    # API Keys
    @property
    def twitter_bearer_token(self) -> Optional[str]:
        return self.get('twitter_bearer_token')
    
    @property
    def github_token(self) -> Optional[str]:
        return self.get('github_token')
    
    @property
    def etherscan_api_key(self) -> Optional[str]:
        return self.get('etherscan_api_key')
    
    @property
    def dune_api_key(self) -> Optional[str]:
        return self.get('dune_api_key')
    
    @property
    def telegram_bot_token(self) -> Optional[str]:
        return self.get('telegram_bot_token')
    
    @property
    def telegram_chat_id(self) -> Optional[str]:
        return self.get('telegram_chat_id')
    
    # Email settings
    @property
    def email_enabled(self) -> bool:
        return self.get('email_enabled', False)
    
    @property
    def smtp_host(self) -> str:
        return self.get('smtp_host', 'smtp.gmail.com')
    
    @property
    def smtp_port(self) -> int:
        return self.get('smtp_port', 587)
    
    @property
    def email_from(self) -> Optional[str]:
        return self.get('email_from')
    
    @property
    def email_to(self) -> Optional[str]:
        return self.get('email_to')
    
    @property
    def email_password(self) -> Optional[str]:
        return self.get('email_password')
    
    # Tracking settings
    @property
    def default_coin_count(self) -> int:
        return self.get('default_coin_count', 100)
    
    @property
    def alert_threshold(self) -> int:
        return self.get('alert_threshold', 5)
    
    @property
    def dashboard_port(self) -> int:
        return self.get('dashboard_port', 8050)
    
    def create_template(self):
        """Create a template config file"""
        template = {
            "twitter_bearer_token": "",
            "github_token": "",
            "etherscan_api_key": "",
            "dune_api_key": "",
            "telegram_bot_token": "",
            "telegram_chat_id": "",
            "email_enabled": False,
            "email_from": "",
            "email_to": "",
            "email_password": "",
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "default_coin_count": 100,
            "alert_threshold": 5,
            "dashboard_port": 8050,
            "_comment": "API keys can also be set as environment variables (uppercase)"
        }
        
        # Create in user home directory
        config_dir = Path.home() / ".crypto_inflection"
        config_dir.mkdir(exist_ok=True)
        
        config_file = config_dir / "config.json"
        
        if not config_file.exists():
            with open(config_file, 'w') as f:
                json.dump(template, f, indent=2)
            
            print(f"✓ Created config template: {config_file}")
            print("  Edit this file to add your API keys")
        else:
            print(f"⚠️  Config file already exists: {config_file}")
    
    def check_status(self):
        """Check which API keys are configured"""
        print("API Key Status:")
        print()
        
        keys = [
            ('Twitter', self.twitter_bearer_token),
            ('GitHub', self.github_token),
            ('Etherscan', self.etherscan_api_key),
            ('Dune', self.dune_api_key),
            ('Telegram', self.telegram_bot_token),
            ('Email', self.email_from and self.email_password),
        ]
        
        for name, value in keys:
            status = "✅ Configured" if value else "❌ Not configured"
            print(f"  {name:15s}: {status}")
        
        print()
        
        if not any(v for _, v in keys):
            print("⚠️  No API keys configured. System will use fallback/stub implementations.")
            print(f"   Run: python3 {__file__} --create-template")
            print()


# Singleton instance
_config = None

def get_config() -> Config:
    """Get singleton config instance"""
    global _config
    if _config is None:
        _config = Config()
    return _config


if __name__ == "__main__":
    import sys
    
    if '--create-template' in sys.argv:
        config = Config()
        config.create_template()
    else:
        print("Crypto Inflection Tracker - Configuration")
        print()
        
        config = get_config()
        config.check_status()
        
        print("To create a config file template:")
        print(f"  python3 {__file__} --create-template")
        print()
        print("Or set environment variables:")
        print("  export TWITTER_BEARER_TOKEN='your_token_here'")
        print("  export GITHUB_TOKEN='your_token_here'")
        print("  export ETHERSCAN_API_KEY='your_key_here'")
