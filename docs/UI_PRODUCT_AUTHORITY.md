# Research Drive UI Product Authority

**Status:** CURRENT UX IMPLEMENTATION AUTHORITY  
**Date:** 2026-07-14  
**Applies to:** `drive/src/v2/*` and every faculty-facing Research Drive route  
**Implementation owner:** frontend and backend workers executing this document  
**Acceptance owner:** rendered workflow and pixel review  

This is the sole authority for Research Drive product composition, navigation, interaction grammar, visual direction, responsive behavior, and acceptance. No historical UX document, screenshot packet, runbook, component, or backend capability overrides this document.

## 1. Product promise

Research Drive is a research-evidence procurement workbench.

```text
research intention
→ external or local evidence
→ evidence sufficiency decision
→ bounded inspection
→ request / approval when appropriate
→ durable collection lifecycle
→ registered Library asset
→ reusable Synthesis input or output
```

It is not a generic Drive clone, a chat-first product, a data-engineering console, or a collection wizard.

## 2. Navigation and application grammar

The only navigable faculty destinations are:

```text
Home · Library · Discover · Synthesis · Resources · Profile · Settings
```

These are not destinations: Cluster, Activity, Pipeline, Sources, Vault, Preview, Approval, route comparison, failure, registration, or job execution.

The application grammar is fixed:

```text
Navigation: where am I?
Centre: what evidence or research object am I working with?
Detail / Ask: what does it mean, and what is the valid next action?
```

Use the same grammar everywhere. A page does not become a new product merely because its centre object changes.

## 3. Visual direction

```text
Quiet paper shell
+ graphite evidence surfaces when density is useful
+ ink reasoning rail for an active object or Ask
+ cobalt only for selection and meaningful action
```

- Home, Profile, and general workspace are quiet and editorial.
- Library, Discover, Resources, and Preview use compact, inspectable evidence surfaces.
- The rail is quiet when no evidence object is active. It becomes the ink interpretation surface for a selected candidate, asset, blueprint, capability, or Ask.
- The rail must never be a permanent empty inspector.
- The desktop desk is full-height: navigation/context at left, sustained evidence work in centre, decision interpretation at right, and a narrow operational status edge at bottom.

## 4. Active research context

There is one active research object.

```text
Active research
+ emphases
+ themes
+ entities / markets
+ evidence preferences
```

These are attributes of the active research object, not a second navigation system. Profile makes the inputs visible and editable. Discover and Ask must explain recommendations using named context signals.

## 5. Page ownership

| Page | Centre owns | Detail / Ask owns |
|---|---|---|
| Home | research intention, needs-you items, resume points | active research context and optional Ask |
| Library | durable lab assets | selected asset readiness, provenance, preview, reuse |
| Discover | external evidence and durable lifecycle | selected source or request decision |
| Synthesis | blueprints, input readiness, verified outputs | selected blueprint/output and gap action |
| Resources | source capabilities and constraints | selected capability interpretation |
| Profile | research context and its ranking impact | why context affects recommendations |
| Settings | workspace/session preferences | contextual help only |

## 6. Home

Home answers:

```text
What needs attention?
What can I resume?
What can I start?
```

It contains research-intention entry, a concise needs-you queue, and exact resume points. It is not a metrics dashboard, a full catalogue, a worker monitor, or a generic chat landing page.

## 7. Library

Library answers:

```text
What durable evidence does the lab own, and can I reuse it now?
```

The centre is collections and assets. Detail shows readiness, research use, provenance, and next action. Preview is contextual. Library may offer add-evidence intake only when it performs real intake or is explicitly labelled assisted intake; filename-only chat prompts are not uploads.

Canonical readiness labels are:

```text
Metadata only
Registered
Query-ready
Unavailable / not verified
```

## 8. Discover

Discover answers:

```text
What external evidence could answer this research need?
```

Discover has exactly two internal modes:

```text
Explore | History
```

### Explore

Explore is search-first. Unselected rows contain only source identity, provider, grain/type, access state, and verified availability hints. They do not contain row-level ranking controls, collection controls, local-estate badges, or Ask buttons.

Selection leaves the result list in place and drives Detail. Detail owns:

```text
why relevant
local sufficiency
verified facts
unknowns
one primary next action
up to two secondary actions
```

### Local sufficiency

The domain contract preserves five semantic states:

| State | Meaning | Likely primary action |
|---|---|---|
| Exact | canonical qualifying local asset exists | Open in Library |
| Partial | known local subset and named gap | Compare or Preview |
| Related | same research object; equivalence unproven | Preview source |
| No local alternative | completed comparison found no qualifying asset | Preview / request / access action |
| Comparison unknown | comparison could not complete from available evidence | Preview / probe source |

`No local alternative` and `Comparison unknown` are distinct domain states. The UI may visually compress them only if their explanation and valid next action remain unambiguous. `likely-equivalent` is unsupported unless a durable backend contract is added.

### History

History is the durable researcher lifecycle inbox:

```text
Needs you · Active · Ready · Needs recovery · Scheduled
```

It compresses plan, revision, approval, job, archive, manifest, promotion, and registry read-back into human decisions. Detail can disclose technical records. History is not a worker dashboard.

## 9. Preview

Preview is a centre-scoped evidence overlay, not a route and not a full-app blocking modal.

```text
Navigation | active preview evidence | active Detail / Ask interpretation
```

The centre renderer adapts to source type:

| Type | Evidence object |
|---|---|
| Dataset/API | bounded rows, observed fields, coverage evidence, access condition |
| Paper | title/abstract, research question, method, cited claims, replication/access state |
| Filing | issuer/type/period, authenticity, relevant sections, source-linked facts |
| Web | page identity, excerpt, publisher/time, source-linked facts, retrieval limits |

Preview separates observed evidence from facts not established by the preview. If preview is unavailable, Detail explains why and offers the valid alternative; no empty preview overlay appears.

## 10. Approval and lifecycle

Approval is a contextual confirmation modal. It shows the immutable request: source, route when applicable, scope, entity/field selection, destination, observed evidence, and constraints.

A request proceeds through durable lifecycle state and returns to Library only after archive and registry authority are present. Registration and query readiness are separate claims.

Auto-approved public paths must visibly state their policy basis. Ask cannot approve irreversible operations.

## 11. Synthesis

Synthesis is blueprint/recipe oriented:

```text
registered inputs
→ defined blueprint
→ visible input readiness and gaps
→ explicit build / refresh
→ verified durable output
```

Viewing a blueprint is read-only. Build or refresh is an explicit mutation with a receipt. A missing input creates an exact Discover handoff with the required grain, variables, coverage, and existing inputs.

## 12. Resources

Resources answers:

```text
What evidence capabilities and constraints can this lab currently use?
```

It is a source capability map: provider, evidence type, access state, checked/freshness state, supported research use, and meaningful constraint. It is not the primary jobs, worker, spend, or operational ledger surface.

`Explore source` opens Discover with source and access context.

## 13. Profile and Settings

Profile exposes active research inputs and their ranking effects. An unbound/pilot profile is visibly labelled as such in centre, Detail, Ask, recommendations, and handoffs.

Settings controls workspace/session preference, notifications, and truth-backed connection status. Static “configured” strings are not provider health.

## 14. Detail and Ask

```text
DETAIL
- 2–3 identity/status lines
- one judgement
- no more than five visible facts
- no more than three unknowns
- one optional disclosure
- one primary and up to two secondary actions

ASK
- typed current page/tab/object context
- stated evidence scope
- named tool activity
- typed artifacts: sources, assets, preview facts, request receipts
- source identity + retrieval/observation time + verification state
```

Ask is an accelerator, never a dependency. The ordinary UI must still make evidence fit, local sufficiency, preview, request, approval, lifecycle, and reuse understandable. Ask may open deterministic UI intents such as Open asset, Open source, Open Preview, or Open History item. It must clear stale object context on page transitions.

## 15. Truth, freshness, and authority

Every visible claim requires an authority and freshness state.

| Claim | Authority | Fallback |
|---|---|---|
| Coverage | provider metadata or observed response | Not reported |
| Preview evidence | bounded observed response | Preview unavailable |
| Local relationship | completed comparator | Comparison unknown |
| Readiness | registry read-back | Registered — readiness not confirmed |
| Access | entitlement/provider state | Access not verified |
| Lifecycle | durable job/activity record | Status unavailable |
| Archive | archive/manifest verification | Archive verification pending |
| Registration | promotion/read-back | Registration pending |
| Ranking | named ranking signals | Why ranked unavailable |
| AI evidence | source/time/verification envelope | Assistant interpretation — verify source |

No demo fixture, stale cache, UI estimate, or model prose may render as a live authoritative fact.

## 16. Exact handoffs

```text
Discover Exact → Library exact asset
Discover registered result → Library exact asset
Discover registered result → compatible Synthesis blueprint
Library evidence gap → Discover prefilled gap query
Synthesis input gap → Discover requirement + existing inputs
Resources capability → Discover provider/access constraint
Profile explanation → Discover named ranking signals
```

Every handoff opens an exact object or prefilled query—not a landing page.

## 17. Responsive and accessibility requirements

- Desktop maintains full-height navigation, evidence centre, and active rail.
- Tablet may reduce rail width but must preserve selected-object meaning and primary action.
- Mobile sequences context rather than duplicating it; selected evidence and Detail become a clear drill-in, not a compressed three-column view.
- Preview supports Escape, focus management, labelled source identity, and an accessible close action. A centre-scoped overlay must not falsely claim `aria-modal=true` while the rail remains interactive.
- Keyboard users can search, move through evidence rows, inspect selection, open Preview, and access primary actions.

## 18. Implementation and acceptance order

```text
1. Restore Discover Explore | History and selected-source Detail composition.
2. Make Preview centre-scoped, source-type specific, and accessible.
3. Wire durable History, five-state sufficiency, and exact handoffs.
4. Add typed Ask evidence envelopes and stale-context clearing.
5. Separate Synthesis reads from execution.
6. Render desktop/laptop/mobile states and review pixels before additional redesign.
```

Required journeys:

```text
Exact local match
Partial local match
No preview / constrained source
No local alternative
Comparison unknown
Approval → registered asset → Synthesis reuse
Failure → safe recovery
Ask-assisted and non-Ask parity
```

## 19. Documentation hierarchy

1. This file is the sole current UX/product authority.
2. `UI_IMPLEMENTATION_PROGRAM.md` is the execution plan derived from this authority.
3. `RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md` is a subordinate typed rail/backend contract.
4. `DISCOVER_ACQUISITION.md` is a subordinate operational runbook.
5. `DISCOVER_E2E_AUTHORITY_AUDIT.md` is the subordinate Discover Playwright classification and clean-audit contract. It does not amend product composition; it governs how E2E reds are interpreted (CURRENT AUTHORITY FAILURE vs LEGACY EXPECTATION vs SELECTOR DRIFT vs ENVIRONMENT FAILURE) and requires git SHA / Vite root identity on every report.
6. `RESEARCH_DRIVE_UI_CANON.md`, `RESEARCH_DRIVE_UI_V2.md`, `RESEARCH_DRIVE_UX_HANDOFF_2026-07-14.md`, and `design/DISCOVER_LOOP_ANCHOR.md` are historical redirects only.
7. `RESEARCH_DRIVE_UI_CONTRACT.md` is legacy-only until its legacy UI and tests are retired.

Any proposed interface change must amend this document first, then update the implementation program and subordinate contracts. Discover E2E rewrites must stay consistent with this file and update `DISCOVER_E2E_AUTHORITY_AUDIT.md` classification tables in the same change.
