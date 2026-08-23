#!/usr/bin/env bash
# Refuse to stage a release from a tree the desk does not serve.
#
# The build script will happily build anywhere. Run from a development clone it
# reports currently_live from that clone's own dangling symlink, prints a
# promote command that flips a symlink nobody serves, and looks like it worked.
# That is how a release got staged from a branch twenty commits behind.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host="${DESK_HOST:-100.127.141.44:8765}"

pid="$(ss -ltnp 2>/dev/null | grep ":${host##*:}" | grep -oP 'pid=\K[0-9]+' | head -1)"
if [[ -z "${pid}" ]]; then
  echo "release-guard: nothing is listening on ${host}; cannot confirm the serving tree" >&2
  exit 1
fi
process_env="$(tr '\0' '\n' < "/proc/${pid}/environ" 2>/dev/null)"
serving="$(printf '%s\n' "${process_env}" | grep -m1 '^YZU_PUBLIC_REPO=' | cut -d= -f2-)"
static_dir="$(printf '%s\n' "${process_env}" | grep -m1 '^YZU_DESK_STATIC_DIR=' | cut -d= -f2-)"
root_real="$(readlink -f "${root}")"

# An explicit static directory is the release authority. The service may read
# source/configuration from one checkout while intentionally serving releases
# retained by a separate clean build worktree. In that topology, comparing
# only YZU_PUBLIC_REPO rejects the correct build tree and permits the wrong
# source tree. Prefer the owner of YZU_DESK_STATIC_DIR whenever it is present.
if [[ -n "${static_dir}" ]]; then
  static_real="$(readlink -f "${static_dir}")"
  case "${static_real}" in
    "${root_real}"|"${root_real}"/*) owns_release=1 ;;
    *) owns_release=0 ;;
  esac
else
  owns_release=0
  [[ "${root_real}" == "$(readlink -f "${serving}")" ]] && owns_release=1
fi

if [[ "${owns_release}" != "1" ]]; then
  cat >&2 <<MSG
release-guard: REFUSING TO STAGE

  you are in          $(basename "${root}")
  desk source repo    $(basename "${serving}")
  static release dir  ${static_dir:-not explicitly configured}

A release built here would write into this tree's releases/ and flip this
tree's dist symlink, which the running desk does not serve. Build from the
worktree that owns the configured static release directory instead.

Override with RELEASE_GUARD=off only if you know why.
MSG
  [[ "${RELEASE_GUARD:-}" == "off" ]] || exit 1
  echo "release-guard: overridden" >&2
fi

served_sha="$(printf '%s\n' "${process_env}" | grep -m1 '^YZU_PUBLIC_SHA=' | cut -d= -f2-)"
head_sha="$(git -C "${root}" rev-parse HEAD 2>/dev/null)"
dirty="$(git -C "${root}" status --porcelain 2>/dev/null | grep -vc '^??')"

echo "release-guard: tree $(basename "${root}") owns the served static releases"
echo "  HEAD          ${head_sha:0:8}   ${dirty} tracked changes"
echo "  desk serves   ${served_sha:0:8}"
if [[ -n "${served_sha}" && "${served_sha}" != "${head_sha}" ]]; then
  behind="$(git -C "${root}" rev-list --count "${served_sha}..HEAD" 2>/dev/null || echo '?')"
  echo "  this build would advance the desk by ${behind} commits"
fi
[[ "${dirty}" == "0" ]] || { echo "release-guard: commit or stash tracked changes first" >&2; exit 1; }
