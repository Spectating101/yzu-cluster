# RC2-A — Live identity contract

**Cycle:** RC2 (product)  
**Depends on:** RC1 closed; Day-2 queue isolation recommended before relying on shared store

## Goal

One sanitized identity object that every desk surface can render without inventing readiness.

## Canonical fields

| Field | Meaning |
|---|---|
| `dataset_id` | Library / registry key |
| `registry_id` | Registry row id (often equals dataset_id) |
| `manifest_id` | Collection / output manifest |
| `job_id` | Legacy job id |
| `run_id` | Runtime run id |
| `attempt` | Fenced attempt |
| `worker_id` | Claiming worker |
| `readiness` | `registered` or `query_ready` only when true |
| `archive_verified` | GDrive proof flag |
| `registry_readback` | Registry read-back flag |
| `lifecycle` | Runtime stage |
| `legacy_status` | Compatibility projection (`completed` when registered) |

Reference sample (sanitized): `RC1_LIVE_PAYLOAD_IDENTITY.json` in this directory.

## Surface mapping

| Surface | Must show |
|---|---|
| Synthesis | Badge from `readiness` only; Registered ≠ Query ready |
| Resources | `worker_id`, `run_id`, lifecycle/usage for that job |
| Library | row keyed by `dataset_id` / `registry_id` / `manifest_id` |
| Detail \| Ask | selected asset = `dataset_id`; grounding cites archive+registry |
| Discover History | trail for `job_id` ending in completed/registered |

## Implementation order

1. Private read API (or MCP tool) returning the identity for a `dataset_id` / `job_id`
2. Public FE Resources + Library consumers of that shape
3. Discover History + Detail|Ask wiring
4. Only then: automatic `query_ready` promotion when query-engine checks pass

## Non-goals

- Replacing the private control plane with public mocks
- Showing Query ready for registered-only assets
