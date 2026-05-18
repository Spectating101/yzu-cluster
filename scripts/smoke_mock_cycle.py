#!/usr/bin/env python3
"""
Quick mock smoke test for Sharpe-Renaissance.

Runs a single mock daily cycle without external data/keys and exits non-zero
if any step raises. Intended for CI/dev sanity checks.
"""

import asyncio
import os
import logging
from pathlib import Path
import sys


def main() -> int:
    # Force mock mode to avoid hard exits on missing data/keys.
    os.environ.setdefault("MODE", "mock")

    # Ensure imports resolve relative to repo root.
    base_dir = Path(__file__).resolve().parent.parent
    os.chdir(base_dir)
    if str(base_dir) not in sys.path:
        sys.path.insert(0, str(base_dir))

    try:
        from main import SharpeSystem  # noqa: WPS433
    except Exception as exc:  # pragma: no cover - defensive guard
        logging.error("Failed to import SharpeSystem: %s", exc)
        return 1

    async def _run() -> int:
        system = SharpeSystem()
        try:
            await system.run_daily_cycle()
            return 0
        except Exception as exc:  # pragma: no cover - defensive guard
            logging.error("Smoke cycle failed: %s", exc)
            return 1

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
