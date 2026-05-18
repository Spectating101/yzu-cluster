#!/usr/bin/env bash
set -euo pipefail

# Starts local Nocturnal archive backend (cite-agent-api) on :8000
# and Cite-Agent API server on :8001, sourcing keys from ../Cite-Agent/.env.local.
#
# This script does NOT print secret values.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CA_REPO="${ROOT}/../Cite-Agent"
CA_ENV="${CA_REPO}/.env.local"
CA_API_REPO="${CA_REPO}/cite-agent-api"

LOG_DIR="${ROOT}/Sharpe-Renaissance/logs"
mkdir -p "${LOG_DIR}"

if [[ ! -f "${CA_ENV}" ]]; then
  echo "Missing env file: ${CA_ENV}" >&2
  exit 2
fi

echo "[1/4] Loading env from ${CA_ENV}"
set -a
# shellcheck disable=SC1090
source "${CA_ENV}"
set +a

# Ensure ARCHIVE_* is available to the Cite-Agent API server endpoints.
export ARCHIVE_API_KEY="${ARCHIVE_API_KEY:-${NOCTURNAL_KEY:-}}"
export ARCHIVE_API_URL="${ARCHIVE_API_URL:-${NOCTURNAL_API_URL:-}}"

echo "[2/4] Stopping existing listeners (if any)"
if command -v lsof >/dev/null 2>&1; then
  for port in 8000 8001; do
    pids="$(lsof -ti :"${port}" -sTCP:LISTEN || true)"
    if [[ -n "${pids}" ]]; then
      echo " - killing pids on :${port}: ${pids}"
      kill ${pids} || true
    fi
  done
fi

echo "[3/4] Starting archive backend (cite-agent-api) on :8000"
(
  cd "${CA_API_REPO}"
  PORT=8000 nohup python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000 \
    > "${LOG_DIR}/cite-agent-api_8000.log" 2>&1 &
)

echo "[4/4] Starting Cite-Agent API server on :8001"
(
  cd "${CA_REPO}"
  PORT=8001 nohup python3 -m uvicorn cite_agent.api_server:app --host 0.0.0.0 --port 8001 \
    > "${LOG_DIR}/cite-agent_8001.log" 2>&1 &
)

echo "Started. Logs:"
echo " - ${LOG_DIR}/cite-agent-api_8000.log"
echo " - ${LOG_DIR}/cite-agent_8001.log"

