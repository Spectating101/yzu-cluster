#!/usr/bin/env bash
set -euo pipefail

# Installs the repo's weekly Reddit research systemd user unit/timer.
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

render "${REPO_ROOT}/Sharpe-Renaissance/systemd/reddit-research.service" "${UNIT_DIR}/reddit-research.service"
render "${REPO_ROOT}/Sharpe-Renaissance/systemd/reddit-research.timer" "${UNIT_DIR}/reddit-research.timer"

systemctl --user daemon-reload
systemctl --user enable --now reddit-research.timer

echo "✅ Installed and enabled reddit-research.timer"
systemctl --user status reddit-research.timer --no-pager || true

