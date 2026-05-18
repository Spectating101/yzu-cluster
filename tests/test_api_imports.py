from __future__ import annotations

import importlib
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))


def test_api_main_imports_cleanly():
    module = importlib.import_module("api.main")
    assert module.app.title == "FinSight API"


def test_src_main_reexports_api_app():
    src_main = importlib.import_module("src.main")
    api_main = importlib.import_module("api.main")
    assert src_main.app is api_main.app
