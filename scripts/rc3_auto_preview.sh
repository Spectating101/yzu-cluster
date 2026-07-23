#!/usr/bin/env bash
#
# Safe local deploy loop for the public RC3 frontend.
#
# It watches one allowlisted Git ref, validates each new commit in an isolated
# worktree, and only then replaces the Vite process serving the live preview.
# A failed commit leaves the last good preview running.
#
# Environment overrides:
#   RC3_REMOTE, RC3_REF, RC3_DEPLOY_ROOT, RC3_LIVE_HOST, RC3_LIVE_PORT
#   RC3_API_TARGET, RC3_POLL_SECONDS, RC3_RETRY_SECONDS, RC3_RUN_MOCK_E2E

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REMOTE="${RC3_REMOTE:-origin}"
REF="${RC3_REF:-refs/heads/agent/rc3-semantic-research-desk}"
DEPLOY_ROOT="${RC3_DEPLOY_ROOT:-$HOME/.cache/yzu-cluster/rc3-auto-preview}"
RELEASES_DIR="$DEPLOY_ROOT/releases"
LOG_FILE="${RC3_LOG_FILE:-$DEPLOY_ROOT/deploy.log}"
STATE_FILE="${RC3_STATE_FILE:-$DEPLOY_ROOT/state.json}"
DEPLOYED_SHA_FILE="$DEPLOY_ROOT/deployed.sha"
FAILED_SHA_FILE="$DEPLOY_ROOT/failed.sha"
FAILED_AT_FILE="$DEPLOY_ROOT/failed.at"
LOCK_FILE="$DEPLOY_ROOT/deploy.lock"
LIVE_HOST="${RC3_LIVE_HOST:-100.127.141.44}"
LIVE_PORT="${RC3_LIVE_PORT:-8767}"
SMOKE_HOST="${RC3_SMOKE_HOST:-127.0.0.1}"
SMOKE_PORT="${RC3_SMOKE_PORT:-18767}"
API_TARGET="${RC3_API_TARGET:-http://100.127.141.44:8765}"
POLL_SECONDS="${RC3_POLL_SECONDS:-30}"
RETRY_SECONDS="${RC3_RETRY_SECONDS:-300}"

mkdir -p "$RELEASES_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

log() {
  local message="$1"
  printf '%s %s\n' "$(date -u +%FT%H:%M:%SZ)" "$message" | tee -a "$LOG_FILE"
}

port_pid() {
  ss -ltnp 2>/dev/null \
    | sed -n "/:${1} /{s/.*pid=\([0-9][0-9]*\).*/\1/p;q;}"
}

owned_live_cwd() {
  local cwd="${1:-}"
  case "$cwd" in
    "$RELEASES_DIR"/*|/tmp/yzu-cluster-rc3|"$REPO_ROOT"|"$REPO_ROOT"/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

publish_state_to_live() {
  local pid cwd
  pid="$(port_pid "$LIVE_PORT")"
  [ -n "$pid" ] || return 0
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  owned_live_cwd "$cwd" || return 0
  [ -d "$cwd" ] || return 0
  mkdir -p "$cwd/public"
  cp "$STATE_FILE" "$cwd/public/rc3-watcher-state.json.tmp"
  mv "$cwd/public/rc3-watcher-state.json.tmp" "$cwd/public/rc3-watcher-state.json"
}

write_state() {
  local status="${1:-unknown}"
  local sha="${2:-}"
  local detail="${3:-}"
  local deployed failed tmp
  deployed="$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || true)"
  failed="$(cat "$FAILED_SHA_FILE" 2>/dev/null || true)"
  tmp="$STATE_FILE.tmp"
  python3 - "$tmp" "$status" "$sha" "$detail" "$deployed" "$failed" "$REF" <<'PY'
import json
import sys
from datetime import datetime, timezone

path, status, sha, detail, deployed, failed, ref = sys.argv[1:]
payload = {
    "status": status,
    "candidate_sha": sha or None,
    "detail": detail or None,
    "deployed_sha": deployed or None,
    "failed_sha": failed or None,
    "watched_ref": ref,
    "updated_at": datetime.now(timezone.utc).isoformat(),
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
  mv "$tmp" "$STATE_FILE"
  publish_state_to_live || true
}

remote_sha() {
  git -C "$REPO_ROOT" fetch --quiet "$REMOTE" "$REF"
  git -C "$REPO_ROOT" rev-parse FETCH_HEAD
}

wait_for_port() {
  local port="$1"
  local attempts="${2:-30}"
  local host="${3:-$SMOKE_HOST}"
  for _ in $(seq 1 "$attempts"); do
    if curl --silent --show-error --fail --max-time 3 "http://${host}:${port}/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_vite() {
  local release_dir="$1"
  local port="$2"
  local host="$3"
  local log_path="$release_dir/vite-${port}.log"
  (
    cd "$release_dir"
    exec 9>&-
    exec env YZU_API_URL="$API_TARGET" \
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=optiplex.tail639327.ts.net,rc3.easycamp.tech,previous.easycamp.tech \
      ./node_modules/.bin/vite --host "$host" --port "$port" --strictPort
  ) >"$log_path" 2>&1 &
  printf '%s\n' "$!"
}

stop_pid() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -9 "$pid" 2>/dev/null || true
}

assert_live_process_is_owned() {
  local pid="$1"
  local cwd
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  if owned_live_cwd "$cwd"; then
    return 0
  fi
  log "REFUSING to replace port ${LIVE_PORT}: pid=${pid} cwd=${cwd:-unknown} is not an RC3 release"
  return 1
}

ensure_tailwind_oxide() {
  # systemd user services often see /usr/bin/node (v18) first; optional native
  # bindings for @tailwindcss/oxide then get omitted and Vite dies at mock E2E.
  if node -e "require('@tailwindcss/oxide')" >/dev/null 2>&1; then
    return 0
  fi
  local version
  version="$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version" 2>/dev/null || true)"
  if [ -z "$version" ]; then
    log "oxide package missing after npm install"
    return 1
  fi
  log "oxide native binding missing; forcing @tailwindcss/oxide-linux-x64-gnu@${version}"
  npm install --no-save --no-audit --no-fund "@tailwindcss/oxide-linux-x64-gnu@${version}"
  node -e "require('@tailwindcss/oxide')"
}

run_checks() {
  local release_dir="$1"
  (
    cd "$release_dir"
    log "checks using node=$(command -v node) ($(node -v)) npm=$(command -v npm)"
    # A clean install avoids npm's optional-dependency/native-binding bug
    # which can make Vite/Tailwind fail after an otherwise successful npm ci.
    rm -rf node_modules
    npm install --no-audit --no-fund --include=optional
    ensure_tailwind_oxide
    npm run build
    npm run test:candidate-key
    npm run test:runtime-contract
    if [ "${RC3_RUN_MOCK_E2E:-0}" = "1" ]; then
      npm run test:v2-mock
    fi
  )
}

cleanup_releases() {
  mapfile -t old_releases < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
      | sort -nr \
      | awk 'NR > 3 {print $2}'
  )
  for release in "${old_releases[@]}"; do
    git -C "$REPO_ROOT" worktree remove --force "$release" >/dev/null 2>&1 || true
  done
}

deploy_sha() {
  local sha="$1"
  local release_dir="$RELEASES_DIR/$sha"
  local old_pid=""
  local old_cwd=""
  local smoke_pid=""
  local live_pid=""
  local latest_sha=""

  if [ ! -d "$release_dir" ]; then
    git -C "$REPO_ROOT" worktree add --detach "$release_dir" "$sha"
  fi

  log "checking ${sha}"
  write_state "checking" "$sha" "Installing, building, and validating candidate"
  if ! run_checks "$release_dir" >>"$LOG_FILE" 2>&1; then
    printf '%s\n' "$sha" >"$FAILED_SHA_FILE"
    date +%s >"$FAILED_AT_FILE"
    log "checks failed for ${sha}; keeping current preview"
    write_state "failed_checks" "$sha" "Validation failed; previous preview retained"
    return 1
  fi

  latest_sha="$(remote_sha 2>/dev/null || true)"
  if [ -n "$latest_sha" ] && [ "$latest_sha" != "$sha" ]; then
    log "validated ${sha}, but ${latest_sha} superseded it; skipping stale replacement"
    write_state "superseded" "$sha" "Newer candidate ${latest_sha} is waiting"
    return 0
  fi

  write_state "smoke" "$sha" "Starting isolated Vite smoke server"
  smoke_pid="$(start_vite "$release_dir" "$SMOKE_PORT" "$SMOKE_HOST")"
  if ! wait_for_port "$SMOKE_PORT" 30; then
    log "smoke server failed for ${sha}; keeping current preview"
    stop_pid "$smoke_pid"
    printf '%s\n' "$sha" >"$FAILED_SHA_FILE"
    date +%s >"$FAILED_AT_FILE"
    write_state "failed_smoke" "$sha" "Candidate Vite smoke server did not become healthy"
    return 1
  fi
  curl --silent --show-error --fail --max-time 5 \
    "http://${SMOKE_HOST}:${SMOKE_PORT}/" >/dev/null
  stop_pid "$smoke_pid"

  live_pid="$(port_pid "$LIVE_PORT")"
  if [ -n "$live_pid" ]; then
    if ! assert_live_process_is_owned "$live_pid"; then
      printf '%s\n' "$sha" >"$FAILED_SHA_FILE"
      date +%s >"$FAILED_AT_FILE"
      write_state "blocked_process_ownership" "$sha" "Port ${LIVE_PORT} belongs to an unapproved process"
      return 1
    fi
    old_pid="$live_pid"
    old_cwd="$(readlink "/proc/$old_pid/cwd" 2>/dev/null || true)"
    stop_pid "$old_pid"
  fi

  write_state "switching" "$sha" "Replacing the accepted live preview"
  live_pid="$(start_vite "$release_dir" "$LIVE_PORT" "$LIVE_HOST")"
  if ! wait_for_port "$LIVE_PORT" 30 "$LIVE_HOST"; then
    log "live server failed for ${sha}; attempting rollback"
    stop_pid "$live_pid"
    if [ -n "$old_cwd" ] && [ -d "$old_cwd" ]; then
      local rollback_pid
      rollback_pid="$(start_vite "$old_cwd" "$LIVE_PORT" "$LIVE_HOST")"
      wait_for_port "$LIVE_PORT" 30 "$LIVE_HOST" || stop_pid "$rollback_pid"
    fi
    printf '%s\n' "$sha" >"$FAILED_SHA_FILE"
    date +%s >"$FAILED_AT_FILE"
    write_state "failed_live_start" "$sha" "Live replacement failed; rollback attempted"
    return 1
  fi

  printf '%s\n' "$sha" >"$DEPLOYED_SHA_FILE"
  rm -f "$FAILED_SHA_FILE" "$FAILED_AT_FILE"
  log "deployed ${sha} to http://${LIVE_HOST}:${LIVE_PORT}"
  write_state "deployed" "$sha" "Candidate is live"
  cleanup_releases
}

deploy_once() {
  local sha
  sha="$(remote_sha)" || {
    log "fetch failed; retaining current preview"
    write_state "fetch_failed" "" "Could not fetch ${REMOTE}:${REF}"
    return 0
  }
  if [ -f "$DEPLOYED_SHA_FILE" ] \
    && [ "$(cat "$DEPLOYED_SHA_FILE")" = "$sha" ] \
    && [ -n "$(port_pid "$LIVE_PORT")" ]; then
    write_state "deployed" "$sha" "Candidate is live"
    return 0
  fi
  if [ -f "$FAILED_SHA_FILE" ] && [ "$(cat "$FAILED_SHA_FILE")" = "$sha" ]; then
    local failed_at elapsed remaining
    failed_at="$(cat "$FAILED_AT_FILE" 2>/dev/null || printf '0')"
    elapsed=$(( $(date +%s) - failed_at ))
    if [ "$elapsed" -lt "$RETRY_SECONDS" ]; then
      remaining=$(( RETRY_SECONDS - elapsed ))
      write_state "backoff" "$sha" "Retrying in ${remaining}s"
      return 0
    fi
    log "retrying failed ${sha} after ${RETRY_SECONDS}s backoff"
  fi
  deploy_sha "$sha" || true
}

case "${1:-watch}" in
  once)
    write_state "starting" "" "Running one deployment check"
    deploy_once
    ;;
  watch)
    log "watching ${REMOTE}:${REF} every ${POLL_SECONDS}s"
    write_state "watching" "" "Polling every ${POLL_SECONDS}s"
    deploy_once
    while :; do
      sleep "$POLL_SECONDS"
      deploy_once
    done
    ;;
  *)
    printf 'Usage: %s [once|watch]\n' "$0" >&2
    exit 2
    ;;
esac
