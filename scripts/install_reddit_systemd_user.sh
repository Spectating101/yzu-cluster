#!/usr/bin/env bash
set -euo pipefail

# Installs the repo's systemd user unit/timer with the correct absolute repo path.
# Safe to re-run (overwrites the unit files in ~/.config/systemd/user).

SR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${SR_DIR}/.." && pwd)"

UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

render() {
  local in="$1"
  local out="$2"
  sed "s|@REPO_ROOT@|${REPO_ROOT}|g" "${in}" > "${out}"
}

render "${REPO_ROOT}/Sharpe-Renaissance/systemd/reddit-ingest.service" "${UNIT_DIR}/reddit-ingest.service"
render "${REPO_ROOT}/Sharpe-Renaissance/systemd/reddit-ingest.timer" "${UNIT_DIR}/reddit-ingest.timer"

systemctl --user daemon-reload
systemctl --user enable --now reddit-ingest.timer

echo "✅ Installed and enabled reddit-ingest.timer"
systemctl --user status reddit-ingest.timer --no-pager || true

