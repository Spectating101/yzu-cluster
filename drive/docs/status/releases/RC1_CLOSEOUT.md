# RC1 Closeout

**Date (UTC):** 2026-07-20  
**Verdict:** RC1 closed — private production authority + public interface correction released

## Authorities

| Plane | Authority | SHA / note |
|---|---|---|
| Private production runtime | `research-drive-private` `main` | merge `50915273f5597d4f0656f08a3bda17e798b869c1` (PR #1) |
| Public interface | `yzu-cluster` `main` | merge `0637cdd59176fcb029cdccea3f58515ff0ffccec` (PR #43) |
| Live hosts | Optiplex controller + Windows worker | deployed from private `main`; Tailscale-bound worker-control |

## Private release (closed)

- Proofs A/B/C accepted; report committed (`0a6b90f`) and included in merge
- Post-merge smoke: committed collector → artifact → GDrive verify → registry → `registered` / legacy `completed`
- Candidate collector path: `drive/scripts/cluster_agent/remote_collect.py` (tracked)

## Public PR #43 (closed)

- Staging patch generators removed
- Final merged diff: `drive/src/v2/SynthesisPage.jsx` + `e2e/v2-synthesis.spec.js` only
- Ordinary CI green; local Synthesis suite 7/7; live-smoke identity render: **Registered** (not Query ready)

## Live payload identity (sanitized)

Source: private main post-merge smoke. Full sanitized record:

`drive/docs/status/generated/RC1_LIVE_PAYLOAD_IDENTITY.json`

| Field | Value |
|---|---|
| dataset_id | `host_acceptance_main_smoke_20260720` |
| registry_id | `host_acceptance_main_smoke_20260720` |
| manifest_id | `collection_manifest_host-acceptance-main-smoke-20260720a` |
| job_id | `host-acceptance-main-smoke-20260720a` |
| run_id | `run-5f32dab53fc44ce39bb8a48ad65f470e` |
| readiness | `registered` |
| Synthesis badge | **Registered** (Query ready must not appear) |

Cross-surface agreement matrix:

| Surface | Expectation | Status |
|---|---|---|
| Synthesis | Badge Registered; Library openable; job/manifest/dataset IDs visible | **PASS** (live-identity Playwright render) |
| Resources | worker `windows-01`, run id, lifecycle registered | Identity recorded; full live Resources wiring is product/ops follow-up against private control plane |
| Library | matching dataset / manifest / registry ids | Identity recorded; openable from Synthesis CTA |
| Detail \| Ask | selected asset = dataset_id; grounding = registered archive+registry | Identity recorded |
| Discover History | job trail to completed/registered | Identity recorded from smoke lifecycle |

## Follow-up hardening (not RC1 blockers)

1. Isolate test/fixture jobs from production queues (shared desk store contamination caused a `synthesis_execute` claim during first main smoke attempt; worker correctly refused).
2. Namespace claims by environment; detect fixture records at production startup.
3. Prefer explicit queue namespaces for acceptance/smoke (isolated root proved the path; shared-store hygiene still required).

## Explicit non-goals of this closeout

- No further runtime-integration cycle
- No redesign of scheduler/fencing/registry
- Secrets / host inventory / rclone config excluded from all generated evidence


## Archival location

Durable Git copies (this directory):

- `drive/docs/status/releases/RC1_CLOSEOUT.md`
- `drive/docs/status/releases/RC1_LIVE_PAYLOAD_IDENTITY.json`

Tag: `research-drive-rc1` on private `main` (and public `yzu-cluster` interface tip).
