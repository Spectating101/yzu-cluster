import os
import sys
from pathlib import Path

# Ensure project root is on sys.path for tests
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Default to mock mode for tests to avoid external dependencies
os.environ.setdefault("MODE", "mock")
