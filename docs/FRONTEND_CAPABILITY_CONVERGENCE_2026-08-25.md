# Research Drive frontend capability convergence — 2026-08-25

**Status:** working design authority for the current convergence branch  
**Baseline:** `work/chatgpt-final-convergence-20260825`  
**Rule:** the current UI is the implementation baseline. Historical wireframes, deleted components, screenshots, and commits are evidence-mines only. Nothing is restored wholesale.

## 1. Problem statement

Research Drive now has a backend that is materially more capable than the resting frontend communicates. The remaining frontend problem is not primarily API integration and it is not a reason to rebuild the shell. It is a capability-conversion problem:

```text
backend capability
→ researcher-visible object
→ researcher-understandable meaning
→ legitimate action
→ durable consequence
→ visible changed state
```

A capability may be intentionally hidden, but it may not disappear accidentally.

The current shell remains authoritative:

```text
Navigation = where am I?
Centre = what evidence / research object am I working with?
Detail = what does it mean / what decision exists?
Ask = intelligence + supported operation on the exact object
Backend = durable consequence
Centre = consequence becomes visible
```

Synthesis is the internal quality benchmark because it already converts measured backend state into a researcher-facing decision surface without exposing implementation plumbing.

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

The Insider rejects interfaces that make Research Drive look like a generic Drive clone, dataset search page, chat sidebar, or worker dashboard when the backend can do materially more.

### Designer

Goal: make the same capability legible with the least cognitive and interaction burden.

For each Insider demand, ask:

- What is the current centre object?
- What decision is the researcher making now?
- What must scan in five seconds?
- What belongs only after selection?
- What belongs behind disclosure?
- What implementation machinery should never be visible?

The Designer rejects capability dumps, dashboard inflation, duplicate panes, metadata soup, and administrative navigation.

### Disposition

Every important capability receives one disposition:

```text
PRIMARY      always visible when it defines the current object / decision
CONTEXTUAL   visible only when relevant to the selected object / workflow
DISCLOSURE   inspectable proof, provenance, or technical detail
HIDDEN       implementation machinery whose researcher outcome is represented elsewhere
```

`HIDDEN` is allowed. `LOST` is not.

## 3. What the current UI already gets right

Do not regress these gains.

### Global shell

- Quiet paper centre + dark navigation + interpretive rail.
- Seven stable faculty destinations.
- Active research context remains visible without becoming a second navigation tree.
- Detail / Ask remains one rail, not duplicated centre workspaces.
- Same-origin runtime and object-grounded backend contracts.

### Library selected asset

- Real query-ready preview / query actions.
- Readiness remains distinct from possession and registration.
- Scholarly works no longer pretend to have tabular join keys / fields.
- Source/provenance inspection is bounded rather than always expanded.
- Object-scoped Ask isolation.

### Discover active investigation

- One composer and `Explore | History` only.
- Held evidence, external offerings, and web context can coexist.
- Candidate lifecycle, probe, review, acquisition and History are real backend consequences.
- Synthesis evidence-gap handoff preserves the research requirement.

### Synthesis

- Best current capability conversion.
- Measurements, evidence, conflicts, decisions, execution and registration are composed around a research construction rather than backend modules.

### Resources / Home

- Infrastructure is translated into research capacity / attention rather than exposed as worker-console plumbing.
- Home remains a resume / needs-attention surface instead of a metrics dashboard.

## 4. Current failure pattern

The current frontend sometimes compresses backend capability into an overly small metaphor.

```text
backend: evidence estate + provenance + acquisition + verification + readiness + reuse
frontend resting Library: shelves / folders / datasets

backend: held evidence + federated discovery + qualification + acquisition engineering + lifecycle
frontend resting Discover: search box / source list
```

The answer is not to restore an old UI. The answer is to retain current truth and interaction semantics while increasing capability legibility in the existing composition.

## 5. Library target composition

### Current baseline to preserve

- Current header / toolbar / `New` intake menu.
- Current selected-asset workspace.
- Current professor taxonomy / shelves as useful research organisation.
- Current readiness truth, asset typing and Ask behaviour.

### Change in centre priority

A shelf must no longer be a gate that hides the evidence estate.

At Library root:

```text
Library

Research evidence estate                          N assets · Q query-ready
[All evidence] [research collection / shelf] [collection / shelf] ...

EVIDENCE                              TYPE          SOURCE          STATE
plain-language description
────────────────────────────────────────────────────────────────────────
...
```

Rules:

1. Registered Library assets are visible immediately at root.
2. Shelves / collections remain useful, but behave as research context / narrowing controls rather than the only path to evidence.
3. Selection still opens the current asset workspace; do not recreate the old rail-heavy asset inspector.
4. Search still searches the current Library estate.
5. Current `New` intake remains the single intake surface.
6. Do not infer verification from query readiness. If explicit verification authority is absent, show no verification claim or show `Not recorded` only where useful.
7. Asset kind may scan as `Dataset`, `Scholarly work`, `Metadata index`, `Live source`, or `Operational` when that helps distinguish evidence.
8. The centre must remain useful at both 3 assets and 128+ assets. Avoid dashboard modules above the estate.

The desired mental model is:

```text
research context
→ evidence estate is immediately visible
→ narrow by collection / shelf if useful
→ select evidence
→ understand / preview / query / source / Ask
```

not:

```text
shelf
→ folder
→ dataset
```

### Why this is not an old-interface restoration

Historical estate-ledger iterations are useful evidence that the information architecture can work, but their semantics are not authoritative. In particular, old code that equated `query-ready` with `Verified` must never return. The target combines current truth / asset handling with stronger estate visibility.

## 6. Discover target composition

Preserve the current one-composer Explore page and current active result workflow.

The resting state must communicate the sourcing promise without becoming a dashboard:

```text
[ Search datasets or describe the evidence you need                         ]

Evidence scope
[ Library evidence · N ]  [ Known sources ]  [ Web context when useful ]

Research Drive checks what you already hold, then qualified sources, then widens
when the question requires it. Acquisition remains review-gated.

examples / source families / URL-DOI intake
```

After search, the existing active composition remains primary:

```text
research need
→ available offerings
→ Library comparison
→ web/reference context
→ selected-candidate meaning / unknowns
→ probe / review / acquire
→ History
→ Library
```

Do not add permanent procurement panels, source dashboards, workflow diagrams, or backend module navigation.

## 7. Rail rule

The rail interprets a meaningful centre object. It must not compensate for a weak / empty centre.

A useful test:

> If the rail were collapsed, would the researcher still understand what object/state they are working with and why Research Drive is useful?

If the answer is no, improve the centre before adding more rail content.

## 8. Capability disposition examples

| Backend capability | Disposition | Researcher expression |
|---|---|---|
| readiness | PRIMARY | Query-ready / Registered / Metadata only / unavailable |
| asset kind | PRIMARY when heterogeneous | Dataset / Scholarly work / etc. |
| source identity | PRIMARY for owned evidence | source scan line / cell |
| complete provenance | DISCLOSURE | Source record / provenance |
| archive manifest | DISCLOSURE | preserved acquisition proof |
| procurement route | CONTEXTUAL | acquisition review / current route |
| provider worker implementation | HIDDEN | represented by source / lifecycle outcome |
| recurring subscription | CONTEXTUAL | Keep this evidence current |
| credential profile | HIDDEN / CONTEXTUAL | Access required when relevant |
| measured synthesis conflicts | PRIMARY when active | measured conflict decision surface |
| registry internals | HIDDEN | readiness / durable Library consequence |

## 9. Acceptance loop

Do not accept a composition from JSX alone.

```text
current branch
→ deterministic Chromium render
→ Insider review: what real capability is stranded?
→ Designer review: what is noisy / confusing / overexposed?
→ reconcile
→ browser workflow tests
→ compare current vs candidate pixels
```

For every changed surface, record:

```text
KEEP     current strengths preserved
SURFACE  backend value newly made legible
HIDE     implementation detail intentionally withheld
REMOVE   UI that duplicated / obscured the real research object
```

## 10. Immediate implementation order

1. Library root: evidence estate visible immediately; shelves become contextual narrowing, not a gate.
2. Render and judge Library at 3 holdings and inventory-scale fixture.
3. Discover resting state: communicate layered sourcing promise using existing chrome, not a new dashboard.
4. Re-render Discover idle + active research question + Synthesis handoff states.
5. Only then consider Home / Resources refinements. Synthesis remains the benchmark and should not be redesigned without a demonstrated defect.
