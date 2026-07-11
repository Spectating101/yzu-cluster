# Discover Acquisition Lifecycle — visual notes

Backend status map (authoritative):

| Backend | User lifecycle | Terminal |
|---|---|---|
| `pending_approval` | Approval required | no |
| `queued` | Queued | no |
| `running` | Running | no |
| `failed` | Failed | yes |
| `completed` + no `registered_dataset_id` | Collection complete · Registration pending | yes |
| `completed` + `registered_dataset_id` | Registered in lab | yes |
| + catalog / result query readiness | In lab · Query ready | yes |

Linkage: exact `candidate_key` or exact `connector_id` only.

A4 handoff: terminal Registered / Query ready project usability (row, Can I use this?, counts/filters). Path stages come only from `lifecycle.stages`.

## Screenshots

### 01 — pre-submit acquisition available
- **Evidence:** no exact job
- **Decision:** acquire after probe
- **Primary:** Add to lab
- **Not claimed:** queued/running

### 02 — submitting
- **Evidence:** frontend submitting flag before job response
- **Decision:** wait; do not double-submit
- **Primary:** Submitting…
- **Not claimed:** queued before response

### 03 — approval required
- **Evidence:** `pending_approval`
- **Decision:** approve or track
- **Primary:** Review approval
- **Not claimed:** running

### 04 — queued
- **Evidence:** `queued`
- **Path:** Submitted + Queue only (Approval not reached)
- **Primary:** Track in Resources
- **Not claimed:** running / approval passed

### 05 — running
- **Evidence:** `running` + optional stage
- **Path:** Submitted → Queue → Running (Approval not highlighted)
- **Primary:** Track in Resources
- **Not claimed:** fake %

### 06 — failed
- **Evidence:** `failed` + error
- **Decision:** review failure
- **Primary:** Track in Resources
- **Not claimed:** acquisition available

### 07 — registration pending
- **Evidence:** `completed` without `registered_dataset_id`
- **Can I use this?:** Not yet reusable
- **Not claimed:** In lab / Query ready

### 08 — registered
- **Evidence:** `registered_dataset_id` without query-readiness evidence
- **Can I use this?:** Registered in lab (not External · Acquisition available)
- **Row / counts:** In lab · Registered · 1 in lab · 0 query ready · 0 external
- **Unknowns:** query path / freshness / schema — not endpoint-probe acquisition
- **Primary:** Open in Library
- **Not claimed:** Query ready

### 09 — query ready
- **Evidence:** `registered_dataset_id` + `result.query_ready` / `analysis_readiness: instant`
- **Can I use this?:** In lab · Query ready
- **Row / counts:** In lab · Query ready · 1 query ready · 1 in lab · 0 external
- **Unknowns:** freshness / caveats / schema — not source-endpoint or acquisition constraints
- **Primary:** Open in Library

### 10 — Resources deep-link
- **Evidence:** exact `job.id` row key `job-{id}`
- **Decision:** approve/operate in Resources

### 11–16
Tablet/mobile variants of running, failed, approval, registered / query ready.

## Gaps
- `output_manifest_id` usually null — kept null when absent
- Archive/GDrive completion is a follow-on job — not claimed as parent completion
- No Sharpe-Renaissance changes in this pass

## Scope
Sufficiency / Equivalence not started. Final Responsive not started.
Evaluation Surface visual language preserved.
