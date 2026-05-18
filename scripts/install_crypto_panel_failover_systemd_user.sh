#!/usr/bin/env bash
set -euo pipefail

SR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"

mkdir -p "${UNIT_DIR}"

render() {
  local in="$1"
  local out="$2"
  sed "s|@SR_DIR@|${SR_DIR}|g" "${in}" > "${out}"
}

render "${SR_DIR}/systemd/crypto-panel-failover.service" "${UNIT_DIR}/crypto-panel-failover.service"
render "${SR_DIR}/systemd/crypto-panel-failover.timer" "${UNIT_DIR}/crypto-panel-failover.timer"

systemctl --user daemon-reload
systemctl --user enable --now crypto-panel-failover.timer

echo "✅ Installed and enabled crypto-panel-failover.timer"
systemctl --user status crypto-panel-failover.timer --no-pager || true
