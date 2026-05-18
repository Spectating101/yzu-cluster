"""Time-series storage for inflection tracking"""

import sqlite3
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
import sys

sys.path.append(str(Path(__file__).parent.parent))
from base import DataStorage


class SQLiteStorage(DataStorage):
    """SQLite-based time-series storage"""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to data_lake
            base = Path(__file__).parent.parent.parent.parent
            db_path = base / "data_lake/crypto_inflection/inflection_timeseries.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
        
        super().__init__(str(db_path))
        self.db_path = Path(db_path)
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema"""
        with sqlite3.connect(self.db_path) as conn:
            # Snapshots table - daily aggregated metrics
            conn.execute("""
                CREATE TABLE IF NOT EXISTS snapshots (
                    date TEXT NOT NULL,
                    coin_id TEXT NOT NULL,
                    name TEXT,
                    price_usd REAL,
                    volume_usd REAL,
                    market_cap_usd REAL,
                    signals TEXT,  -- JSON of signal values
                    score REAL,
                    verdict TEXT,
                    PRIMARY KEY (date, coin_id)
                )
            """)
            
            # Signal history - individual signal values over time
            conn.execute("""
                CREATE TABLE IF NOT EXISTS signal_history (
                    date TEXT NOT NULL,
                    coin_id TEXT NOT NULL,
                    signal_name TEXT NOT NULL,
                    signal_value REAL NOT NULL,
                    PRIMARY KEY (date, coin_id, signal_name)
                )
            """)
            
            # Forward returns - for validation
            conn.execute("""
                CREATE TABLE IF NOT EXISTS forward_returns (
                    snapshot_date TEXT NOT NULL,
                    coin_id TEXT NOT NULL,
                    days_forward INTEGER NOT NULL,
                    return_pct REAL,
                    PRIMARY KEY (snapshot_date, coin_id, days_forward)
                )
            """)
            
            conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_score ON snapshots(score)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_signal_history_coin ON signal_history(coin_id, date)")
            conn.commit()
    
    def write_snapshot(self, date: datetime, data: List[Dict[str, Any]]):
        """Write daily snapshot to database"""
        date_str = date.strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            for row in data:
                # Extract signals
                signal_names = ['price_breakout', 'volume_surge', 'accelerating', 
                               'mcap_surge', 'beats_btc', 'vol_spike', 'uptrend', 'accumulation']
                signals = {k: row.get(k, 0) for k in signal_names}
                
                # Write to snapshots
                conn.execute("""
                    INSERT OR REPLACE INTO snapshots 
                    (date, coin_id, name, price_usd, volume_usd, market_cap_usd, signals, score, verdict)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    date_str,
                    row['coin_id'],
                    row.get('name', ''),
                    row.get('price_usd', 0),
                    row.get('volume_usd', 0),
                    row.get('market_cap_usd', 0),
                    json.dumps(signals),
                    row.get('score', 0),
                    row.get('verdict', '')
                ))
                
                # Write individual signals to history
                for signal_name, signal_value in signals.items():
                    conn.execute("""
                        INSERT OR REPLACE INTO signal_history
                        (date, coin_id, signal_name, signal_value)
                        VALUES (?, ?, ?, ?)
                    """, (date_str, row['coin_id'], signal_name, signal_value))
            
            conn.commit()
        
        self.logger.info(f"Wrote {len(data)} rows to snapshot for {date_str}")
    
    def read_snapshot(self, date: datetime) -> pd.DataFrame:
        """Read snapshot for a specific date"""
        date_str = date.strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query(
                "SELECT * FROM snapshots WHERE date = ? ORDER BY score DESC",
                conn,
                params=(date_str,)
            )
        
        # Expand signals JSON
        if not df.empty and 'signals' in df.columns:
            signals_df = pd.json_normalize(df['signals'].apply(json.loads))
            df = pd.concat([df.drop('signals', axis=1), signals_df], axis=1)
        
        return df
    
    def get_history(self, coin_id: str, days: int = 30) -> pd.DataFrame:
        """Get historical snapshots for a coin"""
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query("""
                SELECT date, price_usd, volume_usd, market_cap_usd, score, verdict
                FROM snapshots
                WHERE coin_id = ?
                ORDER BY date DESC
                LIMIT ?
            """, conn, params=(coin_id, days))
        
        return df
    
    def get_signal_timeseries(self, coin_id: str, signal_name: str, days: int = 90) -> pd.DataFrame:
        """Get time series of a specific signal for a coin"""
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query("""
                SELECT date, signal_value
                FROM signal_history
                WHERE coin_id = ? AND signal_name = ?
                ORDER BY date DESC
                LIMIT ?
            """, conn, params=(coin_id, signal_name, days))
        
        return df
    
    def get_top_movers(self, date: datetime, min_score: float = 3.0, limit: int = 20) -> pd.DataFrame:
        """Get top scoring coins for a date"""
        date_str = date.strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query("""
                SELECT coin_id, name, price_usd, score, verdict
                FROM snapshots
                WHERE date = ? AND score >= ?
                ORDER BY score DESC
                LIMIT ?
            """, conn, params=(date_str, min_score, limit))
        
        return df
    
    def record_forward_return(self, snapshot_date: datetime, coin_id: str, 
                             days_forward: int, return_pct: float):
        """Record actual forward return for validation"""
        date_str = snapshot_date.strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO forward_returns
                (snapshot_date, coin_id, days_forward, return_pct)
                VALUES (?, ?, ?, ?)
            """, (date_str, coin_id, days_forward, return_pct))
            conn.commit()
    
    def get_validation_data(self, days_forward: int = 7, min_score: float = 3.0) -> pd.DataFrame:
        """Get snapshot + forward return data for validation"""
        with sqlite3.connect(self.db_path) as conn:
            df = pd.read_sql_query("""
                SELECT 
                    s.date,
                    s.coin_id,
                    s.score,
                    s.verdict,
                    f.return_pct
                FROM snapshots s
                JOIN forward_returns f ON s.date = f.snapshot_date 
                    AND s.coin_id = f.coin_id
                    AND f.days_forward = ?
                WHERE s.score >= ?
                ORDER BY s.date DESC, s.score DESC
            """, conn, params=(days_forward, min_score))
        
        return df


if __name__ == "__main__":
    # Test storage
    print("Testing SQLite storage...")
    
    storage = SQLiteStorage()
    
    # Write test snapshot
    test_data = [
        {
            'coin_id': 'bitcoin',
            'name': 'Bitcoin',
            'price_usd': 50000,
            'volume_usd': 1e9,
            'market_cap_usd': 1e12,
            'price_breakout': 1,
            'volume_surge': 0,
            'accelerating': 1,
            'mcap_surge': 0,
            'beats_btc': 0,
            'vol_spike': 1,
            'uptrend': 1,
            'accumulation': 0,
            'score': 4,
            'verdict': '🔥 STRONG'
        },
        {
            'coin_id': 'ethereum',
            'name': 'Ethereum',
            'price_usd': 3000,
            'volume_usd': 5e8,
            'market_cap_usd': 4e11,
            'price_breakout': 0,
            'volume_surge': 1,
            'accelerating': 0,
            'mcap_surge': 0,
            'beats_btc': 1,
            'vol_spike': 0,
            'uptrend': 0,
            'accumulation': 1,
            'score': 3,
            'verdict': '📈 BULLISH'
        }
    ]
    
    test_date = datetime.now()
    storage.write_snapshot(test_date, test_data)
    
    # Read it back
    df = storage.read_snapshot(test_date)
    print(f"\n✓ Wrote and read {len(df)} rows")
    print(df[['coin_id', 'score', 'verdict']].to_string(index=False))
    
    # Get history
    hist = storage.get_history('bitcoin', days=10)
    print(f"\n✓ Bitcoin history: {len(hist)} snapshots")
    
    # Get top movers
    top = storage.get_top_movers(test_date, min_score=3.0)
    print(f"\n✓ Top movers (score >= 3): {len(top)} coins")
    print(top.to_string(index=False))
    
    print(f"\n✓ Database created at: {storage.db_path}")
