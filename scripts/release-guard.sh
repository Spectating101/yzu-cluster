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
serving="$(tr '\0' '\n' < "/proc/${pid}/environ" 2>/dev/null | grep -m1 '^YZU_PUBLIC_REPO=' | cut -d= -f2-)"

if [[ "$(readlink -f "${root}")" != "$(readlink -f "${serving}")" ]]; then
  cat >&2 <<MSG
release-guard: REFUSING TO STAGE

  you are in   $(basename "${root}")
  desk serves  $(basename "${serving}")

A release built here would write into this tree's releases/ and its promote
command would flip this tree's dist symlink, which serves nobody. Merge into
the serving clone and build there instead.

Override with RELEASE_GUARD=off only if you know why.
MSG
  [[ "${RELEASE_GUARD:-}" == "off" ]] || exit 1
  echo "release-guard: overridden" >&2
fi

served_sha="$(tr '\0' '\n' < "/proc/${pid}/environ" 2>/dev/null | grep -m1 '^YZU_PUBLIC_SHA=' | cut -d= -f2-)"
head_sha="$(git -C "${root}" rev-parse HEAD 2>/dev/null)"
dirty="$(git -C "${root}" status --porcelain 2>/dev/null | grep -vc '^??')"

echo "release-guard: tree $(basename "${root}") is the serving clone"
echo "  HEAD          ${head_sha:0:8}   ${dirty} tracked changes"
echo "  desk serves   ${served_sha:0:8}"
if [[ -n "${served_sha}" && "${served_sha}" != "${head_sha}" ]]; then
  behind="$(git -C "${root}" rev-list --count "${served_sha}..HEAD" 2>/dev/null || echo '?')"
  echo "  this build would advance the desk by ${behind} commits"
fi
[[ "${dirty}" == "0" ]] || { echo "release-guard: commit or stash tracked changes first" >&2; exit 1; }
