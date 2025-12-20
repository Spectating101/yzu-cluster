
import os
from pathlib import Path
from typing import Optional
from pydantic import BaseSettings

class Settings(BaseSettings):
    # System
    APP_NAME: str = "Sharpe-Renaissance"
    MODE: str = "paper" # mock, paper, live
    LOG_LEVEL: str = "INFO"
    
    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent
    DATA_LAKE_DIR: Path = BASE_DIR / "data_lake"
    
    # API Keys
    CEREBRAS_API_KEY: Optional[str] = None
    REFINITIV_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.DATA_LAKE_DIR, exist_ok=True)
os.makedirs(settings.DATA_LAKE_DIR / "market_data", exist_ok=True)
os.makedirs(settings.DATA_LAKE_DIR / "fundamentals", exist_ok=True)
