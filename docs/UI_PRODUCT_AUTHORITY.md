# Research Drive UI Product Authority

**Status:** CURRENT UX IMPLEMENTATION AUTHORITY  
**Current amendment:** 2026-07-14 — faculty research-workbench direction  
**Applies to:** `drive/src/v2/*` and every professor-facing Research Drive route  
**Implementation owner:** bounded Sol/Terra workers operating from this document  
**Acceptance owner:** principal product/design review using live workflows and rendered pixels  

This document is the single authority for Research Drive's product model,
information architecture, interaction grammar, visual hierarchy, and responsive
behavior. Existing documents remain useful as implementation history and backend
contracts, but they do not override this authority when they prescribe conflicting
page composition or navigation.

In particular, this document supersedes conflicting interface decisions in:

- `RESEARCH_DRIVE_UI_CANON.md` (2026-07-01 composition freeze)
- `design/V2_BUILD_FROZEN.md`
- `design/V2_FORWARD_FROZEN.md`
- `status/generated/research_drive_ui_handoff_20260710.md`

The right-rail backend context contract, procurement architecture, registry, vault,
and query contracts remain valid unless explicitly revised here.

---


## Current interface amendment — 2026-07-14

This amendment is binding where it conflicts with earlier material in this document or any historical UX document. It records the accepted current Research Drive design direction.

### Product grammar

```text
Navigation answers: where am I?
Centre answers: what evidence or research object am I working with?
Detail / Ask answers: what does it mean, and what is the valid next action?
```

The only navigable destinations are:

```text
Home · Library · Discover · Synthesis · Resources · Profile · Settings
```

Cluster, Activity, Pipeline, Sources, Vault, Preview, Approval, route comparison, failure, registration, and job execution are not top-level destinations.

### Shared shell and research context

- The faculty desk uses a full-height research shell: quiet paper navigation/context, dense evidence workspaces, and an ink reasoning rail for active selections or Ask.
- There is one active research object. Its themes, emphases, entities, and evidence preferences are attributes of that object; they are not a second navigation system.
- The rail is quiet when no evidence object is active. On selected candidate, asset, blueprint, capability, or Ask, it becomes the focused interpretation surface. It must never show a permanent empty inspector.

### Page ownership

| Page | Centre owns | Rail owns |
|---|---|---|
| Home | research intention, needs-you queue, resume points | active research context and optional Ask |
| Library | durable lab evidence | selected asset readiness, provenance, and reuse action |
| Discover | external evidence and lifecycle states | selected source or request decision |
| Synthesis | reusable blueprints and output state | selected blueprint input readiness and gap action |
| Resources | source capabilities and constraints | selected capability interpretation |
| Profile | visible ranking context | how that context shapes recommendations |
| Settings | application/session preferences | contextual help only |

### Discover and Preview

- Discover has exactly two internal modes: `Explore` and `History`.
- Explore is search-first. Unselected rows contain only source identity, provider, grain/type, access state, and verified availability hints. They do not carry per-row ranking controls, collection actions, or local-estate labels.
- Selecting a source leaves the result list in place and drives Detail. Detail owns why relevant, local sufficiency, verified facts, unknowns, and one primary next action.
- Local sufficiency is currently represented as `Exact`, `Partial`, `Related`, or `Unknown`. Do not invent additional states without a durable backend enum and authority amendment.
- Preview is a centre-scoped, non-route evidence overlay. Detail remains visible and can interpret the active preview. It is not a full-app blocking modal.
- Preview has one interaction model with source-specific renderers for table/API, paper, filing, and web evidence. It presents observed evidence separately from unverified or unavailable facts.
- History is a durable researcher-facing lifecycle inbox: needs you, active, ready, needs recovery, scheduled. It compresses backend lifecycle details into valid human actions; technical records are disclosures.

### Synthesis, resources, and Ask

- Synthesis remains blueprint/recipe oriented. Readiness, gaps, registered inputs, and verified outputs are visible; viewing a blueprint is read-only and build/refresh is explicit.
- Resources is a researcher capability map, not a jobs, worker, spend, or infrastructure console.
- Ask is an accelerator, not a dependency. It receives the current typed page/object context, renders evidence-bearing artifacts with source/time/verification state, and can open deterministic UI intents. It cannot approve irreversible operations.

### Truth and handoffs

- Claims about coverage, access, readiness, collection state, registration, ranking, and AI evidence require an authority and freshness state. Use `Not reported`, `Not verified`, `Unknown`, or `Unavailable` when authority is absent.
- Cross-page handoffs must open exact objects or prefilled queries: Discover→Library asset, Library/Synthesis→Discover gap, Discover→Synthesis compatible blueprint, and Resources→Discover source constraint.
- No demo fixture, stale cache, or model prose may appear as a live authoritative fact.

### Implementation order

```text
1. Restore Discover to Explore | History with selected-source Detail.
2. Make Preview centre-scoped and renderer-driven.
3. Wire durable History, local sufficiency, and exact handoffs.
4. Add typed Ask evidence context and stale-context clearing.
5. Separate Synthesis read from execution.
6. Validate rendered desktop/laptop/mobile pixels before further conceptual redesign.
```


## 1. Product

Research Drive is a private research workspace that remembers what a lab owns,
finds what it lacks, acquires missing evidence, and turns the result into reusable
research assets.

It is not a connector marketplace, generic data catalog, infrastructure dashboard,
chat application, or linear procurement wizard.

The professor should experience one continuous loop:

```text
Find evidence -> Evaluate it -> Use or acquire it -> Build work -> Reuse the result
```

The system may internally perform search routing, semantic retrieval, source probing,
job planning, MCP calls, archival, registry promotion, and synthesis. Those are
implementation capabilities, not the user's navigation model.

### 1.1 Primary promise

At any useful moment the interface should answer:

1. What evidence do I have?
2. Is it suitable and trustworthy for this research question?
3. What is missing?
4. Can the desk obtain or construct the missing evidence?
5. Where did the resulting asset go, and can I use it again?

### 1.2 Product qualities

Research Drive must feel:

- **scholarly:** evidence, provenance, limitations, and uncertainty are visible;
- **instrumental:** actions are direct and state changes are legible;
- **quiet:** the interface does not continuously explain its own machinery;
- **capable:** advanced behavior appears when the task requires it;
- **honest:** live, demo, partial, stale, failed, and unknown states are never blurred;
- **continuous:** Discover, Library, Synthesis, and Resources visibly share one memory.

---

## 2. User Mental Model

The user thinks in research questions and evidence objects, not connectors and
pipeline stages.

### 2.1 Core objects

| Object | Meaning to the professor | Canonical home |
|---|---|---|
| Research question | The problem being investigated | Discover / Ask context |
| Dataset | Evidence that can be inspected or queried | Library |
| External source | Candidate evidence not yet owned | Discover |
| Research output | A derived, synthesized, or transformed dataset | Library, created in Synthesis |
| Acquisition | Work to bring an external source into the lab | Resources, surfaced contextually |
| Faculty context | Saved interests, works, methods, and linked lab assets | Profile |
| Resource condition | Capacity, failures, approvals, or credentials needing attention | Resources |

### 2.2 Canonical state vocabulary

Do not invent a different status language on each page.

| User-visible state | Meaning |
|---|---|
| **Ready** | Queryable now in the lab |
| **In lab** | Registered/owned, but not necessarily query-ready |
| **External** | Identified outside the lab and not yet collected |
| **Checking** | Source facts or access are being verified |
| **Approval needed** | A consequential action requires a decision |
| **Collecting** | Acquisition is running |
| **Failed** | The latest attempt did not complete |
| **Archived** | Preserved, but not necessarily registered/queryable |
| **Partial** | Usable with explicit material limitations |
| **Unknown** | The system does not have enough evidence to claim a state |

Internal labels such as connector, MCP, queue task, hydrate, route, registry promote,
and worker belong in diagnostics or expandable technical detail only.

---

## 3. Navigation and Surface Ownership

The sidebar contains seven destinations in this order:

```text
Home
Library
Discover
Synthesis
Resources
Profile
Settings
```

Ask is never a sidebar destination. Activity, History, Pipeline, Connectors, Sources,
and Vault are not top-level destinations.

| Surface | Owns | Must not become |
|---|---|---|
| **Home** | resume work and attend to consequential changes | product tour or inventory dashboard |
| **Library** | what the lab owns and can use | raw partition/registry browser |
| **Discover** | find, compare, and acquire evidence | pipeline console or chat-first page |
| **Synthesis** | combine owned evidence into registered outputs | recipe gallery or engineering runner |
| **Resources** | jobs, failures, capacity, and account health | connector catalog or duplicate approval surface |
| **Profile** | research memory and relationship to lab evidence | social profile or generic preferences |
| **Settings** | identity, credentials, notifications, and display configuration | workflow surface or diagnostics dump |

No page may duplicate another page's primary job. It may link to that job while
preserving context.

### 3.1 Action ownership

Consequential actions have one owning surface:

| Action | Owner | Other surfaces do |
|---|---|---|
| Approve or revise an external acquisition | Discover Focus | link to the candidate/job with context |
| Monitor acquisition or inspect a failure | Resources | link back to Discover when the source decision must change |
| Upload a user-owned file or add a known DOI/URL | Library intake | preserve the chosen Library destination |
| Search for or procure an unknown external source | Discover | receive destination context from Library/Profile/Synthesis |
| Configure credentials or safety defaults | Settings | expose only the consequence of missing configuration |
| Run and register a synthesis | Synthesis | route missing inputs to Discover |

Home never performs bulk approval. It summarizes attention and opens the owning
focused decision. Resources does not provide a second acquisition approval button.

---

## 4. Global Interaction Grammar

### 4.1 Browse and focus

Most work has two states:

```text
Browse: scan, filter, compare, and choose
Focus: inspect one object, make a decision, or perform an action
```

Browse is the default. Focus appears only after an object is selected or a task is
explicitly started. The interface must not reserve large focus areas while idle.

### 4.2 Detail and Ask

Detail and Ask are two views of the same selected context:

- **Detail** contains authoritative structured facts and deterministic actions.
- **Ask** contains Composer reasoning and tool-assisted assistance scoped to that context.

Ask must not replace missing deterministic controls. Detail must not render canonical
metadata from assistant prose.

Selecting an object opens Detail. Asking a question opens Ask only after an explicit
user action. Semantic search alone must not silently convert the whole page into chat.

### 4.3 Rail rules

Desktop:

- With no selected object, the main canvas uses the available width; no permanent
  empty rail is shown.
- Selecting an object opens a 400-480px focus inspector on the right.
- Detail and Ask share the same inspector and preserve context when toggled.

Tablet:

- Browse remains primary.
- Detail opens as a dismissible right drawer.
- Ask is a drawer/full-screen layer, not a squeezed third column.

Mobile:

- Selecting a result opens a full-screen focus view.
- The primary action sits in a stable bottom action bar.
- Ask opens full-screen and preserves a clear return path to Detail and results.

Focus is encoded in URL state. Browser Back closes Focus before leaving the owning
surface. Escape and the visible close command do the same on desktop/tablet. V1 does
not include inspector pinning; selection persists until explicitly closed or replaced.

### 4.4 Overlays

Use overlays for temporary, bounded work:

- preview rows / schema / query;
- filters and sort controls;
- probe evidence;
- approval confirmation;
- credential entry;
- mobile Detail or Ask.

An overlay must preserve the underlying selection and close predictably with Escape,
close button, browser Back where routable, and scrim click where safe.

### 4.5 Actions

Each state has one visually dominant action. Secondary actions are restrained;
technical and destructive actions are separated.

Do not place the same command in the page, row, rail, and sticky footer at once.
Familiar icon actions use the project's icon library and have tooltips. Text buttons
are reserved for commands whose meaning cannot be represented by a familiar symbol.

---

## 5. Global Shell

### 5.1 Header

The header contains:

- brand;
- one global command/search field;
- truthful environment/freshness indicator;
- consequential attention count;
- account menu.

The global field is a command entry point, not a duplicate Discover search box. It
may navigate to a dataset, open a command, or start Ask. Its placeholder and result
menu must make those outcomes explicit.

Never show an unexplained dataset total. If a number is a professor-visible subset,
label it as such. `50 datasets` and `160 registry records` must not appear as competing
truths without explanation.

### 5.2 Sidebar

The sidebar is stable and quiet. It does not carry workflow badges except a small,
actionable attention indicator where necessary. It never becomes a folder tree.

### 5.3 Main canvas

The main canvas is the primary work surface. It uses full-width page bands and lists;
cards are reserved for repeated objects that genuinely need a frame. Do not place a
large rounded card around an entire page section.

### 5.4 Density

- Lists prioritize scanning and comparison.
- Page headings are compact and do not consume working height.
- Controls remain stable when dynamic labels or counts change.
- Long metadata is truncated in browse state and readable in focus state.
- Empty space is acceptable when it supports focus; empty infrastructure panels are not.

---

## 6. Discover Authority

Discover is a research search engine with an acquisition capability. Search is the
page; procurement is a consequence of selecting a useful external result.

### 6.1 Default state

The page contains:

1. `Discover` heading and one-line purpose;
2. one prominent search field;
3. a compact filter control;
4. recent or profile-relevant searches only when grounded in real context;
5. a restrained attention link when acquisitions require action.

There is no Search/Activity/History tab bar and no Catalog/Research Question toggle.

Search accepts exact titles, IDs, DOI/URL, keywords, and natural-language research
needs through the same field. The system decides retrieval strategy behind the scenes.

### 6.2 Search behavior

```text
Query submitted
  -> return immediate local/registry matches
  -> enrich with semantic matches when useful
  -> include external candidates when confidence or coverage warrants it
  -> preserve one ranked result set with provenance labels
```

Do not expose `keyword`, `semantic`, `web`, or `agent` as required user choices.
Allow an advanced search syntax or filter sheet for expert control.

Semantic similarity is not readiness evidence. A semantic result receives `Ready` or
`In lab` only after the canonical registry/query state confirms it; the semantic
endpoint's retrieval metadata cannot promote availability by itself.

### 6.2.1 Progressive-result stability

Progressive retrieval must not move the object a professor is reading.

- Every result has a canonical `candidate_key` supplied by the backend.
- Registry items use `dataset_id`; external items use provider namespace plus stable
  provider identifier, DOI, or canonical URL. Title is never the identity fallback.
- A newer query cancels or invalidates all older phase responses.
- Existing rows update in place when enrichment adds facts.
- No result is auto-selected.
- Before user interaction, enrichment may refine ordering during one initial settling
  window of at most 400ms.
- After keyboard/pointer interaction or Focus opens, existing row order and selection
  are locked; later matches append with a visible `New matches` affordance.
- Partial semantic/web failure preserves successful local results and reports the
  unavailable source class without converting the page to an error state.
- Pagination/load-more preserves canonical identity, order, and Focus.

### 6.3 Result anatomy

Each result row shows only what supports selection:

- title;
- source/publisher;
- one concise suitability statement;
- availability state (`Ready`, `In lab`, `External`, etc.);
- coverage/grain or access fact, whichever is most decision-relevant;
- optional reason for ranking.

Provider badges are meaningful only when source identity affects trust. Do not label
local registry objects as `WEB`.

### 6.4 Result focus

Selecting a result opens Focus/Detail with this order:

1. identity and availability;
2. research usefulness / fit to current query;
3. coverage and grain;
4. source, access, license, freshness, and provenance;
5. limitations and uncertainty;
6. one primary action;
7. expandable technical details.

Primary action by state:

| State | Primary action |
|---|---|
| Ready | Preview / use in Library |
| In lab, not ready | Open in Library |
| External, unchecked | Check source |
| External, verified | Add to lab |
| Approval needed | Review approval |
| Collecting | View progress |
| Failed | Inspect failure |

### 6.5 Agent assistance

For a broad research need, Discover first returns inspectable evidence. It then offers
an explicit action such as **Assess this evidence**.

That action asks Composer for a bounded research brief across the result set:

- evidence available now;
- strongest matching assets and why;
- material coverage gaps;
- uncertain claims;
- safest next query, synthesis, or acquisition step.

The brief must cite result objects and must not default to the first selected dataset.
No interactive professor-initiated collection starts without explicit confirmation or
a visibly applicable pre-approved policy.

### 6.6 Activity and history

Activity belongs in Resources and contextual status surfaces. Discover may show a
small attention entry when the current query or selected source has an active job.
Approving or revising that acquisition opens the relevant Discover Focus state.

History belongs to the current query, source, dataset, or research session. It appears
as provenance or a contextual trail, not a permanent empty top-level mode.

---

## 7. Library Authority

Library is the lab's owned evidence, organized for use rather than infrastructure.

### 7.1 Default state

- folder-first browse list;
- breadcrumb and search;
- compact sort/filter menu;
- one `New` menu containing only currently supported intake actions;
- readiness summary tied to the current folder, not the entire backend fleet.

Raw collection partitions, provider lanes, and registry buckets are not rendered as a
permanent chip wall. They may exist in an advanced collection browser or filter sheet.

### 7.2 Object hierarchy

Library distinguishes:

- folder/collection;
- raw or archived asset;
- registered dataset;
- query-ready dataset;
- live/remote connection;
- derived/synthesized output.

The distinction is conveyed by type, status, and metadata, not decorative card styles.

### 7.3 Dataset focus

The selected dataset answers:

- what it is and why it exists;
- whether it can be used now;
- coverage, grain, join keys, source, freshness, and provenance;
- limitations;
- where it is stored;
- what was derived from it and what it can join with;
- Preview, Query, Ask, and related-work actions.

Technical paths remain available but subordinate to human-readable identity.

### 7.4 Intake capability gate

The current backend has no file-upload endpoint. The UI must not present filename-only
Composer prompting as an upload. `Upload file` remains absent until a real byte-transfer,
destination, checksum, archive, and registration contract exists.

Known DOI/URL intake opens Discover with the value and selected Library destination
prefilled. It does not claim ownership until checking and collection complete.

---

## 8. Synthesis Authority

Synthesis creates a registered research output from existing lab evidence. It is not
an explanation of four pipeline stages and not a gallery of backend profiles.

### 8.1 Default state

Lead with two concrete groups:

- **Recent outputs:** built panels that can be opened in Library;
- **Start a synthesis:** a research objective or supported recipe grounded in actual
  available inputs.

If only a small number of synthesis profiles are genuinely supported, show them
honestly. Do not imply arbitrary synthesis capability.

### 8.2 Synthesis workspace

```text
Objective
  -> proposed inputs
  -> join/compatibility evidence
  -> coverage and loss preview
  -> explicit run
  -> output validation
  -> register and open in Library
```

The user sees input availability, join keys, expected row/coverage loss, missing
requirements, and output destination before running.

Ask may help choose inputs or explain gaps, but the run configuration and result are
structured, inspectable objects.

Synthesis defines two first-class focus objects:

- `synthesis_recipe`: objective, required/optional inputs, join keys, compatibility,
  expected loss, limitations, run state, and run action;
- `synthesis_output`: producing recipe/run, freshness, validation, coverage, provenance,
  registration state, and Open in Library action.

These objects participate in the same Detail/Ask context contract as datasets and
external candidates. They must not remain page-local state behind a generic rail.

### 8.3 Current capability gate

The target workspace above requires a non-mutating preflight contract, explicit run
contract, output validation state, and registry-registration result. The current
backend does not provide the complete sequence and currently may execute synthesis
while reading a profile with no latest output.

Until the backend contract is added:

- selection must never trigger a synthesis run;
- Synthesis may show configured recipes and inspect real latest outputs;
- an explicit `Run` may call the supported synchronous run endpoint only after a clear
  confirmation of the configured recipe and known inputs;
- the UI must not promise preflight compatibility, asynchronous progress, validation,
  or Library registration when those facts are unavailable;
- outputs without registry promotion remain `Built output`, not `Registered` or `Ready`.

The full Journey C is blocked on backend contract `SYNTHESIS_PREFLIGHT_V1`:

```text
GET  /library/synthesis/{id}/preflight       # non-mutating
POST /library/synthesis/{id}/runs            # explicit execution
GET  /library/synthesis/runs/{run_id}         # progress/result
POST /library/synthesis/runs/{run_id}/register
```

---

## 9. Resources Authority

Resources is the operational ledger and attention center.

### 9.1 Default order

1. items requiring intervention, with acquisition decisions linked to Discover;
2. active acquisitions and synthesis jobs;
3. recent failures with consequences and a supported recovery path;
4. storage/query/worker health;
5. usage and limits;
6. source routes and credentials only when actionable.

### 9.2 Presentation

Use dense statement rows and tables. Avoid a long page of service cards. Connector
inventory is collapsed by default and belongs under Source routes or diagnostics.

Counts must use a declared scope and time window. Lifetime failed/cancelled totals must
not be presented as current operational debt.

Selecting a row opens the related job/resource focus with state, consequence, supported
actions, evidence, and history. The current generic job contract supports approve and
cancel, not retry. Resources must not offer retry unless the selected job type exposes
a real retry/resume operation. Approval or source-plan revision returns to Discover.

---

## 10. Home Authority

Home answers `What should I resume or attend to now?`

Default order:

1. Continue one meaningful recent research object/session;
2. Needs attention, limited to consequential items;
3. Recent lab assets or outputs;
4. optional suggestions grounded in Profile and actual lab gaps.

Do not lead with a product explanation, four-stage capability diagram, total catalog,
or connector status. New-vault arrivals may appear as transient attention items.

---

## 11. Profile Authority

Profile preserves the current successful hierarchy:

```text
Identity
Memory
Works
Lab: linked and suggested
```

Profile is the desk's saved research context, not a social profile. Suggested data
must explain whether it is already in the lab, merely unlinked, or genuinely missing.

Profile Detail may summarize Scholar, Strengths, and Desk interpretation when each is
grounded in profile/registry evidence. Ask receives the same structured faculty context.

---

## 12. Settings Authority

Settings contains only real configuration:

- faculty identity and profile binding;
- credentials and connection testing;
- read-only approval/safety policy summary until a writable policy contract exists;
- notifications;
- display and default-location preferences;
- diagnostics behind an advanced disclosure.

Settings does not host procurement, source discovery, or generic assistant readiness
explanations. Unimplemented controls are omitted rather than displayed as stubs.

Current capability is limited to profile identity binding, browser-local display
preferences, and read-only readiness summaries. Credentials remain status-only until
writable credential and connection-test APIs exist. Never imply that a static
credential row can be configured or tested from this desk.

---

## 13. Visual System

### 13.1 Direction

The visual direction is a quiet institutional research instrument:

- light neutral canvas;
- dark ink for identity and evidence;
- cobalt reserved for selected state and primary action;
- green reserved for verified/ready success;
- amber reserved for decisions or material warnings;
- red reserved for failure or destructive action;
- restrained serif may identify page/object titles; controls and data use IBM Plex
  Sans/Mono or the established equivalent.

No purple AI styling, decorative gradients, floating section cards, oversized heroes,
or ornamental data visualizations.

### 13.2 Hierarchy

| Level | Use |
|---|---|
| Page title | destination identity, compact |
| Object title | selected evidence identity |
| Section title | one conceptual group |
| Field label | metadata/evidence key, mono only where useful |
| Body | readable explanation |
| Caption | provenance, timestamp, identifier, secondary state |

Letter spacing is zero except restrained technical labels where the existing system
requires it. Do not scale font size with viewport width.

### 13.3 Surfaces and borders

- Page sections are unframed bands.
- Lists may use one containing surface with dividers.
- Individual repeated objects may use cards when comparison benefits from enclosure.
- No card inside a card.
- Radius is 8px or less except search fields, segmented controls, and modal shells.
- Shadows indicate overlay/elevation, not ordinary page organization.

### 13.4 Filters

Use a filter button opening a popover/sheet with clear categories such as availability,
source type, geography, time coverage, format, and access. Show applied filters as
removable tokens only after selection. Do not render every possible filter as a chip.

### 13.5 Feedback and motion

- Immediate local feedback under 100ms;
- skeleton or progressive results for waits over 300ms;
- visible stage text only for genuinely long operations;
- no layout shifts when counts or statuses change;
- restrained 120-200ms transitions;
- respect reduced motion.

---

## 14. Responsive Authority

Target viewports for every major state:

```text
1440 x 900   desktop reference
900 x 1200   tablet/portrait reference
390 x 844    mobile reference
```

Desktop is not the only authoritative design. Every workflow is specified at all
three sizes before implementation is accepted.

Rules:

- fixed-format controls use stable dimensions and responsive constraints;
- text never overlaps adjacent controls;
- horizontal page scrolling is forbidden;
- tables may use contained horizontal scroll only when a list transformation would
  destroy comparison value;
- sidebar becomes compact navigation on tablet and mobile;
- focus/rail becomes drawer or full-screen as defined in section 4;
- primary actions remain reachable without covering selectable content.

### 14.1 Binding breakpoints and navigation

| Width | Navigation | Focus behavior |
|---|---|---|
| `>= 1180px` | full 224-280px sidebar | docked 400-480px inspector; closing restores full main width |
| `768-1179px` | 72px icon sidebar with tooltips | modal right drawer, width `min(440px, 55vw)` |
| `< 768px` | bottom navigation: Home, Library, Discover, More | full-screen Focus above the owning page |

`More` opens a sheet containing Synthesis, Resources, Profile, and Settings. The active
secondary destination remains visible in the mobile header and highlighted in the
sheet. Ask is never placed in mobile navigation.

At tablet/mobile widths, opening Focus pushes one history entry. Browser Back, Escape
where available, or close removes it and restores scroll position and selection. No
tablet/mobile inspector pinning is supported.

---

## 15. Backend Truth Contract

The frontend is an interpretation of backend truth, not a competing source of truth.

Every metric carries a shared truth envelope in application state:

- source endpoint;
- scope (registry, professor-visible, current folder, active jobs, lifetime jobs);
- freshness;
- live/demo/cache status;
- unavailable/unknown behavior.

The envelope is disclosed at the appropriate level rather than repeated beside every
number:

- header: data mode, availability/health summary, and freshness tooltip;
- section heading: count scope and time window;
- Focus/Detail: full source, scope, freshness, and unknown reason;
- diagnostics: endpoint and raw operational evidence.

Operational truth has three independent axes and must not be collapsed into one badge:

| Axis | Examples |
|---|---|
| Data mode | live, cached, demo |
| Service availability | connected, offline, checking |
| Health | healthy, degraded, failed, unknown |

A responding degraded API is not `down`. A nonempty dataset list does not prove a
healthy desk. A skipped or timed-out GDrive probe remains `checking`/`unknown`, not
verified. Headline totals use the endpoint's declared total rather than the current
page length.

### 15.1 Search

Results preserve source identity, availability, ranking basis when useful, and current
lab state. Semantic retrieval is supporting infrastructure. Composer analysis is a
separate explicit action.

Web discovery is prospecting, not verification. External results remain candidates
until source checking establishes access, provenance, and a viable collection path.

### 15.2 Procurement

Professor-facing state must correspond to the real chain:

```text
candidate -> checked source -> approval -> queued/running -> archived
          -> registered -> queryable/reusable
```

`Completed` is not displayed as `Ready` until archive/registry/query expectations are
satisfied for that task.

Interactive acquisition initiated by a professor requires explicit confirmation unless
an already-configured policy visibly authorizes that source/task class. Scheduled or
operator automation may be policy-approved without a new professor click and must be
labelled `Policy approved` rather than implying a pending personal decision.

The current generic job contract supports approve/cancel. Plan revision creates a new
Discover candidate/plan; it does not mutate a submitted job. Retry/resume is displayed
only for job types whose backend explicitly supports it.

### 15.3 Synthesis

Only supported profiles, actual input availability, real coverage/gap evidence, and
registered outputs are shown as capabilities. A backend endpoint existing is not enough
to advertise a complete user workflow.

The current backend count is dynamic. At the freeze audit it exposed three synthesis
profiles and two latest outputs; the UI must derive both values live rather than encode
that snapshot.

### 15.4 Demo and fallback data

Demo fallback is visibly labelled and cannot coexist with a `Live` badge that implies
the same values are live. Automated tests must assert the distinction.

---

## 16. Required End-to-End Journeys

These journeys are the product acceptance suite. A page is not finished because its
isolated component tests pass.

### Journey A: acquire missing Taiwan evidence

```text
Discover query
-> compare in-lab and external evidence
-> inspect MOPS/TWSE source
-> check access/provenance
-> approve collection
-> monitor job in Resources
-> archive/register
-> open reusable result in Library
```

### Journey B: use evidence already owned

```text
Broad Asia news-risk question
-> ranked in-lab evidence
-> assess evidence brief
-> open strongest dataset
-> preview/query
-> Ask with grounded dataset context
```

### Journey C: create a research output

```text
Choose synthesis objective
-> confirm inputs and join keys
-> inspect expected coverage loss
-> run
-> validate output
-> register
-> reopen from Library
```

This full journey is capability-gated and cannot pass until
`SYNTHESIS_PREFLIGHT_V1` exists. Before then, the accepted reduced journey is:

```text
Inspect supported recipe
-> explicitly run configured recipe
-> inspect saved output and honest limitations
```

### Journey D: recover failed work

```text
Home attention
-> Resources failure
-> inspect consequence and evidence
-> use a supported retry/resume action, or return to Discover to create a revised plan
-> return to resulting asset
```

### Journey E: resume next week

```text
Home
-> continue prior research context
-> restore selected object/query/job trail
-> proceed without repeating discovery
```

### 16.1 Research-session persistence contract

V1 persistence is frontend-owned under `rd.researchSession.v1` and stores no dataset
rows, credentials, or assistant response bodies.

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "expires_at": "ISO-8601 + 30 days",
  "tab": "discover",
  "query": "",
  "entity": { "kind": "dataset|candidate|job|synthesis_output", "id": "" },
  "job_id": "",
  "folder_id": "",
  "chat_session_id": ""
}
```

URLs are authoritative for the current tab, query, Focus object, and browser Back.
Local persistence restores only references that still resolve through canonical APIs;
otherwise it restores the owning page with a quiet `Previous item is unavailable`
notice. Expired sessions are discarded. Server-side multi-session history is a later
capability and must not be implied by V1.

---

## 17. Verification and Acceptance

Every major implementation slice requires:

1. live API verification for behavior that depends on the backend;
2. mock tests only for deterministic edge states and CI reliability;
3. Playwright execution of the relevant full journey;
4. screenshots at all three reference viewports;
5. manual pixel review of every screenshot;
6. keyboard navigation and visible focus review;
7. no console errors, clipping, overlapping controls, or page overflow;
8. count/status reconciliation against endpoint truth;
9. latency recording for search, selection, preview, Ask, and job refresh;
10. explicit residual-risk note where external systems cannot be exercised.

Golden files are regression aids, not proof of product quality. A green screenshot diff
cannot approve an incoherent design, and a mock golden path cannot prove live integration.

---

## 18. Implementation Sequence

Implement in vertical, independently reviewable slices:

1. **Foundation:** shell, responsive Browse/Focus behavior, tokens, truth labels.
2. **Discover:** one search surface, result hierarchy, explicit evidence assessment,
   contextual acquisition state.
3. **Library:** owned-object hierarchy, focus detail, preview/query, acquisition return.
4. **Synthesis:** outputs-first default, objective/input/coverage/run/register workspace.
5. **Resources:** attention/jobs/failures/health ledger and truthful scopes.
6. **Home:** reconcile Continue and Attention with the finished object workflows.
7. **Profile:** preserve Memory/Works/Lab and align responsive behavior.
8. **Settings:** remove stubs and finish real configuration.
9. **Cross-surface journeys:** run the complete acceptance suite and final visual bake-off.

Do not redesign every page simultaneously. Do not begin the next major surface until
the current slice passes its live journey and visual review.

---

## 19. Design and Model Governance

### Authority roles

- **Product/design authority:** owns this document, workflow decisions, page
  composition, and final screenshot acceptance.
- **Implementation worker:** receives a bounded page specification, edits only the
  assigned files, and returns tests plus screenshots.
- **Adversarial reviewer:** critiques rendered outcomes and workflow clarity but does
  not directly edit implementation files.

### Model allocation

- Sol high/xhigh/max: product compression, interaction architecture, cross-surface
  composition, major design review.
- Terra medium/high: bounded component implementation, CSS, fixtures, tests, and
  screenshot generation.
- Alternate models: red-team critique or independent review only unless assigned a
  bounded implementation brief.

### Change control

Any proposal that changes navigation, page role, Browse/Focus behavior, status
vocabulary, Ask behavior, or responsive philosophy must amend this document first.

Pixel-level refinement may proceed without an authority amendment when it preserves
the frozen interaction and visual grammar.

Implementation agents must not reinterpret ambiguous requirements silently. They
return the ambiguity to the product/design authority with rendered evidence.

---

## 20. Competitive Standard

Research Drive is not judged by feature count. It is judged by how quickly and
truthfully a professor can understand the lab's evidence capability and act on it.

Competitive references are used for interaction principles:

- Google Drive: owned-object browsing and continuity;
- Elicit / Consensus: research-question entry and evidence ranking;
- modern data catalogs: provenance, coverage, and trust metadata;
- modern analytical workspaces: inspect, query, derive, and resume;
- mature operations tools: actionable jobs/failures without exposing infrastructure
  as the product.

Research Drive's differentiated loop is:

```text
search the lab first
-> find external evidence when needed
-> acquire with explicit approval
-> preserve and register it
-> query or synthesize it
-> remember it for the next research session
```

The interface is complete when that loop feels simpler than the machinery that powers
it, while preserving enough evidence for a researcher to trust every consequential
decision.
