#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p logs

exec env PYTHONUNBUFFERED=1 /usr/bin/python3 scripts/coingecko_panel_update.py \
  --mode daily \
  --use-public-api
