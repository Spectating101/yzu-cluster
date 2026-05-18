"""Validation monitor - tracks forward returns and signal effectiveness"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import sys

sys.path.append(str(Path(__file__).parent))
from storage import SQLiteStorage
from collectors.coingecko_collector import CoinGeckoCollector


class ValidationMonitor:
    """
    Monitors signal effectiveness by tracking forward returns.
    
    Workflow:
    1. Daily tracker saves snapshot
    2. After N days, validation monitor calculates actual returns
    3. Compares predicted vs actual performance
    4. Analyzes signal effectiveness
    """
    
    def __init__(self):
        self.storage = SQLiteStorage()
        self.collector = CoinGeckoCollector()
    
    def calculate_forward_returns(self, snapshot_date: datetime, forward_days: int = 7) -> pd.DataFrame:
        """
        Calculate forward returns for a historical snapshot.
        
        Returns DataFrame with snapshot data + actual returns.
        """
        print(f"📊 Calculating {forward_days}-day returns for {snapshot_date.strftime('%Y-%m-%d')}...")
        
        # Load historical snapshot
        snapshot_df = self.storage.read_snapshot(snapshot_date)
        
        if snapshot_df.empty:
            print(f"  ⚠️  No snapshot found for {snapshot_date.strftime('%Y-%m-%d')}")
            return pd.DataFrame()
        
        print(f"  Loaded snapshot: {len(snapshot_df)} coins")
        
        # Get current prices (N days later)
        target_date = snapshot_date + timedelta(days=forward_days)
        coin_ids = snapshot_df['coin_id'].tolist()
        
        current_data = self.collector.collect(coin_ids, date=target_date)
        
        # Calculate returns
        returns = []
        
        for _, row in snapshot_df.iterrows():
            coin_id = row['coin_id']
            old_price = row['price_usd']
            
            if coin_id in current_data and old_price > 0:
                new_price = current_data[coin_id]['price_usd']
                return_pct = ((new_price / old_price) - 1) * 100
                
                # Record to database
                self.storage.record_forward_return(
                    snapshot_date, coin_id, forward_days, return_pct
                )
                
                returns.append({
                    'coin_id': coin_id,
                    'score': row['score'],
                    'old_price': old_price,
                    'new_price': new_price,
                    'return_pct': return_pct,
                })
        
        returns_df = pd.DataFrame(returns)
        
        print(f"✓ Calculated {len(returns_df)} forward returns")
        
        return returns_df
    
    def analyze_signal_effectiveness(self, days_forward: int = 7, min_samples: int = 10) -> pd.DataFrame:
        """
        Analyze which signals are most predictive.
        
        Returns DataFrame with signal stats.
        """
        print(f"📊 Analyzing signal effectiveness ({days_forward}-day forward returns)...")
        print()
        
        # Get all validation data
        validation_df = self.storage.get_validation_data(days_forward=days_forward, min_score=0)
        
        if len(validation_df) < min_samples:
            print(f"  ⚠️  Not enough validation samples ({len(validation_df)} < {min_samples})")
            return pd.DataFrame()
        
        print(f"  Total samples: {len(validation_df)}")
        print()
        
        # Analyze by score bucket
        score_analysis = []
        
        for score in [5, 4, 3, 2, 1, 0]:
            score_df = validation_df[validation_df['score'] >= score] if score > 0 else validation_df[validation_df['score'] == 0]
            
            if len(score_df) == 0:
                continue
            
            avg_return = score_df['return_pct'].mean()
            median_return = score_df['return_pct'].median()
            std_return = score_df['return_pct'].std()
            win_rate = (score_df['return_pct'] > 0).mean()
            
            score_analysis.append({
                'score_bucket': f"{score}+" if score > 0 else "0",
                'count': len(score_df),
                'avg_return': avg_return,
                'median_return': median_return,
                'std_return': std_return,
                'win_rate': win_rate,
                'sharpe': avg_return / std_return if std_return > 0 else 0,
            })
        
        analysis_df = pd.DataFrame(score_analysis)
        
        # Print results
        print("Performance by Score:")
        print()
        print(analysis_df.to_string(index=False))
        print()
        
        return analysis_df
    
    def generate_validation_report(self, days_forward: int = 7) -> str:
        """
        Generate comprehensive validation report.
        
        Returns markdown-formatted report.
        """
        validation_df = self.storage.get_validation_data(days_forward=days_forward, min_score=0)
        
        if validation_df.empty:
            return "⚠️ No validation data available yet. Run daily tracker for at least 7 days."
        
        lines = [
            f"# Validation Report - {days_forward}-Day Forward Returns",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            f"## Summary",
            f"- Total snapshots: {validation_df['date'].nunique()}",
            f"- Total coin observations: {len(validation_df)}",
            f"- Date range: {validation_df['date'].min()} to {validation_df['date'].max()}",
            "",
        ]
        
        # Performance by score
        lines.append("## Performance by Score")
        lines.append("")
        
        for score in [5, 4, 3, 2, 1, 0]:
            if score > 0:
                score_df = validation_df[validation_df['score'] >= score]
                label = f"Score {score}+"
            else:
                score_df = validation_df[validation_df['score'] == 0]
                label = "Score 0"
            
            if len(score_df) > 0:
                avg_ret = score_df['return_pct'].mean()
                med_ret = score_df['return_pct'].median()
                win_rate = (score_df['return_pct'] > 0).mean()
                
                lines.append(f"### {label}")
                lines.append(f"- Count: {len(score_df)}")
                lines.append(f"- Avg return: {avg_ret:+.2f}%")
                lines.append(f"- Median return: {med_ret:+.2f}%")
                lines.append(f"- Win rate: {win_rate:.1%}")
                lines.append("")
        
        # Best performers
        top_performers = validation_df.nlargest(10, 'return_pct')
        
        lines.append("## Top 10 Performers")
        lines.append("")
        
        for _, row in top_performers.iterrows():
            lines.append(f"- **{row['coin_id']}** (Score {row['score']:.0f}): {row['return_pct']:+.2f}%")
        
        lines.append("")
        
        # Worst performers
        worst_performers = validation_df.nsmallest(10, 'return_pct')
        
        lines.append("## Bottom 10 Performers")
        lines.append("")
        
        for _, row in worst_performers.iterrows():
            lines.append(f"- **{row['coin_id']}** (Score {row['score']:.0f}): {row['return_pct']:+.2f}%")
        
        return "\n".join(lines)
    
    def _send_telegram(self, message: str) -> bool:
        """Send message via Telegram"""
        try:
            token = self.config.telegram_bot_token
            chat_id = self.config.telegram_chat_id
            
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = {
                'chat_id': chat_id,
                'text': message,
            }
            
            response = requests.post(url, data=data, timeout=10)
            return response.status_code == 200
            
        except Exception as e:
            print(f"  ❌ Telegram error: {e}")
            return False
    
    def _send_email(self, message: str) -> bool:
        """Send message via email"""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.config.email_from
            msg['To'] = self.config.email_to
            msg['Subject'] = '🔥 Crypto Inflection Alert'
            
            msg.attach(MIMEText(message, 'plain'))
            
            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
                server.starttls()
                server.login(self.config.email_from, self.config.email_password)
                server.send_message(msg)
            
            return True
            
        except Exception as e:
            print(f"  ❌ Email error: {e}")
            return False


class ValidationRunner:
    """Automated validation workflow"""
    
    def __init__(self):
        self.monitor = ValidationMonitor()
    
    def run_validation_cycle(self, days_ago: List[int] = [7, 14, 30]):
        """
        Run validation for multiple time periods.
        
        This should be run daily to update forward returns.
        """
        print("🔄 Running validation cycle...")
        print()
        
        for days in days_ago:
            snapshot_date = datetime.now() - timedelta(days=days)
            
            print(f"Validating {days}-day returns for {snapshot_date.strftime('%Y-%m-%d')}...")
            
            returns_df = self.monitor.calculate_forward_returns(snapshot_date, forward_days=days)
            
            if not returns_df.empty:
                # Quick summary
                score_3plus = returns_df[returns_df['score'] >= 3]
                
                if len(score_3plus) > 0:
                    avg_return = score_3plus['return_pct'].mean()
                    print(f"  Score 3+ avg return: {avg_return:+.2f}%")
            
            print()
    
    def generate_weekly_report(self) -> str:
        """Generate weekly validation report"""
        print("📈 Generating weekly validation report...")
        
        report = self.monitor.generate_validation_report(days_forward=7)
        
        # Save to file
        report_dir = Path(__file__).parent.parent.parent / "data_lake/crypto_inflection/reports"
        report_dir.mkdir(parents=True, exist_ok=True)
        
        report_path = report_dir / f"validation_report_{datetime.now().strftime('%Y%m%d')}.md"
        
        with open(report_path, 'w') as f:
            f.write(report)
        
        print(f"✓ Report saved: {report_path}")
        
        return report


if __name__ == "__main__":
    import sys
    
    if '--report' in sys.argv:
        # Generate validation report
        runner = ValidationRunner()
        report = runner.generate_weekly_report()
        print("\n" + "=" * 80)
        print(report)
    
    elif '--cycle' in sys.argv:
        # Run validation cycle
        runner = ValidationRunner()
        runner.run_validation_cycle(days_ago=[7, 14, 30])
    
    else:
        print("Validation Monitor")
        print()
        print("Usage:")
        print("  --report   Generate validation report")
        print("  --cycle    Run validation cycle (calculate forward returns)")
        print()
        print("Recommended workflow:")
        print("  1. Run daily tracker daily")
        print("  2. Run validation cycle daily (updates forward returns)")
        print("  3. Generate report weekly")
