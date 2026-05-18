#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

exec python3 scripts/coingecko_archive_status.py \
  --db-path data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3 \
  --extra-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_00.sqlite3 \
  --extra-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_01.sqlite3 \
  --extra-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_02.sqlite3 \
  --extra-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_03.sqlite3 \
  --coins-total-override 17596 \
  --history-from 2009-01-01T00:00:00+00:00 \
  --history-to now \
  --history-chunk-days 365
