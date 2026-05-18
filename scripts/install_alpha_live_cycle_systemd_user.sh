#!/usr/bin/env bash
set -euo pipefail

# Installs the repo's alpha live cycle systemd user unit/timer.
# Safe to re-run (overwrites the unit files in ~/.config/systemd/user).
#
# Usage:
#   bash Sharpe-Renaissance/scripts/install_alpha_live_cycle_systemd_user.sh
#   journalctl --user -u alpha-live.service -n 200 --no-pager

SR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${SR_DIR}/.." && pwd)"

UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

render() {
  local in="$1"
  local out="$2"
  sed "s|@REPO_ROOT@|${REPO_ROOT}|g" "${in}" > "${out}"
}

render "${REPO_ROOT}/Sharpe-Renaissance/systemd/alpha-live.service" "${UNIT_DIR}/alpha-live.service"
render "${REPO_ROOT}/Sharpe-Renaissance/systemd/alpha-live.timer" "${UNIT_DIR}/alpha-live.timer"

systemctl --user daemon-reload
systemctl --user enable --now alpha-live.timer

echo "✅ Installed and enabled alpha-live.timer"
systemctl --user status alpha-live.timer --no-pager || true

