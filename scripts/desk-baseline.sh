#!/usr/bin/env bash
# What is the desk actually serving, and how far behind is it?
#
# Two agents rendered two different interfaces on the same day and both were
# right about different builds, because nothing answers this question. The
# served release carries no identity stamp and /research-drive-build.json falls
# through to the SPA, so the only way to tell generations apart was to guess
# from bundle hashes. This asks the running process instead.
set -uo pipefail

HOST="${DESK_HOST:-100.127.141.44:8765}"

pid="$(ss -ltnp 2>/dev/null | grep ":${HOST##*:}" | grep -oP 'pid=\K[0-9]+' | head -1)"
if [[ -z "${pid}" ]]; then
  echo "no process is listening on ${HOST}" >&2
  exit 2
fi

envof() { tr '\0' '\n' < "/proc/${pid}/environ" 2>/dev/null | grep -m1 "^$1=" | cut -d= -f2-; }

backend_tree="$(readlink "/proc/${pid}/cwd" 2>/dev/null)"
static_dir="$(envof YZU_DESK_STATIC_DIR)"
public_sha="$(envof YZU_PUBLIC_SHA)"
ui_tree="$(envof YZU_PUBLIC_REPO)"
release="$(readlink -f "${static_dir}" 2>/dev/null)"
started="$(ps -o lstart= -p "${pid}" 2>/dev/null | sed 's/^ *//')"
bundle="$(curl -s -m 8 "http://${HOST}/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)"

echo "SERVING"
echo "  host            ${HOST}"
echo "  pid             ${pid}   started ${started}"
echo "  bundle          ${bundle:-unreachable}"
echo "  release         $(basename "${release:-unknown}")"
echo "  ui tree         ${ui_tree:-unset}"
echo "  backend tree    ${backend_tree:-unknown}"
echo "  ui sha (env)    ${public_sha:-unset}"

stamp="${static_dir}/research-drive-build.json"
if [[ -f "${stamp}" ]]; then
  echo "  build stamp     ${stamp}"
else
  echo "  build stamp     MISSING — the desk cannot state its own identity"
fi

for tree in "${ui_tree}" "${backend_tree}"; do
  [[ -d "${tree}/.git" || -f "${tree}/.git" ]] || continue
  label="ui"; [[ "${tree}" == "${backend_tree}" ]] && label="backend"
  head_sha="$(git -C "${tree}" rev-parse --short HEAD 2>/dev/null)"
  branch="$(git -C "${tree}" branch --show-current 2>/dev/null)"
  echo
  echo "${label^^} TREE  ${tree}"
  echo "  branch          ${branch:-detached}   HEAD ${head_sha}"
  if [[ "${label}" == "ui" && -n "${public_sha}" ]]; then
    if git -C "${tree}" cat-file -e "${public_sha}" 2>/dev/null; then
      behind="$(git -C "${tree}" rev-list --count "${public_sha}..HEAD" 2>/dev/null)"
      if [[ "${behind}" == "0" ]]; then
        echo "  drift           none — the served build is this tree's HEAD"
      else
        echo "  drift           SERVED BUILD IS ${behind} COMMITS BEHIND HEAD"
        git -C "${tree}" log --oneline "${public_sha}..HEAD" 2>/dev/null | head -5 | sed 's/^/                  /'
      fi
    else
      echo "  drift           served sha ${public_sha} is not an object in this tree"
    fi
  fi
done

echo
echo "OTHER UI CLONES CARRYING THIS PROJECT"
parent="$(dirname "${ui_tree}")"
for d in "${parent}"/*release*/; do
  [[ -d "${d}/drive/src/v2" || -L "${d}/drive/src/v2" ]] || continue
  b="$(git -C "${d}" branch --show-current 2>/dev/null)"
  h="$(git -C "${d}" rev-parse --short HEAD 2>/dev/null)"
  mark="  "
  [[ "$(readlink -f "${d}")" == "$(readlink -f "${ui_tree}")" ]] && mark="→ "
  printf '%s%-58s %-34s %s\n' "${mark}" "$(basename "${d}")" "${b:-detached}" "${h}"
done
echo
echo "→ marks the tree whose build is being served. Any other tree is a"
echo "  development clone; branching from the served SHA reproduces the"
echo "  generation gap that put two agents on two different interfaces."
