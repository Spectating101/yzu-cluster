#!/usr/bin/env bash
set -euo pipefail

# Installs the scorecard systemd user unit/timer.
# Safe to re-run (overwrites unit files in ~/.config/systemd/user).
#
# Usage:
#   bash Sharpe-Renaissance/scripts/install_alpha_scorecard_systemd_user.sh
#   journalctl --user -u alpha-scorecard.service -n 200 --no-pager

SR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${SR_DIR}/.." && pwd)"

UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

render() {
  local in="$1"
  local out="$2"
  sed "s|@REPO_ROOT@|${REPO_ROOT}|g" "${in}" > "${out}"
}

render "${REPO_ROOT}/Sharpe-Renaissance/systemd/alpha-scorecard.service" "${UNIT_DIR}/alpha-scorecard.service"
render "${REPO_ROOT}/Sharpe-Renaissance/systemd/alpha-scorecard.timer" "${UNIT_DIR}/alpha-scorecard.timer"

systemctl --user daemon-reload
systemctl --user enable --now alpha-scorecard.timer

echo "Installed and enabled alpha-scorecard.timer"
systemctl --user status alpha-scorecard.timer --no-pager || true

