# Research Drive right rail integration contract

**Status:** Active typed rail/backend contract  
**Authority:** Subordinate to [`UI_PRODUCT_AUTHORITY.md`](UI_PRODUCT_AUTHORITY.md) and, for Discover composition, its incorporated appendix [`DISCOVER_FULL_SCALE_FREEZE_2026-07-15.md`](DISCOVER_FULL_SCALE_FREEZE_2026-07-15.md)  
**Scope:** v2 interface and integration: `src/v2/InspectorRail.jsx`, `src/v2/DetailPanel.jsx`, `src/v2/RailPanels.jsx`, `src/v2/AskRail.jsx`, `src/v2/api.js`, active-object adapters, Discover lifecycle projection

The right rail is the product spine. The main tabs are lenses over the same research desk; the rail is where the selected object becomes usable, explainable, and actionable.

This contract exists to stop the repo from drifting back into separate products: Drive clone, chat app, ops dashboard, procurement wizard, or a centre workspace that duplicates Detail.

---

## 1. Product rule

Every professor-facing feature must answer one question first:

> What exact object is selected, and what should Detail or Ask do with that same object?

If a feature cannot produce a typed rail object, it is not ready for the main desk UI.

| Stable concept | Rule |
|----------------|------|
| Rail width | Desktop target remains a substantial interpretation rail; exact pixel width follows the rendered authority. The rail is not a skinny helper drawer. |
| Rail height | Exactly the app viewport/shell height. Rail content never stretches the page. |
| Rail modes | Exactly **Detail** and **Ask**. One visible pane; both may remain mounted. |
| Detail | Structured truth and current decision for the exact selected object. |
| Ask | Composer + direct equipment paths scoped to the same selected object. |
| Navigation | Defined exclusively by `UI_PRODUCT_AUTHORITY.md`. |
| Not tabs/pages | Ask, Pipeline, Vault tree, Source, procurement method, approval, route investigation. These are rail modes, detail fields, or lifecycle states. |

Legacy `src/main.jsx` still contains historical concepts. Treat that as cutover debt only. New work uses `src/v2/*` and `Detail | Ask`.

The compounding loop is binding:

```text
Centre
object + state

        ↓

Detail
meaning + current decision

        ↓

Ask
investigate / reason / operate

        ↓

Durable backend consequence

        ↓

Centre
visible state changes

        ↓

Detail
new judgment / next decision
```

---

## 2. Rail viewport and density contract

```text
┌───────────────────────────────┐
│ FIXED IDENTITY / STATE        │
├───────────────────────────────┤
│                               │
│ BOUNDED SCROLL BODY           │
│                               │
│                               │
├───────────────────────────────┤
│ STICKY DECISION / ACTION      │
└───────────────────────────────┘
```

Implementation requirements:

```text
rail shell
height: app shell / viewport height
min-height: 0

identity header
fixed within rail layout

scroll body
min-height: 0
overflow-y: auto

footer/action area
sticky or fixed within rail
remains visible while body scrolls
```

Default Detail budget:

```text
identity / state
2–3 lines

primary judgment
max 3–4 lines

active decision module
state-specific

known facts
prefer 3; maximum 5

unknowns
maximum 3

one disclosure
Technical record ▸

sticky actions
1 primary
maximum 2 secondary
```

Maximum default modules: five.

The rail is a decision instrument, not a report. Do not create separate `Current decision`, `Execution`, `Evidence`, and `What happens next` sections when they restate the same state and action.

`Technical record ▸` is the one default disclosure. Expanded technical chronology/IDs remain inside the bounded scroll body; the sticky action footer remains visible.

---

## 3. Rail context envelope

The UI maintains one explicit rail context object and sends the structured envelope to chat as `rail_context`.

Generic shape:

```json
{
  "tab": "discover",
  "mode": "detail",
  "entity": {
    "kind": "external_candidate",
    "id": "source:bigquery:usdt",
    "title": "Ethereum / USDT history"
  },
  "selected": {},
  "evidence_scope": {},
  "lifecycle": {},
  "procurement_method": {},
  "dataset_id": "",
  "folder_id": "",
  "vault_path": "",
  "search_query": "",
  "profile_email": "drkong@saturn.yzu.edu.tw",
  "readiness": "",
  "actions": []
}
```

Rules:

- `Detail` renders canonical fields from structured state, not assistant prose.
- `Ask` receives the same exact context and may use it to choose supported equipment/tools.
- The UI must not expose MCP protocol names to the professor except in developer/admin diagnostics.
- If the selected rail object changes, switch to `Detail` unless the user explicitly invoked an Ask action on the new object.
- If an action needs Composer/Ask, switch to `Ask` and submit from the same object context.
- Page, mode, and selected-object transitions must clear stale object context before Ask can act.
- Explore and History selection state are stored separately; restoring one must not leak the other into `rail_context`.

---

## 4. Entity contracts

| Entity kind | Produced by | Detail must show | Ask / primary operations |
|-------------|-------------|------------------|--------------------------|
| `dataset` | Home, Library | title, readiness, source, coverage, grain, join keys, provenance/vault, limitations | Preview, Ask, exact reuse handoffs |
| `external_candidate` | Discover Explore | selected source identity, fit judgment, local sufficiency, verified candidate facts, unknowns, access/acquisition constraint | assess, probe, preview, request evidence, schedule supported refresh, compare local gap |
| `discover_lifecycle` | Discover History | lifecycle state/reason, decision ownership, evidence need, current durable evidence, method state when material, knowns/unknowns, current decision | investigate route, explain/review/revise method, view evidence, supported execution/schedule actions, exact handoffs |
| `preview_target` | Discover/Library Preview | bounded observed evidence scoped to parent candidate/lifecycle/dataset | ask about observed evidence, return to parent object |
| `cluster_compare` | Operational compatibility context only; not faculty navigation | datasets compared, shared keys/date coverage, only-A/only-B gaps, honesty note when unknown | ask about overlap, open dataset |
| `resource_row` | Resources | measured value, status, source endpoint, last refresh, related capability/job if any | explain, view activity where supported, supported operational action; acquisition decisions route to Discover |
| `profile_scope` | Profile | affiliation, tracks, holdings/gaps, pinned corpora | Ask with this scope, edit profile |
| `settings_account` | Settings | email, credentials summary, notification prefs | Save, test connection, ask setup |
| `empty_page` | no selection | page summary and next useful selection | optional Ask |

Do not build page-local detail workspaces that duplicate the rail. In particular, Discover selection must not replace the ranked result list with a full Focused Evaluation centre workspace.

---

## 5. Discover `external_candidate` contract

Explore centre owns the ranked evidence landscape. Selecting a row leaves the list visible and binds:

```text
kind = external_candidate
```

Required context envelope:

```text
entity
kind
id
title

selected
source_id
connector_id
candidate_key
endpoint / source URL when authoritative

query_interpretation / evidence_scope
research object
evidence need
analytical use
coverage constraints
preferred fields

candidate_evidence
grain / evidence shape with authority
coverage with authority
subjects with authority
access with authority
preview state

local_relationship
Exact | Partial | Related | No local alternative | Comparison unknown
comparator authority

match
named signals
score when authoritative
explanation derived from typed facts

available operations
preview
probe
request_evidence
open_local / compare when supported
schedule_refresh when supported
ask_about
```

Detail owns selected-source interpretation. Ask may investigate or operate the same candidate.

A durable Ask mutation produces a compact receipt and refreshes centre state, for example:

```text
✓ Evidence request recorded
✓ Schedule recorded
```

---

## 6. Discover `discover_lifecycle` contract

History selection must produce a first-class lifecycle rail object. `selectedHistoryId` without a bound active object is not sufficient.

Conceptual context:

```text
object

kind = discover_lifecycle
id = intent_...
title = Historical USDT transactions


lifecycle

state = active
reason = route_investigating
decision_owner = system
decision_reason = null
status_label = ROUTE INVESTIGATING


evidence_need

object = stablecoin transfers
coverage = before 2020
preferred_fields = entity identifiers, transaction identifiers


source

source_id
connector_id
candidate_key


procurement_method

state = investigating
kind = null
method_id = null
equipment = []
engine = null


evidence_state

preview_retained = true
archive = pending / confirmed / unknown
registration = pending / confirmed / unknown
readiness = query_ready / unconfirmed / unavailable / unknown


available_operations

investigate_route
probe_source
test_supported_route
propose_method
schedule_refresh
return_to_source
```

Method review example:

```text
lifecycle
state = needs_you
reason = method_review
decision_owner = researcher

procurement_method
state = review_required
kind = browser_extract
equipment = spectator
engine = playwright
method_id = method_...

available_operations
explain_method
review_method
revise_method
return_to_source
```

The semantic fields are binding even if exact JSON names adapt to backend conventions.

The frontend must not infer final lifecycle state, method truth, or available operations from free-form status regex once normalized backend projection exists.

---

## 7. History projection and decision ownership

History consumes one researcher-facing lifecycle projection, not raw event kinds.

```text
intent
proposal / route
Discover-linked job
archive / manifest
promotion
registry read-back
subscription

        ↓

HISTORY LIFECYCLE PROJECTOR

        ↓

one discover_lifecycle object
```

Required semantic axes:

```text
lifecycle_state
active | ready | needs_recovery | scheduled

decision_owner
researcher | system | none
```

`Needs you` is projected when `decision_owner = researcher`.

One evidence request remains one primary lifecycle object as it progresses through route investigation, method review, collection/extraction, schema review, archive, registration, and readiness.

Do not map generic `completed` directly to `ready`.

---

## 8. Procurement-method rail contract

Hard procurement is represented through a typed method attached to `discover_lifecycle`.

Method semantic state:

```text
investigating
proposed
review_required
approved
queued
executing
revision_required
completed
```

Method kind:

```text
api_query
http_manifest
browser_extract
scraper_run
custom_connector
```

Equipment and engine are named only when durable authority establishes them.

Detail method-review example:

```text
HISTORICAL USDT TRANSACTIONS
METHOD REVIEW

Browser extraction proposed

WHY THIS METHOD
Direct collection did not establish
the required historical records.

METHOD
Browser extraction
Spectator · Playwright

ROUTE
1 Open historical archive
2 Traverse periods
3 Traverse stablecoin records
4 Extract required transfer fields

KNOWN
✓ direct route checked
✓ browser route observed
✓ bounded route tested

UNKNOWNS
? traversal completeness
? session stability
? final extraction volume

Technical record ▸

─────────────────────────────
[ Review method ]

Ask about method
Return to source
```

Centre shows only the material cue:

```text
Browser extraction proposed
```

The method does not become a page or a permanent worker-configuration block.

---

## 9. Ask operating contract

Ask is the operating intelligence of the selected object, not a generic chat sidecar.

Ask receives:

```text
exact selected entity
current page / mode
current lifecycle and decision ownership
stated evidence scope
candidate/source authority
procurement method when present
supported operations
```

Ask may:

- explain current structured state;
- investigate source/acquisition constraints;
- run supported direct equipment paths;
- perform bounded probes or route tests;
- propose or revise procurement methods;
- schedule supported refresh behavior;
- create durable evidence requests;
- queue or operate supported collection paths;
- open deterministic UI intents.

Ask may not:

- create candidate facts from prose;
- invent legal clearance or entitlement;
- invent equivalence or query readiness;
- silently approve irreversible operations;
- act on stale Explore context while a History lifecycle object is selected.

Active tool activity may be compact and evolving. Completed activity collapses by default; optional `Agent activity ▸` may disclose it.

Successful mutations return compact product receipts:

```text
✓ Evidence request recorded
✓ Procurement method prepared
✓ Schedule recorded
✓ Collection queued
✓ Method revised
```

`useAskChat`/frontend refresh behavior must turn those durable consequences into visible centre and Detail state; a toast alone is not product completion.

---

## 10. Backend mapping

Use `/library/*` for new integrations. `/yzu/*` remains a compatibility surface when no `/library/*` route exists yet.

| UI need | HTTP route / contract | Notes |
|---------|-----------------------|-------|
| Library list | `GET /datasets` | Registry-backed list. Frontend never reads registry JSON directly. |
| Dataset detail | `GET /datasets/{id}` | Drives dataset Detail. |
| Preview rows | `GET /query/{id}?limit=50` or typed Preview contract | Centre overlay; does not navigate away. |
| Discover Explore | `/library/discover/sources` / current Explore source contract | Produces typed external candidates. |
| Discover History | `/library/discover/history` / lifecycle projector | Must converge from raw intent/subscription/collection-run compatibility feed to one lifecycle object per evidence request. |
| Ask rail | `POST /library/chat/stream` | Composer/direct equipment + typed `rail_context`. |
| Fallback chat | `POST /library/chat` | Same brain, non-streaming fallback. |
| Jobs | `GET /library/jobs`, approval/action routes | Jobs are internal durable machinery; History projects researcher-facing lifecycle. |
| Resources | `GET /library/desk/resources`, `GET /library/ops` | Capability/usage/method truth as owned by Resources authority. |
| Acquisitions | `GET /yzu/acquisitions` | Compatibility until folded into `/library/*`. |
| Profile | `GET /library/faculty/profile?email=` | Ranking and Ask context. |
| Warm session | `POST /library/desk/warm` | Prime Composer and vault brief. |

Text `[context: ...]` prefixes are compatibility only. Structured rail context is the authority target.

---

## 11. Composer and direct-equipment procurement path

The rail does not implement a Python planner in React. Composer reasons over typed context; direct equipment paths may bypass Composer when the action is explicit and safe to dispatch.

Conceptual procurement path:

```text
selected candidate / lifecycle object
  → local registry / source facts / comparator context
  → known direct route when established
  → bounded probe when route is not established
  → procurement-method investigation
  → direct API / HTTP manifest / query route / browser extraction / scraper route / custom connector proposal
  → review when decision ownership belongs to researcher
  → execution
  → archive verification
  → promotion / registry read-back
  → readiness truth
```

Professor-facing copy says `Ask`, `Request this evidence`, `Review method`, `Preview source`, `History`, `Library`, and `Resources`. It does not expose MCP protocol names or internal planner modules.

---

## 12. Tab grounding

| Tab | Main canvas owns | Rail Detail owns | Ask owns |
|-----|------------------|------------------|----------|
| Home | intention, needs-you, continue/recent | selected attention/research context | resume or investigate exact selected work |
| Library | collections + durable assets | selected asset truth and reuse | questions/operations scoped to selected asset or intake object |
| Discover Explore | ranked external evidence landscape | selected candidate fit, local relationship, facts, unknowns, decision | investigate/probe/request/schedule supported operations on selected candidate |
| Discover History | priority + compact lifecycle ledger | selected lifecycle state, evidence need, material method, current decision | investigate/operate exact lifecycle object |
| Synthesis | blueprints, readiness, outputs | selected blueprint/output and gap | blueprint/output-scoped explanation and supported action |
| Resources | capability, consumption, method topology | selected capability/metric/node interpretation | explain exact resource object and supported operation |
| Profile | research context | selected scope/ranking effect | ranking/procurement with that profile context |
| Settings | preferences and credential summaries | contextual help | setup help only |

---

## 13. Visual direction

Preserve:

- a dense, stable rail that explains the exact selected object;
- a stronger instrumental character than the centre without turning the app into a dark ops console;
- provenance/authority/readiness evidence when it is part of the current decision;
- sticky primary action and restrained secondary actions;
- cobalt only for selection and meaningful action.

Drop:

- full-screen terminal styling;
- generic assistant cards;
- duplicate navigation trees;
- page-local detail workspaces that eat the rail's job;
- vertically unbounded report-like rail modules;
- permanent execution timelines after completion.

---

## 14. Upgrade rule

New capabilities attach to a typed object/rail contract before they become navigation:

| Capability growth | Where it appears first |
|-------------------|------------------------|
| New data source | Discover row + `external_candidate` Detail |
| New procurement route/engine | `discover_lifecycle.procurement_method` + material centre cue + Detail |
| New collected dataset | Library row + `dataset` Detail |
| New worker/job type | backend machinery; Resources capability/method where faculty-relevant; History only through lifecycle projection |
| New profile signal | Profile scope + Ask context |
| New storage tier | Resources storage/method truth + asset provenance |
| New query backend | Dataset readiness + Preview/Detail truth |

If a feature needs its own full page, prove why the typed object and rail are insufficient and amend the product authority first.

---

## 15. Acceptance checklist

- [ ] Every faculty destination uses the same `InspectorRail` grammar.
- [ ] Rail height is bounded to the app shell; body scrolls internally; action footer remains visible.
- [ ] Selecting an Explore candidate switches rail to `Detail` and leaves ranked results visible.
- [ ] Explore selection binds `external_candidate` context.
- [ ] Switching to History clears stale Explore active context.
- [ ] Selecting a History row binds `discover_lifecycle` context and switches to `Detail`.
- [ ] Detail/Ask toggles preserve exact object identity.
- [ ] Search/Ask/request actions use the same selected context.
- [ ] `Ask` persists session state without acting on stale object context.
- [ ] `Detail` does not rely on Composer prose for canonical fields.
- [ ] History lifecycle state is backend-projected; final frontend does not own state through regex bucketing.
- [ ] Procurement method is visible when material and hidden when routine/irrelevant.
- [ ] Completed Ask activity collapses by default; durable mutation returns a product receipt.
- [ ] A receipt-triggered refresh produces visible centre/Detail state change.
- [ ] No v2 UI revives Activity, Pipeline, Source, or Focused Evaluation as faculty composition.

### Current v2 entity additions

The rail contract also supports `synthesis_recipe` and `synthesis_output`. Detail receives selected blueprint/output identity, input readiness, gap identities, output authority, and allowed UI intents. Ask receives the same typed context plus evidence scope; it must not fall back to a generic `Synthesis studio` prefix.

The rail is visually intense only for an active evidence object or Ask. It must not impose a permanent empty inspector on an idle page.