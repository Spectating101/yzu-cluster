# Research Drive frontend capability convergence — 2026-08-25

**Status:** working design authority for the current convergence branch  
**Baseline:** `work/chatgpt-final-convergence-20260825`  
**Rule:** the current UI is the implementation baseline. Historical wireframes, deleted components, screenshots, and commits are evidence-mines only. Nothing is restored wholesale.

## 1. Problem statement

Research Drive now has a backend that is materially more capable than the resting frontend communicates. The remaining frontend problem is not primarily API integration and it is not a reason to rebuild the shell. It is a capability-conversion and workflow-composition problem:

```text
backend capability
→ researcher-visible object
→ researcher-understandable meaning
→ legitimate action
→ durable consequence
→ visible changed state
→ next research surface preserves the same object and authority
```

A capability may be intentionally hidden, but it may not disappear accidentally.

The current shell remains authoritative:

```text
Navigation = where am I?
Centre = what evidence / research object am I working with?
Rail = what is true about it, what remains unresolved, what can legitimately happen next?
Ask = intelligence + supported operation on the exact object
Backend = durable consequence
Centre / rail = consequence becomes visible
```

No individual page is the design benchmark. The benchmark is the complete research loop: a durable research object should remain coherent while the researcher moves through evidence ownership, sourcing, construction, decision, execution, and reuse.

## 2. Two-pronged review

Every meaningful composition change is reviewed from two opposed perspectives.

### Insider

Goal: preserve and deliver the maximum legitimate value already present in the system.

For each backend capability, ask:

- Does the researcher know the capability exists when it matters?
- Can they understand what the backend established rather than merely see a status token?
- Can they invoke the legitimate next action?
- Does the durable consequence become visible in the same research workflow?
- Can provenance / authority be recovered later?
- Does moving to another surface preserve the research object and the reason for the handoff?

The Insider rejects interfaces that make Research Drive look like a generic Drive clone, dataset search page, chat sidebar, wizard, or worker dashboard when the backend can do materially more.

### Designer

Goal: make the same capability legible with the least cognitive and interaction burden.

For each Insider demand, ask:

- What is the current centre object?
- What decision is the researcher making now?
- What must scan in five seconds?
- What belongs only after selection?
- What belongs behind disclosure?
- What implementation machinery should never be visible?
- Is the user seeing a research workspace, or merely a backend state machine made visible?

The Designer rejects capability dumps, dashboard inflation, duplicate panes, metadata soup, rigid wizard chrome, and administrative navigation.

### Disposition

Every important capability receives one disposition:

```text
PRIMARY      always visible when it defines the current object / decision
CONTEXTUAL   visible only when relevant to the selected object / workflow
DISCLOSURE   inspectable proof, provenance, or technical detail
HIDDEN       implementation machinery whose researcher outcome is represented elsewhere
```

`HIDDEN` is allowed. `LOST` is not.

## 3. Current strengths that must survive

### Global shell

- Quiet paper centre + dark navigation + interpretive rail.
- Seven stable faculty destinations.
- Active research context remains visible without becoming a second navigation tree.
- Same-origin runtime and object-grounded backend contracts.
- Page families already share a recognizable material grammar; convergence must strengthen it rather than embed page-local mini-apps.

### Library selected asset

- Real query-ready preview / query actions.
- Readiness remains distinct from possession, registration, and verification.
- Scholarly works no longer pretend to have tabular join keys / fields.
- Source/provenance inspection is bounded rather than always expanded.
- Object-scoped Ask isolation.

### Discover active investigation

- One composer and `Explore | History` only.
- Held evidence, external offerings, and web context can coexist.
- Candidate lifecycle, probe, review, acquisition and History are real backend consequences.
- Synthesis evidence-gap handoff preserves the research requirement.

### Resources / Home

- Infrastructure is translated into research capacity / attention rather than exposed as worker-console plumbing.
- Home remains a resume / needs-attention surface instead of a metrics dashboard.

### Synthesis substrate

- Durable thread identity, held-evidence mapping, measured state, proposal hashes, researcher acceptance, approval, execution, registration, and Library handoff are real backend authorities.
- The frontend may reorganize these authorities, but must never collapse distinctions such as proposal ≠ accepted method, worker complete ≠ registered, or registered ≠ query-ready.

## 4. Current failure pattern

The frontend sometimes compresses backend capability into an overly small metaphor, or exposes backend authority too literally.

```text
backend: evidence estate + provenance + acquisition + verification + readiness + reuse
frontend failure: shelf / folder / dataset

backend: held evidence + federated discovery + qualification + acquisition engineering + lifecycle
frontend failure: search box / source list

backend: durable construction + evidence + measured choices + proposal + approval + execution + registration
frontend failure A: one static everything-at-once canvas
frontend failure B: rigid numbered wizard mirroring internal state
```

The answer is not to restore an old UI and not to invent a new shell. Retain current truth and interaction semantics while increasing capability legibility and workflow continuity.

## 5. Cross-page composition rule

The desk has one consistent grammar:

```text
LEFT
location + durable research objects

CENTRE
current research work / evidence landscape

RIGHT
current truth + consequence + unresolved decision + next legitimate action + scoped Ask
```

The rail must not compensate for a weak centre, and the centre must not repeat a vertical report already present in the rail.

A useful test:

> If the rail were collapsed, would the researcher still understand what object/state they are working with and why Research Drive is useful?

A second test:

> If the centre were hidden, would the rail still identify the exact research object, its authority state, and the next legitimate action?

Both should be true.

## 6. Library target

Preserve the current header, toolbar, intake menu, selected-asset workspace, taxonomy/collections, readiness truth, asset typing, Preview, and Ask.

At Library root, evidence remains immediately visible. Collections narrow the same durable estate rather than gate it.

```text
Library

research collections / context

EVIDENCE                              SOURCE        VERIFY        STATE
plain-language meaning
──────────────────────────────────────────────────────────────────────
...
```

Rules:

1. Registered assets paint immediately; collection taxonomy may hydrate progressively.
2. Search operates over the evidence estate.
3. Source, verification, and readiness remain distinct when authority exists.
4. Asset type is visible only when heterogeneity makes it useful.
5. Missing prose may degrade to truth-backed evidence shape; never fabricate a semantic description.
6. The root remains useful at 3 assets and 128+ assets.
7. Selection opens the current asset workspace; do not recreate a second inspector-led Library.
8. Known limitations should be able to create an exact Discover handoff rather than a generic search.

## 7. Discover target

Preserve the one-composer Explore page and the current active result workflow.

The resting state must communicate the layered sourcing promise without becoming a dashboard:

```text
research need
→ what Library already covers
→ qualified external offerings
→ useful web/reference context when needed
→ fit / unknowns
→ review-gated acquisition
→ durable History
```

The entry page should make this promise legible in compact form. The active state should preserve ranked offerings while selection/Preview/Ask deepen one candidate. Do not add permanent procurement modules or source dashboards.

History should increasingly read as a research acquisition notebook: need, source, method where authoritative, durable consequence, resulting Library asset, and recovery decision. Frontend must not invent method provenance the backend did not record.

## 8. Synthesis target: adaptive workspace over strict authority

The backend authority remains strict. The visible researcher experience must not become an eight-step checkout flow.

Internal authority may distinguish:

```text
objective recorded
→ evidence attached
→ specification valid
→ proposal persisted
→ proposal accepted
→ execution ready
→ approval granted
→ execution
→ archive / registry proof
→ registered / query-ready result
```

The visible research grammar is simpler and adaptive:

```text
Objective → Evidence → Method → Review → Build → Result
```

`Proposal` and `Readiness / Approval` are meaningful authority states inside Review. The UI may expose them as sub-states or current decisions, not necessarily permanent top-level pages.

Research entry is not always identical:

```text
new question
Objective → Evidence → Method → Review → Build

start from Library evidence
Evidence → research use / objective → Method → Review

reuse registered method
Method → check evidence fit → Review adaptation → Build

missing evidence
current construction → Discover handoff → evidence acquired → return to same construction
```

Hard rules:

1. Browser navigation never earns future authority.
2. Past earned work is inspectable from durable records.
3. The centre shows the work that can legitimately be done now, not every possible construction panel.
4. Earlier work remains visibly accumulated instead of disappearing like completed checkout steps.
5. Ask advises inside the construction but is not the only way to advance deterministic workflow state.
6. The material grammar remains Research Drive: quiet paper workspace, hairline divisions, evidence objects, bounded decision surfaces. Do not wrap the whole Synthesis page in an unrelated white SaaS card.
7. Internal lifecycle distinctions remain honest even when multiple backend states map to one visible research phase.

## 9. Rail target

The right rail is the workflow continuity layer, not a generic metadata inspector or chat replacement.

It answers:

```text
What exact object is active?
What is established now?
What materially matters?
What remains unresolved?
What is the next legitimate action?
What can Ask do inside this exact context?
```

The rail should keep a compact situation header persistent across Detail and Ask. Domain-specific panels supply evidence/provenance/decision detail. Sparse pages should not leave hundreds of pixels of meaningless blank rail; however, extra content must be grounded in current state rather than filler.

Ask remains object/session scoped. Switching contexts must never leak prior conversational authority.

## 10. Page-specific effort

### Home

Keep quiet. Improve only where resume/attention items fail to reveal durable research consequences. Do not turn Home into a capability dashboard.

### Library

High-priority convergence surface. Evidence estate, source/verification/readiness, intake, limitations, provenance, reuse, and Discover handoff must feel like one workspace.

### Discover

High-priority convergence surface. Resting state must communicate sourcing power; active state must preserve evidence comparison and acquisition logic without becoming a procurement console.

### Synthesis

High-priority workflow surface. Validate a real sequential durable journey before granting visual maturity credit. The UI must remain adaptive and integrated with the rest of the desk.

### Resources

Mostly preserve. Translate only research-relevant capacity/access constraints; hide worker-console machinery.

### Profile / Settings

Preserve low visual weight. They support the research loop rather than compete with it.

## 11. Capability disposition examples

| Backend capability | Disposition | Researcher expression |
|---|---|---|
| readiness | PRIMARY | Query-ready / Registered / Metadata only / unavailable |
| asset kind | PRIMARY when heterogeneous | Dataset / Scholarly work / etc. |
| source identity | PRIMARY for owned evidence | source scan line / cell |
| explicit verification relationship | PRIMARY / CONTEXTUAL | Verified / Matched / Partial / Unverified / Not checked |
| complete provenance | DISCLOSURE | Source record / provenance |
| archive manifest | DISCLOSURE | preserved acquisition proof |
| procurement route | CONTEXTUAL | acquisition review / current route |
| provider worker implementation | HIDDEN | represented by source / lifecycle outcome |
| recurring subscription | CONTEXTUAL | Keep this evidence current |
| credential profile | HIDDEN / CONTEXTUAL | Access required when relevant |
| measured synthesis conflicts | PRIMARY when active | measured conflict decision surface |
| proposal hash / immutable revision | CONTEXTUAL / DISCLOSURE | exact review revision / audit proof |
| registry internals | HIDDEN | readiness / durable Library consequence |

## 12. Acceptance loop

Do not accept composition from JSX or one flattering screenshot.

```text
current branch
→ deterministic Chromium render
→ Insider review: what real capability is stranded?
→ Designer review: what is noisy / confusing / overexposed?
→ reconcile
→ browser workflow test
→ render sparse + active + inventory-scale states
→ cross-page handoff test
→ repeat until remaining defects are marginal
```

For every changed surface, record:

```text
KEEP     current strengths preserved
SURFACE  backend value newly made legible
HIDE     implementation detail intentionally withheld
REMOVE   UI that duplicated / obscured the real research object
PROVE    durable state transition / reload behavior that validates the composition
```

## 13. Immediate convergence order

1. Correct Synthesis visual grammar: keep strict authority underneath, collapse the visible workflow to adaptive phases, remove wizard/card detachment, and keep accumulated construction state visible.
2. Re-render Objective, Evidence, Method, Review, Build, and Result states from one sequential workflow fixture rather than isolated finished-state mocks.
3. Finish Library root + selected-asset capability conversion, including verification only where authoritative and scale behavior.
4. Improve Discover resting promise and active evidence-fit composition; preserve ranked results through candidate inspection.
5. Finish rail continuity across Home, Library, Discover, Synthesis, and Resources.
6. Review Home / Resources / Profile / Settings for cross-page grammar only; resist feature inflation.
7. Run the paired frontend/backend integration gauntlet and exact cross-surface workflow proof before external researcher testing.
