# Discover Local Sufficiency — visual notes

## Backend comparison-contract audit (summary)

Inspected Sharpe-Renaissance `/library/discover`, `/library/search`, registry, and Composer soft hits.

| Signal | Authority | Sufficiency use |
|---|---|---|
| `dataset_id` / `doi` / `candidate_key` | Registry + stamp | **Exact local match** |
| `source_system` / `source` / `source_id` | Registry / row | Related / partial basis |
| `join_keys` | Registry | Related / partial basis |
| `grain` | Registry (stripped from discover HTTP; available via `/datasets`) | Named partial gap when both sides present |
| `coverage` / temporal fields | Sparse on registry; present on some discover fixtures | Named partial gap when both sides present |
| `score` / `score_pct` / title tokens | Lexical rank | **Not used** |
| `index_miss` / `weak_match` / `strong_local_hit` | Query↔catalog soft miss | **Not** candidate sufficiency |
| Explicit `equivalent_dataset_id` / backend `local_comparison` | Optional | Exact / likely-equivalent only with explicit basis |

**Honestly supportable now:** exact-local, partial-local, related-local, no-local-alternative, comparison-unknown.

**Intentionally unsupported:** `likely-equivalent` (no canonical family/series equivalence contract). Screenshot **06 omitted**.

No backend commit in this pass — comparison runs client-side against the lab `/datasets` catalog via `discoverSufficiency.js`. Optional `row.local_comparison` is accepted when present.

## Screenshots

| # | State | Evidence | User decision | Primary action | Claim not made |
|---|---|---|---|---|---|
| 01 | Browse exact | same `dataset_id` | Use lab asset | Open local (on focus) | Equivalence from title |
| 02 | Browse partial | same source family + temporal gap | Inspect gap / maybe acquire | Source actions | Exact match |
| 03 | Browse related | same source + join keys, no gap | Inspect related | Source actions | Equivalent |
| 04 | Browse none | source identity searched, no lab hit | Acquire path remains | Source actions | “Does not exist in lab forever” |
| 05 | Focus exact | canonical id | Use lab | Open local dataset | Need to collect |
| 07 | Focus partial temporal | coverage local vs candidate | Understand gap | Probe/Add remain | Exact / equivalent |
| 08 | Focus partial grain | week vs day | Understand grain gap | Probe/Add remain | Equivalent |
| 09 | Focus related | same family | Inspect related | Inspect secondary | Equivalent |
| 10 | Focus none | completed empty compare | Ordinary acquire | Probe/Add | Unknown |
| 11 | Focus unknown | thin URL-only hit | Do not treat as none | Ordinary | No alternative found |
| 12 | Partial + Ask | Ask support rail | Ask with structured context | — | Related→Equivalent upgrade |
| 13 | Running + partial | lifecycle overrides | Track running job | Lifecycle primary | Sufficiency decides collect |
| 14 | Back | browse line preserved | Continue browsing | — | — |
| 15–18 | Tablet/mobile | same states | Same decisions | — | Final responsive polish |

## Scope

- Composition not redesigned
- Lifecycle / Evaluation / D0 / D1 semantics unchanged
- Final Responsive not started
