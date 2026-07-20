# Day-2 operations and RC2+ roadmap

**Status:** RC1 frozen. This document classifies post-RC1 work.  
**Private tip at archival:** see tag `research-drive-rc1`.

## Classification rule

| Kind | When | Examples |
|---|---|---|
| **Hotfix** | RC1 production path broken | Lease fencing regression, GDrive verify false-positive, collector crash on allowed URL |
| **Day-2 / ops** | Keep the fleet healthy | Queue namespaces, fixture isolation, monitoring, backups, routine smoke |
| **RC2+** | New product capability | Live Resources/Library/History/Ask against private production identity |

Do **not** reopen RC1 for ops or product expansion.

---

## Day-2 (operations) — near term

### D2-1 — Queue / fixture isolation (in progress)

**Problem:** Shared desk job store mixed fixture/test jobs with production. A Windows `http` worker claimed `synthesis_execute` because empty `required_capabilities` matches any worker; the worker correctly refused, but claim pollution is unsafe.

**Target behavior:**

- Remote worker-control claims only configured job types (default: `http_manifest`).
- Fixture-like job id prefixes are never claimable by production workers.
- Controller startup / health can report contaminated queued fixture counts (warn, non-fatal).

### D2-2 — Routine smoke

Weekly (or after deploy): one public `http_manifest` with a dedicated idempotency key through registered; record dataset id only (sanitized).

### D2-3 — Secrets and bind posture

- Rotate `YZU_WORKER_CONTROL_TOKEN` on a schedule.
- Keep worker-control Tailscale-only; alert if bound to `0.0.0.0`.

### D2-4 — Backups

- Registry DB + `research_query_registry.json` snapshot cadence.
- Confirm GDrive vault retention for `collection/acquired/procured/`.

---

## RC2+ (product) — capability cycles

Theme: **connect the desk surfaces to the live private identity**, not rebuild the factory.

### RC2-A — Live identity contract (first slice)

Publish a stable, sanitized shape (already sketched in `RC1_LIVE_PAYLOAD_IDENTITY.json`) that Resources, Library, Synthesis, Detail|Ask, and Discover History can all agree on:

- `dataset_id`, `registry_id`, `manifest_id`, `job_id`, `run_id`, `readiness`, `worker_id`

### RC2-B — Resources live rollup

Show real worker join capacity, active run, usage samples, and lifecycle for production jobs (not fixture titles).

### RC2-C — Library + Discover History

Library row for registered smoke/production assets; Discover History trail `queued → … → registered` from the same ids.

### RC2-D — Detail | Ask grounding

Selected asset context cites registry + archive proof; never invent query-ready.

### RC2-E — Query-ready path (only when real)

Promote readiness to `query_ready` only after query-engine checks; Synthesis already distinguishes the badge.

---

## Explicit non-goals

- Relitigating public vs private topology
- Another host-acceptance campaign unless a hotfix changes the collector/control-plane contract
- Staging-patch CI machinery on public

## Next concrete commits

1. Archival of RC1 closeout under `drive/docs/status/releases/` + tag `research-drive-rc1`
2. Remote claim filters for allowed job types + fixture id denylist
3. RC2-A: wire one read API or mock-free FE path for the live identity shape on Resources or Library
