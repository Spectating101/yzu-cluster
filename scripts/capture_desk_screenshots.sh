#!/usr/bin/env bash
# Capture Research Drive screenshots for ChatGPT visual review.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DESK_URL="${YZU_DESK_URL:-http://127.0.0.1:5178}"
if ! curl -sf --max-time 3 "${DESK_URL}/" >/dev/null 2>&1; then
  echo "Desk not reachable at ${DESK_URL}" >&2
  echo "Start Sharpe-Renaissance desk first:" >&2
  echo "  bash drive/scripts/run_yzu_cluster.sh   # or: npm run dev in monorepo" >&2
  exit 1
fi

if [[ ! -d node_modules/@playwright ]]; then
  npm install
  npx playwright install chromium
fi

YZU_DESK_URL="$DESK_URL" node scripts/capture_desk_screenshots.mjs
