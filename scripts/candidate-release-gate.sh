#!/usr/bin/env bash
# Build into disposable storage, serve the candidate read-only against the live
# API, and exercise states that production data cannot reliably manufacture.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

gate_tmp="$(mktemp -d "${TMPDIR:-/tmp}/research-drive-candidate-gate.XXXXXX")"
build_dir="${gate_tmp}/build"
server_log="${gate_tmp}/candidate-server.log"
server_pid=""

cleanup() {
  if [[ -n "${server_pid}" ]] && kill -0 "${server_pid}" 2>/dev/null; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  rm -rf -- "${gate_tmp}"
}
trap cleanup EXIT INT TERM

candidate_port="${CANDIDATE_PORT:-}"
if [[ -z "${candidate_port}" ]]; then
  candidate_port="$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
)"
fi
candidate_url="http://127.0.0.1:${candidate_port}"

echo "candidate-release: building outside dist"
npm run build -- --outDir "${build_dir}" --emptyOutDir

python3 scripts/serve_candidate.py \
  --port "${candidate_port}" \
  --dir "${build_dir}" \
  >"${server_log}" 2>&1 &
server_pid="$!"

ready=0
for _ in $(seq 1 80); do
  if curl -fsS "${candidate_url}/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ "${ready}" != "1" ]]; then
  echo "candidate-release: candidate server did not become ready" >&2
  sed -n '1,160p' "${server_log}" >&2
  exit 1
fi

echo "candidate-release: browser contract at ${candidate_url}"
YZU_DESK_URL="${candidate_url}" npx playwright test \
  e2e/app-mounts.spec.js \
  e2e/history-lifecycle-states.spec.js \
  e2e/history-reconciliation-truth.spec.js \
  e2e/synthesis-execution-states.spec.js \
  e2e/discover-weak-match.spec.js \
  e2e/live-backend-readonly.spec.js

python3 -m pytest tests/test_candidate_proxy_safety.py -q
echo "candidate-release: passed"
