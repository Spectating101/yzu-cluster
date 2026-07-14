# Research Drive UX capability handoff

## Purpose

This is the working direction for the Research Drive faculty-facing interface. It records the decisions reached during the UX assessment, the real implementation constraints discovered in the current code, and the gaps that must be closed before calling the product capability-complete.

## Non-negotiable information architecture

Research Drive has exactly seven navigable destinations:

```text
Home · Library · Discover · Synthesis · Resources · Profile · Settings
```

Everything else is contextual application state:

```text
Discover: Explore | History tabs
Preview: overlay popup, like Drive file preview
Filters: popover
Detail and Ask: persistent right rail tabs
Approval: modal
Collection, registration, recovery: row/detail states in Discover History
```

Do not create permanent Acquisition Plan, Preview, Approval, Route Comparison, Failure, or Registration pages. Backend lifecycle complexity should become visible only when it changes the researcher’s next decision.

## Product identity

Research Drive is a research-evidence procurement workbench:

```text
research question
→ find external evidence
→ determine local sufficiency
→ inspect bounded evidence
→ request/approve when appropriate
→ track durable lifecycle
→ reuse registered asset in Library and Synthesis
```

It is not a generic Drive clone, a chat application, a data-engineering operations console, or a static source catalogue.

## What already exists

The current implementation already supports meaningful parts of this model:

- Library is registry-backed and can load a selected dataset and bounded query preview.
- Discover performs registry, curated-catalogue, semantic, and web discovery; it can probe and submit collection jobs.
- A persistent Ask rail streams through Cursor Composer plus the research-procurement MCP server.
- The backend has job, approval, archive, registry-promotion, capability, resource, profile, and synthesis mechanisms.
- Discover has an intended durable history endpoint and Synthesis has profile/engine support.

The gap is primarily capability exposure, truthfulness, handoff quality, and page/rail context—not a lack of backend ambition.

## Known implementation mismatches

These are verified current issues that future work must address:

1. Global UI bootstrap can substitute demo catalogue/health data after failures; the UI must visibly distinguish `Synced`, `Cached`, `Demo`, `Offline`, and `Unknown`.
2. Library intake currently converts selected filenames, URL, and procure actions into Ask prompts rather than a real intake flow.
3. Discover History does not currently consume the dedicated durable history endpoint.
4. Source Detail has more candidate/probe data than Ask context receives.
5. Synthesis profile viewing can cause execution because a read-like endpoint may run on a cache miss; read and build must separate.
6. Synthesis selected profile/detail is not a first-class shared rail context.
7. Resources exposes a cached rollup and can blur capability, operational jobs, and provider truth.
8. Profile can be a generic fallback while appearing bound to a faculty record.
9. Ask has structured context and tools but no universal claim citation/verification envelope; stale selected-object context can survive unrelated page transitions.

## Page contracts

### Home

Home answers: **What needs attention, what can I resume, and what can I begin?**

It contains a research-intention entry, durable attention items, exact recent assets/outputs, and short research-start prompts. It must not become a metric dashboard or show synthetic activity as real lab work.

### Library

Library answers: **What durable evidence does the lab own, and can I reuse it now?**

It contains collections, asset list, readiness states, selected-asset Detail, provenance, preview popup, Synthesis handoff, and contextual external-search handoff. It is not a generic file manager unless actual file-management operations are implemented.

### Discover

Discover answers: **What external evidence could answer this research need?**

`Explore` is a source catalogue/search surface. The selected source rail states research fit, source/provider/grain, access truth, local relationship, named uncertainties, and the next valid action. The source list must stay thin; do not repeat local-estate machinery in every row.

`History` is a concise durable lifecycle inbox: needs approval, active, ready, needs recovery, scheduled. Selecting an event drives Detail and Ask; History does not become an operations dashboard.

### Synthesis

Synthesis answers: **Which defined, reproducible output can the lab build from registered inputs?**

Preserve its profile/recipe orientation. The page needs explicit input readiness, exact output state, coverage gaps, and Discover handoff for missing evidence. Viewing a profile is read-only; Build/Refresh is explicit and produces a durable receipt.

### Resources

Resources answers: **What evidence capabilities and constraints are available to this lab?**

It presents source families, evidence grain, access state, authority/freshness, and research-relevant constraints. It links to Discover with source/access context. It must not duplicate Discover search or job-history review.

### Profile

Profile answers: **Which visible research preferences influence ranking and assistance?**

It shows research focus, markets/entities, evidence preferences, active work, and a ranking explanation. A fallback profile must be visibly unbound. Profile changes need real persistence if editing is offered.

### Settings

Settings answers: **Which application and desk behaviours apply to this session?**

It covers workspace preferences, Ask display, notifications, and truth-backed connection state. Static “configured” rows are not valid health signals.

## Detail and Ask contract

```text
DETAIL
- identity/status: 2–3 lines
- one main judgement
- no more than five visible facts and three unknowns
- one optional disclosure
- one primary and up to two secondary actions

ASK
- states selected page/tab/object and evidence scope
- streams named tool activity, not generic model theatre
- renders typed artifacts: source cards, result rows, preview facts, request receipts
- every evidence-bearing claim carries source identity, observation/retrieval time, and verification state
- can open deterministic UI actions but cannot approve irreversible operations
```

Ask is an accelerator, not a dependency. Every important journey must work without it.

## Local sufficiency contract

The selected external source must resolve to exactly one of:

| Relationship | UI outcome | Primary action |
|---|---|---|
| Exact | the same evidence already exists as a durable lab asset | Open in Library |
| Partial | named local coverage plus named external gap | Compare with lab asset |
| Related | shared subject/entity, insufficient evidence match | Preview source |
| Unknown | identity or coverage comparison unavailable | Preview source |

No collection CTA should be primary before this relationship is resolved.

## Preview contract

Preview remains one overlay model, but it must have source-type renderers:

| Source type | Centre evidence |
|---|---|
| Dataset/API | bounded rows, observed fields, coverage evidence, access condition |
| Academic paper | title/abstract, research question, method, datasets used, quoted claims, replication state |
| Filing | issuer/type/period, authenticity, relevant sections, extracted source-linked facts |
| Web source | page identity, excerpt, publisher/time, structured source-linked facts, retrieval limits |

The rail interprets the preview. It does not repeat the evidence object. If preview is unavailable, no empty popup appears; Detail explains the reason and valid alternative action.

## Authority contract

Every visible claim needs an authority and fallback:

| Claim | Authority | Fallback |
|---|---|---|
| coverage | provider metadata or observed response | Not reported |
| readiness | registry read-back | Registered — readiness not confirmed |
| access | entitlement/provider state | Access not verified |
| lifecycle | durable job/activity record | Status unavailable |
| registration | promotion/read-back | Registration pending |
| ranking | ranking signals | Why ranked unavailable |
| Ask evidence | source + time + verification state | Assistant interpretation — verify source |

Do not render counts, percentages, cost, progress, schedules, or `Live` status without an authoritative payload.

## Required cross-page handoffs

```text
Discover exact match → Library exact asset
Discover registered result → Library exact registry asset
Discover registered result → Synthesis compatible profile with asset preselected
Library asset gap → Discover prefilled with missing grain/coverage/field/entity context
Synthesis gap → Discover prefilled with profile requirement and existing inputs
Resources source → Discover provider/access constraint context
Profile explanation → Discover profile signals and candidate query
```

A handoff must open the exact selected object or prefilled query, never the target landing page.

## Validation journeys

1. **Exact local match:** external candidate resolves to local asset; user does not create duplicate acquisition.
2. **Partial local match:** user sees the real local subset and external gap, previews candidate, then stops or requests it.
3. **No preview:** a constrained/licensed source remains understandable and presents an access/alternative action.
4. **Multiple routes:** a contextual comparison appears only for genuinely viable alternatives and preserves Discover state.
5. **Approval to reusable asset:** request → approval → History → archive/registration proof → Library → compatible Synthesis profile.
6. **Recovery:** a failure explains preserved evidence and safe retry/revision without backend terminology.
7. **Ask parity:** Ask explains ranking/uncertainty, while the same proof and actions remain visible without Ask.

## Highest-value implementation sequence

```text
1. Truth/freshness envelopes and source/asset readiness authority
2. Local sufficiency comparator and selected-source decision payload
3. Source-type Preview contract
4. Durable Discover History wired into centre, Detail, and Ask
5. Exact Library/Synthesis/Discover handoffs
6. Ask evidence envelope plus stale-context clearing
7. Synthesis read/build separation and profile-context persistence
```

No new permanent page is required for this sequence.

## Acceptance conditions

- Every important capability has a visible proof, resulting action, authority, and fallback.
- All seven journeys work without Ask and become easier with Ask.
- Preview covers table/API, paper, filing, and web evidence under one popup model.
- Discover preserves query, filters, selected candidate, scroll position, and Ask session.
- Read-only views never trigger collection or synthesis execution.
- No demo/cache/model text renders as live authoritative fact.
- Detail and Ask clear unrelated stale context on page transition.
