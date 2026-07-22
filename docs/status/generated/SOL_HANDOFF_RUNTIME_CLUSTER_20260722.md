# Sol handoff — runtime / YZU cluster (2026-07-22)

## Branches (GitHub `Spectating101/research-drive-private`)

| Branch | Owner | Status |
|---|---|---|
| `consolidate/runtime-capability-rc` | Grok (this session) | Cluster heal + full procure proofs |
| `codex/live-runtime-hardening` | Luna/Codex | Live procurement/scheduling + synthesis execution (already pushed tip `0bd83d2`) |

## What this RC commit adds

- Skip SSH-dead Windows inventory hosts (`pools.windows_workers(require_reachable=True)`)
- Thin-worker readiness (remote_worker + `py` counts as provisioned)
- Executor uses pool `remote_python` (`py -3`) + `repo_relpath` for remote artifacts
- `remote_worker` no longer imports FastAPI `worker_control` (thin Windows checkout safe)

## Live topology (Optiplex)

- Desk `:8765` — `research-drive-front-door.service` (cwd front-door, `YZU_RUNTIME_DRIVE_ROOT` → runtime-integration)
- Worker control `:8780` — RI `worker_control`
- Local claimant — `yzu-cluster-worker.service` (front-door PYTHONPATH)

## Windows inventory

File: `/home/phyrexian/cluster-lab-logs/windows-cluster-inventory.csv` (not in git)

| Host | IP | Role |
|---|---|---|
| EDHFGGV | 100.83.34.59 | windows-01 thin worker |
| FGEDHGV | 100.102.0.84 | windows-02 thin worker |
| GVEFGDH | 100.126.238.20 | windows-03 (Python 3.12 installed today) |
| VEFGGDH / DHFGGVE | … | `unreachable` |
| HA6D3RH | … | `ssh_pending` |

## Proven canaries (desk API)

1. **Hybrid SCP path** — job `201eb7ee748e` / `canary.fullops.10361`  
   Optiplex claims → shard on **FGEDHGV** → GDrive verify → registry promote → `/datasets/...` 200

2. **Windows pull-claim path** — job `9157e9f31198` / `canary.winclaim2.10683`  
   Local worker stopped → **windows-02** claimed via `:8780` → registered + archive_verified

## Suggested next for Sol

1. Optionally stop Optiplex worker from claiming `http_manifest` so Windows pull-workers take steady-state traffic
2. Merge/rebase `consolidate/runtime-capability-rc` + `codex/live-runtime-hardening` onto authority tip carefully (registry binds + front-door)
3. Do **not** commit live front-door registry symlink typechanges / accidental `config/*` duplicates under front-door root
