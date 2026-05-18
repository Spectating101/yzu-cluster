"""Alerting system for high-score detections"""

import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent))
from config import get_config


class AlertManager:
    """Send alerts via email and/or Telegram"""
    
    def __init__(self):
        self.config = get_config()
    
    def send_alert(self, coins: List[Dict], regime: Dict = None):
        """
        Send alert for high-score coins.
        
        Args:
            coins: List of coin dicts with score, verdict, signals
            regime: Optional regime info
        """
        if not coins:
            return
        
        # Build message
        message = self._build_message(coins, regime)
        
        # Send via configured channels
        sent_methods = []
        
        if self.config.telegram_bot_token:
            if self._send_telegram(message):
                sent_methods.append('Telegram')
        
        if self.config.email_enabled:
            if self._send_email(message):
                sent_methods.append('Email')
        
        if sent_methods:
            print(f"✓ Alert sent via {', '.join(sent_methods)}")
        else:
            print("⚠️  No alert channels configured")
            print("   Set TELEGRAM_BOT_TOKEN or configure email in config")
    
    def _build_message(self, coins: List[Dict], regime: Dict = None) -> str:
        """Build alert message"""
        lines = ["🔥 CRYPTO INFLECTION ALERT 🔥", ""]
        
        if regime:
            lines.append(f"Market Regime: {regime.get('regime', 'UNKNOWN')} ({regime.get('confidence', 0):.0%} confidence)")
            lines.append("")
        
        lines.append(f"Detected {len(coins)} high-score inflections:")
        lines.append("")
        
        for coin in coins[:10]:  # Top 10
            name = coin['name'][:20]
            score = coin['score']
            verdict = coin['verdict']
            price = coin['price_usd']
            
            # Get fired signals
            signal_names = ['price_breakout', 'volume_surge', 'accelerating', 
                           'mcap_surge', 'beats_btc', 'vol_spike', 'uptrend', 'accumulation']
            fired = [s.replace('_', ' ').title() for s in signal_names if coin.get(s, 0) > 0.5]
            
            lines.append(f"{verdict}")
            lines.append(f"  {name} - ${price:,.2f}")
            lines.append(f"  Score: {score:.0f}/8")
            if fired:
                lines.append(f"  Signals: {', '.join(fired[:3])}")
            lines.append("")
        
        lines.append("Expected Performance:")
        lines.append("  Score 5+: ~+25% (7 days)")
        lines.append("  Score 4:  ~+16% (7 days)")
        lines.append("  Score 3:  ~+19% (7 days)")
        
        return "\n".join(lines)
    
    def _send_telegram(self, message: str) -> bool:
        """Send via Telegram"""
        try:
            token = self.config.telegram_bot_token
            chat_id = self.config.telegram_chat_id
            
            if not token or not chat_id:
                return False
            
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = {
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML'
            }
            
            response = requests.post(url, data=data, timeout=10)
            return response.status_code == 200
            
        except Exception as e:
            print(f"  ❌ Telegram error: {e}")
            return False
    
    def _send_email(self, message: str) -> bool:
        """Send via email"""
        try:
            if not (self.config.email_from and self.config.email_to and self.config.email_password):
                return False
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.config.email_from
            msg['To'] = self.config.email_to
            msg['Subject'] = '🔥 Crypto Inflection Alert'
            
            msg.attach(MIMEText(message, 'plain'))
            
            # Send via SMTP
            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
                server.starttls()
                server.login(self.config.email_from, self.config.email_password)
                server.send_message(msg)
            
            return True
            
        except Exception as e:
            print(f"  ❌ Email error: {e}")
            return False


if __name__ == "__main__":
    print("Testing alert system...")
    print()
    
    # Test data
    test_coins = [
        {
            'name': 'MemeCore',
            'score': 5,
            'verdict': '🔥🔥 VERY STRONG',
            'price_usd': 1.90,
            'price_breakout': 1,
            'volume_surge': 1,
            'accelerating': 1,
            'vol_spike': 1,
            'uptrend': 1,
        },
        {
            'name': 'Zcash',
            'score': 4,
            'verdict': '🔥 STRONG',
            'price_usd': 249.08,
            'volume_surge': 1,
            'accelerating': 1,
            'vol_spike': 1,
            'accumulation': 1,
        }
    ]
    
    test_regime = {
        'regime': 'RANGE',
        'confidence': 0.9,
    }
    
    alerter = AlertManager()
    
    # Build message (won't send without API keys)
    message = alerter._build_message(test_coins, test_regime)
    
    print("Alert message preview:")
    print("=" * 80)
    print(message)
    print("=" * 80)
    print()
    
    # Check config
    config = get_config()
    config.check_status()
    
    print("\nTo enable alerts:")
    print("  1. Telegram: Get bot token from @BotFather, set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID")
    print("  2. Email: Set email credentials in config file")
