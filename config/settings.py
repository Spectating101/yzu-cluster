import os
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


REPO_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = REPO_ROOT.parent


def _load_env_files() -> None:
    env_files = [
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        WORKSPACE_ROOT / ".env.local",
        WORKSPACE_ROOT / ".env",
    ]
    if load_dotenv is not None:
        for env_file in env_files:
            if env_file.is_file():
                load_dotenv(env_file, override=False)
        return

    for env_file in env_files:
        if not env_file.is_file():
            continue
        for raw in env_file.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_files()


class Settings:
    def __init__(self) -> None:
        self.APP_NAME: str = os.getenv("APP_NAME", "Sharpe-Renaissance")
        self.MODE: str = os.getenv("MODE", "paper")
        self.LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

        self.BASE_DIR: Path = REPO_ROOT
        self.DATA_LAKE_DIR: Path = self.BASE_DIR / "data_lake"

        self.CEREBRAS_API_KEY: Optional[str] = os.getenv("CEREBRAS_API_KEY") or None
        self.REFINITIV_KEY: Optional[str] = os.getenv("REFINITIV_KEY") or None


settings = Settings()

# Ensure directories exist
os.makedirs(settings.DATA_LAKE_DIR, exist_ok=True)
os.makedirs(settings.DATA_LAKE_DIR / "market_data", exist_ok=True)
os.makedirs(settings.DATA_LAKE_DIR / "fundamentals", exist_ok=True)
