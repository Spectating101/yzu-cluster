#!/usr/bin/env bash
# Printed before every test run. These clones are worktrees of one repository,
# so git config is shared and cannot distinguish them; the marker is a plain
# file at each tree root, written by scripts/desk-baseline.sh's companion.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
role="$(head -1 "${root}/.desk-role" 2>/dev/null)"
branch="$(git -C "${root}" branch --show-current 2>/dev/null)"
head="$(git -C "${root}" rev-parse --short HEAD 2>/dev/null)"
printf '\n  tree  %s\n  role  %s\n  at    %s %s\n\n' \
  "$(basename "${root}")" "${role:-UNLABELLED — run scripts/desk-baseline.sh}" "${branch:-detached}" "${head}"
