#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

exec python3 scripts/merge_coingecko_history_shards.py \
  --main-db data_lake/coingecko_archive/coingecko_full_active_2009.sqlite3 \
  --shard-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_00.sqlite3 \
  --shard-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_01.sqlite3 \
  --shard-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_02.sqlite3 \
  --shard-db data_lake/coingecko_archive/shards/db/coingecko_history_shard_03.sqlite3
