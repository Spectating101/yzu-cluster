# Host Acceptance Report — Private Runtime PR #1

**Date (UTC):** 2026-07-20  
**Verdict:** PASS — original success + stale fencing + committed-collector revalidation  
**Merge status:** Private PR #1 remains **draft / unmerged**  
**Rollback:** preserved (`archive/pre-runtime-main-2026-07-20`)

## SHA ledger

| Role | SHA |
|---|---|
| Original accepted candidate (docs tip) | `ac69635b7eca9edbdd1c883bc6c5950e29c528c1` |
| Original runtime implementation head | `439f302a1394e9dfa9c04c2880d3c8a6a352c0db` |
| **Final tested candidate (committed collector)** | `62f2958104cc28fe033a4605ae25a3510e96ac1d` |
| Private PR | `#1` — Research Drive runtime RC1 (draft) |
| Public frontend tip at first acceptance | `fc193162717b5823b3ff894ecebe86111a681e5a` |

## Security (all runs)

- Controller bound to Optiplex Tailscale only (`100.127.141.44:8780`), not `0.0.0.0`
- Health: `{"status":"ok","token_required":true}`
- Unauthenticated join rejected (HTTP 401)
- Fresh `YZU_WORKER_CONTROL_TOKEN` outside Git; not committed; not printed here
- No tokens, rclone config, SSH material, Tailscale inventory, or credentials in this report

---

## Proof A — Original success path (host-local collector)

Executed from candidate tip `ac69635` / runtime `439f302` using a then-untracked Optiplex-disk `remote_collect.py` (repository defect; later closed).

| Field | Value |
|---|---|
| Job ID | `host-acceptance-success-20260720a` |
| Run ID | `run-65bb322815fa4feb94fe7ef48cff109a` |
| Worker | `windows-01` (`DESKTOP-EDHFGGV`) |
| Attempt | 1 |
| Artifact bytes / sha256 | `117919` / `090a90478702473b1198716fe93aeea31aeed47ed70a54993b14158a5b42850a` |
| Dataset ID | `host_acceptance_http_manifest_20260720` |
| Manifest ID | `collection_manifest_host-acceptance-success-20260720a` |
| GDrive | verified (`rclone check --one-way`: 0 differences / 2 matching files) |
| Legacy status | `completed` |
| Runtime lifecycle | `registered` |
| Readiness | `registered` |
| `archive_verified` / `registry_readback` | true / true |

**Defect noted at the time:** collector path was not in the candidate SHA. That blocked direct merge from `ac69635`.

---

## Proof B — Stale-attempt fencing (still accepted; not re-run)

Collector addition did not change leases, attempts, heartbeat ownership, stale-write fencing, retry reconciliation, or control-plane terminal transitions. This proof remains accepted.

| Field | Value |
|---|---|
| Job ID | `host-acceptance-retry-20260720a` |
| Run ID | `run-5f60069539014d8ea752c8ef32e4eb17` |
| Attempt 1 | claimed + heartbeat; worker killed mid-run (no terminal) |
| After lease expiry | runtime `retrying`, legacy `queued`, error `worker lease expired` |
| Attempt 2 claim | `attempt: 2` |
| Stale attempt-1 heartbeat / usage / upload / complete / fail | all HTTP **409** |
| Attempt-2 heartbeat | HTTP 200 |
| Duplicate registration | none |

---

## Proof C — Committed-collector revalidation (required before merge)

**Scope:** success path only. Stale-attempt test not repeated.

### Preflight

| Check | Result |
|---|---|
| Stopped prior controller/worker | yes |
| Optiplex HEAD | `62f2958104cc28fe033a4605ae25a3510e96ac1d` |
| Optiplex worktree clean before run | yes |
| Collector tracked | `git ls-files --error-unmatch drive/scripts/cluster_agent/remote_collect.py` → OK |
| Old untracked collector removed/renamed | Optiplex main dirty copy → `remote_collect.py.untracked-pre-62f2958.bak`; Windows loose `C:\Users\user\remote_collect.py` renamed similarly |
| Windows deployed collector sha256 | `9cb622182ced3daaeb5e43e0256eb46bed21d4811ebde261a50bd4466dc1d877` (matches Optiplex committed file, 11598 bytes) |
| Exact collector path used | `drive/scripts/cluster_agent/remote_collect.py` → Windows `C:\cw\Sharpe-Renaissance\drive\scripts\cluster_agent\remote_collect.py` |

Windows note: thin deploy of exact SHA contents (not a full git clone). SHA stamp and content hash matched `62f2958` before execution.

### Job

| Field | Value |
|---|---|
| Job ID | `host-acceptance-committed-collector-20260720a` |
| Dataset ID | `host_acceptance_committed_collector_20260720` |
| Idempotency key | `host-acceptance-committed-collector-20260720a` |
| Public source | `https://www.rfc-editor.org/rfc/rfc7231.txt` |
| Run ID | `run-495e4d32aeab4d0bad89bef2944d6441` |
| Worker | `windows-01` |
| Attempt | 1 |

### Collector proof (committed, not host-local)

Worker preflight printed:

```text
COMMITTED_COLLECTOR_PATH C:\cw\Sharpe-Renaissance\drive\scripts\cluster_agent\remote_collect.py
COMMITTED_COLLECTOR_EXISTS True
COMMITTED_COLLECTOR_BYTES 11598
COMMITTED_COLLECTOR_SHA256 9cb622182ced3daaeb5e43e0256eb46bed21d4811ebde261a50bd4466dc1d877
```

`collect_report` used the committed collector’s proof-bearing schema (`ok`, `succeeded`/`failed`, per-item `sha256`/`bytes`/`status`), confirming the new collector executed:

- total 1 / succeeded 1 / failed 0
- item sha256 `a83d026937f6f7929a0e53f8a9bfec4104285f0f89d6dbabd3927c4208a715b2`
- worker exit `0`

### Control-plane path

Windows → Optiplex Tailscale: join → claim → heartbeat → artifact PUT → usage → complete (all HTTP 200).

| Field | Value |
|---|---|
| Artifact bytes / sha256 | `64529` / `cb399f8e4d7d86e965e65a698b1c6f4db6957b23de625c914daa9e56b2837438` |
| Materialisation | validation ok; file `rfc7231.txt` (235053 bytes) |
| Manifest ID | `collection_manifest_host-acceptance-committed-collector-20260720a` |
| GDrive archive | ok + verified |
| `rclone check --one-way` | **0 differences** / 2 matching files |
| Canonical remote | `gdrive:.../collection/acquired/procured/host_acceptance_committed_collector_20260720` |
| Registry promotion | `replaced: false` |
| Registry read-back | true |
| Runtime lifecycle | `registered` |
| Readiness | `registered` (not `query_ready`) |
| Legacy status | `completed` |
| Distinct from Proof A dataset | yes (`host_acceptance_committed_collector_20260720` ≠ prior dataset) |

---

## Synthesis UI note (public; separate track)

Public PR **#43** addresses the registered vs query_ready badge leak (`Registered` vs `Query ready`). Out of scope for this private host revalidation; remains Sol’s public FE track.

---

## Explicit non-actions

- Private PR #1 **not merged**
- Stale-attempt proof **not repeated** (still accepted)
- No architecture redesign
- No public publish of private runtime
- Secrets excluded from this report

## Merge gate recommendation (for Sol)

Committed-collector revalidation **PASS** at `62f2958`. Safe to:

1. Commit this sanitized report onto PR #1
2. Confirm private CI green
3. Mark PR #1 ready for review
4. Merge with a **merge commit**
5. Deploy private `main` and smoke once more from merged `main`
6. Then complete/merge public PR #43 and capture the live payload across surfaces
