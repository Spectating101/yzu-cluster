#!/usr/bin/env bash
set -euo pipefail

# Runs the daily Reddit ingestion pipeline (raw + sqlite + panel) from anywhere.
# Logs to stdout/stderr (capture via systemd journal or cron redirection).

SR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "${SR_DIR}/.." && pwd)"

python3 "${ROOT_DIR}/Sharpe-Renaissance/scripts/reddit_ingest_daily.py" \
  --subreddits wallstreetbets stocks investing options CryptoCurrency \
  --fetch-modes new hot top:day top:week \
  --max-pages 10 \
  --sleep-secs 1.2 \
  --comments-max-posts 75 \
  --comments-lookback-hours 48 \
  --stop-after-known 40

