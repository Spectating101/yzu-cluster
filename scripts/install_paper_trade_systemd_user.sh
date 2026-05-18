#!/usr/bin/env bash
set -euo pipefail

# Installs the repo's paper trading systemd user unit/timer.
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

render "${REPO_ROOT}/Sharpe-Renaissance/systemd/paper-trade.service" "${UNIT_DIR}/paper-trade.service"
render "${REPO_ROOT}/Sharpe-Renaissance/systemd/paper-trade.timer" "${UNIT_DIR}/paper-trade.timer"

systemctl --user daemon-reload
systemctl --user enable --now paper-trade.timer

echo "✅ Installed and enabled paper-trade.timer"
systemctl --user status paper-trade.timer --no-pager || true

