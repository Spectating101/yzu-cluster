"""
Base classes for inflection tracker components
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataCollector(ABC):
    """
    Abstract base class for data collectors.
    Each collector fetches data from a specific source (CoinGecko, Etherscan, etc)
    """
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    def collect(self, coin_ids: List[str], date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Collect data for specified coins.
        
        Args:
            coin_ids: List of coin identifiers (e.g., ['bitcoin', 'ethereum'])
            date: Optional date for historical data (defaults to now)
            
        Returns:
            Dictionary mapping coin_id -> metrics
        """
        pass
    
    def handle_error(self, coin_id: str, error: Exception) -> None:
        """Log error and continue gracefully"""
        self.logger.warning(f"Error collecting {coin_id}: {error}")


class SignalCalculator(ABC):
    """
    Abstract base class for signal calculators.
    Each calculator computes signals from raw data.
    """
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    def calculate(self, data: Dict[str, Any]) -> Dict[str, float]:
        """
        Calculate signals from raw data.
        
        Args:
            data: Raw metrics for a single coin
            
        Returns:
            Dictionary of signal_name -> value (typically 0 or 1)
        """
        pass


class DataStorage(ABC):
    """
    Abstract base class for data storage.
    Handles writing and reading time-series data.
    """
    
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.logger = logging.getLogger(f"{__name__}.storage")
    
    @abstractmethod
    def write_snapshot(self, date: datetime, data: Dict[str, Any]) -> None:
        """Write daily snapshot"""
        pass
    
    @abstractmethod
    def read_snapshot(self, date: datetime) -> Dict[str, Any]:
        """Read daily snapshot"""
        pass
    
    @abstractmethod
    def get_history(self, coin_id: str, days: int = 90) -> List[Dict[str, Any]]:
        """Get historical data for a coin"""
        pass
