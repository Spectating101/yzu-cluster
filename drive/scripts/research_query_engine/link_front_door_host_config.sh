#!/usr/bin/env bash
# Link drive/config authority files into repo-root config/ for the Optiplex front door.
#
# Clean private tips keep registry/queue JSON under drive/config/, but several desk
# paths still open config/<name>.json from the repo root. This helper makes that
# host layout explicit instead of ad-hoc operator recovery.
#
# Also preserve (do not overwrite) a host-local data_lake/yzu_cluster job-store
# symlink when present — that points at the production job queue, not drive/config.
#
# Usage:
#   bash drive/scripts/research_query_engine/link_front_door_host_config.sh
#   bash drive/scripts/research_query_engine/link_front_door_host_config.sh --dry-run
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
fi

# Code-referenced config/*.json that must resolve at repo-root config/.
CONFIG_LINKS=(
  collection_partitions.json
  collection_semantic.json
  databank_access_scope.json
  databank_coverage_proxies.json
  databank_source_map.json
  data_collection_queue.json
  desk_demo_catalog.json
  desk_sources.json
  procurement_governance.json
  procurement_magic.json
  procurement_registry_map.json
  research_query_registry.json
  storage_tiers.json
  synthesis_profiles.json
  yzu_cluster.json
)

mkdir -p "${repo_root}/config"
linked=0
skipped=0
missing=0

for name in "${CONFIG_LINKS[@]}"; do
  src="${repo_root}/drive/config/${name}"
  dst="${repo_root}/config/${name}"
  if [[ ! -e "${src}" ]]; then
    printf 'missing_source=%s\n' "${src}"
    missing=$((missing + 1))
    continue
  fi
  if [[ -L "${dst}" ]]; then
    current="$(readlink "${dst}")"
    if [[ "${current}" == "../drive/config/${name}" || "${current}" == "${src}" ]]; then
      printf 'ok_link=%s\n' "${name}"
      skipped=$((skipped + 1))
      continue
    fi
  elif [[ -e "${dst}" ]]; then
    printf 'skip_existing_file=%s\n' "${name}"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${dry_run}" == "1" ]]; then
    printf 'would_link=%s -> ../drive/config/%s\n' "${name}" "${name}"
  else
    ln -sfn "../drive/config/${name}" "${dst}"
    printf 'linked=%s\n' "${name}"
  fi
  linked=$((linked + 1))
done

printf 'repo_root=%s\n' "${repo_root}"
printf 'linked=%s skipped=%s missing_source=%s dry_run=%s\n' "${linked}" "${skipped}" "${missing}" "${dry_run}"
if [[ "${missing}" -gt 0 ]]; then
  exit 1
fi
