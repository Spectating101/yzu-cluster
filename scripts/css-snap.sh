#!/usr/bin/env bash
# Build, serve the production bundle, and record a css-snapshot into $1.
set -euo pipefail
out=$(realpath -m "$1")
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
rm -rf "$out"
npx vite build >/dev/null
port=5188
npx vite preview --port "$port" --strictPort >/dev/null 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null' EXIT
for _ in $(seq 60); do curl -sf -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.5; done
mkdir -p .tmp-pw
CSS_SNAP_DIR="$out" YZU_DESK_URL="http://127.0.0.1:$port" TMPDIR="$PWD/.tmp-pw" npx playwright test e2e/css-snapshot.spec.js --reporter=line >/dev/null || true
find "$out" -name '*.json' | wc -l
