#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${COINGECKO_CANONICAL_EXPORTS_DIR:-$ROOT/data_lake/crypto_pipeline/exports}"
SOURCE_BASE="${COINGECKO_BACKUP_SOURCE:-spectator@100.96.62.97:/home/spectator/Sharpe-Renaissance-coingecko-failover/data_lake/crypto_pipeline/exports}"
RETRIES="${COINGECKO_SYNC_PULL_RETRIES:-3}"
RETRY_DELAY_SEC="${COINGECKO_SYNC_PULL_RETRY_DELAY_SEC:-20}"
TIMEOUT_SEC="${COINGECKO_SYNC_PULL_TIMEOUT_SEC:-300}"
SSH_COMMAND="${COINGECKO_SYNC_PULL_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=10}"
PULL_METHOD="${COINGECKO_SYNC_PULL_METHOD:-auto}"
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/coingecko_panel_pull_sync.lock"

mkdir -p "$DEST_DIR"

if [[ "${SOURCE_BASE}" != */ ]]; then
  SOURCE_BASE="${SOURCE_BASE}/"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[skip] pull-sync lock is already held on this machine"
  exit 0
fi

files=(
  "price_panel_clean.csv"
  "mcap_panel_wide.csv"
  "volume_panel_wide.csv"
)

sources=()
for file in "${files[@]}"; do
  sources+=("${SOURCE_BASE}${file}")
done

source_host="${SOURCE_BASE%%:*}"
source_path="${SOURCE_BASE#*:}"
if [[ "${PULL_METHOD}" == "auto" ]]; then
  if [[ "${source_path}" =~ ^[A-Za-z]:/ ]]; then
    PULL_METHOD="scp"
  else
    PULL_METHOD="rsync"
  fi
fi

if [[ "${PULL_METHOD}" == "rsync" ]] && ! command -v rsync >/dev/null 2>&1; then
  echo "[error] rsync is required for panel pull-sync method=rsync" >&2
  exit 1
fi

if [[ "${PULL_METHOD}" == "scp" ]] && ! command -v scp >/dev/null 2>&1; then
  echo "[error] scp is required for panel pull-sync method=scp" >&2
  exit 1
fi

attempt=1
while [[ "$attempt" -le "$RETRIES" ]]; do
  echo "[pull] attempt ${attempt}/${RETRIES} method=${PULL_METHOD} from ${SOURCE_BASE}"
  if [[ "${PULL_METHOD}" == "rsync" ]]; then
    if timeout "$TIMEOUT_SEC" rsync -az --partial --inplace --no-owner --no-group \
      --human-readable -e "$SSH_COMMAND" "${sources[@]}" "$DEST_DIR/"; then
      echo "[pull] canonical panel pull-sync completed"
      exit 0
    fi
  else
    scp_sources=()
    for file in "${files[@]}"; do
      scp_sources+=("${source_host}:${source_path}/${file}")
    done
    if timeout "$TIMEOUT_SEC" scp -q "${scp_sources[@]}" "$DEST_DIR/"; then
      echo "[pull] canonical panel pull-sync completed"
      exit 0
    fi
  fi

  rc=$?
  if [[ "$attempt" -lt "$RETRIES" ]]; then
    echo "[pull] attempt ${attempt} failed (rc=${rc}); retrying in ${RETRY_DELAY_SEC}s" >&2
    sleep "$RETRY_DELAY_SEC"
  fi
  attempt=$((attempt + 1))
done

echo "[error] canonical panel pull-sync failed after ${RETRIES} attempts" >&2
exit "${rc:-1}"
