# Private Runtime Adoption

## Current architecture

The faculty service is assembled by `scripts.research_data_mcp.bootstrap.create_stack`:

```text
HTTP router -> JobService -> YzuOrchestrator -> YzuExecutor
                         -> RegistryPromoter / Drive-first finalisation
                         -> ResearchQueryEngine / Composer-facing gateway
```

`YzuOrchestrator` currently persists legacy jobs in
`data_lake/yzu_cluster/jobs/jobs.sqlite3`. `YzuJobStore` owns two existing
tables:

```text
jobs(id, created_at, updated_at, status, title, request_json, plan_json,
     result_json, error)
events(id, job_id, created_at, level, message)
```

The controller currently executes one queued job at a time. Windows workers
are dispatched by the controller and are not yet lease-owning runtime workers.

## Verified truth boundaries

Synthesis already finalises to Drive before promotion and records a failed
finalisation back to the synthesis thread. Generic collection currently
promotes before Drive verification, so it must be corrected before a promoted
asset is exposed as registered or query-ready.

```text
completed != registered != query_ready
```

## Adoption strategy

The public `InteropStore` reference cannot be imported directly into the
existing database: it defines an incompatible `events` table. The private
runtime will add namespaced runtime tables to the existing database and keep
legacy `jobs` and `events` intact.

```text
jobs / events                         legacy compatibility projection
cluster_runs / cluster_events         authoritative runtime lifecycle
cluster_workers                        capability, freshness, capacity
cluster_requirements / reservations    resource-aware claims
cluster_usage                          accounting
cluster_connectors                     Discover probe and checkpoint state
cluster_assets                         proof-gated Library registration
```

The implementation must preserve the public PR #41 behavioral contract:

* stable idempotent submission;
* capability and capacity-aware claims;
* worker heartbeats, leases, retries, and stale-worker visibility;
* attempt fencing for heartbeats, usage, lifecycle events, and registration;
* explicit progress only;
* archive proof before registry promotion;
* registration proof matching the declared output; and
* compatibility payloads for existing Discover, Resources, Synthesis, Library,
  and Detail | Ask consumers.

## Delivery order

Completed in this private branch:

1. Added namespaced `cluster_*` runtime tables beside legacy `jobs` and
   `events`, with no destructive schema migration.
2. Bound new legacy submissions to stable idempotent runtime runs and projected
   runtime facts through existing job payloads.
3. Routed controller execution through capability-aware claims, leases, attempt
   fencing, and truthful completion/registration stages. Browser work remains
   queued until a live browser-capable worker joins.
4. Corrected generic Drive-first collection ordering to validate, archive,
   verify, promote, read back the registry, then compact local staging.
5. Added a proof gate: only explicit matching manifest, archive, and registry
   read-back evidence can advance a run from `completed` to `registered`.
6. Added regression coverage for archive-before-promotion, metadata-only jobs,
   idempotency, capability mismatch, registration evidence, and expired lease
   retry with stale-attempt rejection.

Current local verification:

```text
208 passed, 9 deselected
```

The nine deselected tests are unrelated trading HMM tests. They require the
optional `hmmlearn` dependency, which is not installed in this runtime
environment.

## Remaining live-adoption gate

The code has not yet proven a real Windows/GDrive run. That needs the actual
worker hosts, authenticated worker transport, and the configured Drive remote:

1. Register one Windows worker with measured capabilities and capacity.
2. Run an approved public-source collection through its heartbeat/lease path.
3. Verify the archived bytes, registry read-back, Library readiness, and
   Resources/Synthesis projection from the same run ID.
4. Stop the worker heartbeat, confirm retry, and confirm the old attempt is
   rejected.

Do not mark this branch deployment-ready until those host-level facts are
captured. The existing HTTP router does not yet expose an authenticated worker
control-plane endpoint, so that transport must be introduced with a secret held
outside Git rather than opening worker claims to unauthenticated callers.
