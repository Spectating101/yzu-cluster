#!/usr/bin/env python3
"""
CLI wrapper for the Refinitiv feature store utilities.

Usage examples:
  python scripts/refinitiv_feature_store.py --source From-refinitiv --out data_lake/feature_store
  python scripts/refinitiv_feature_store.py --no-parquet --no-graph
"""
from pathlib import Path
import sys

# Ensure local imports work when run from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_tools.feature_store import main  # noqa: E402


if __name__ == "__main__":
    main()
