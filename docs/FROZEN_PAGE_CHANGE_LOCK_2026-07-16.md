# Research Drive — Frozen Page Change Lock

**Status:** ACTIVE CHANGE-CONTROL LOCK  
**Date:** 2026-07-16  
**Scope:** Discover, Library, and Profile product composition  
**Purpose:** prevent already-converged faculty-facing pages from being casually reopened, reinterpreted, or redesigned during remaining Research Drive convergence

This is a change-control lock, not a replacement for [`UI_PRODUCT_AUTHORITY.md`](UI_PRODUCT_AUTHORITY.md).

The sole top-level authority remains `UI_PRODUCT_AUTHORITY.md`. The normative full-scale page appendices and grounded Profile freeze remain the visual / interaction evidence for their pages.

The current lock state is:

```text
DISCOVER     HARD FROZEN
LIBRARY      HARD FROZEN
PROFILE      GROUNDED HARD FROZEN
HOME         INTERIM FREEZE / STILL OPEN TO PRODUCT REVIEW
```

The distinction is deliberate.

Home is still under active design review.

Discover, Library, and Profile are not.

---

## 1. Discover — hard frozen

Normative authority:

- [`UI_PRODUCT_AUTHORITY.md`](UI_PRODUCT_AUTHORITY.md)
- [`DISCOVER_FULL_SCALE_FREEZE_2026-07-15.md`](DISCOVER_FULL_SCALE_FREEZE_2026-07-15.md)
- [`RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md)
- [`DISCOVER_E2E_AUTHORITY_AUDIT.md`](DISCOVER_E2E_AUTHORITY_AUDIT.md)

Frozen composition:

```text
DISCOVER

EXPLORE
+
HISTORY

Centre = candidate / lifecycle object + current state
Detail = meaning + current decision
Ask = intelligence + supported acquisition operation
Backend = durable consequence
Centre = consequence becomes visible
```

The following are not permitted as design reinterpretations:

```text
Focused Evaluation centre takeover
Semantic / AI / Advanced Search tabs
Evidence Builder
Research Query / Browse / Source Finder modes
worker-dashboard History
Activity resurrection
Search / Probe / Procure event-kind filters
infinite activity feed
giant lifecycle sections
full-height Detail growth
per-row Ask / collect controls
new permanent acquisition workspace
new permanent Agent page
```

### Discover change rule

```text
NO CASUAL DISCOVER REDESIGN.
```

A Discover composition change is permitted only when all of the following are true:

1. A concrete cross-page contradiction or proven rendered-workflow failure exists.
2. The problem cannot be solved inside the frozen Discover composition.
3. The change is reviewed visually at full-page scale before implementation.
4. `UI_PRODUCT_AUTHORITY.md` is explicitly amended.
5. `DISCOVER_FULL_SCALE_FREEZE_2026-07-15.md` is explicitly amended.
6. The right-rail contract and Discover E2E authority audit are updated where affected.

New backend capability, new MCP tools, new source connectors, or new execution machinery do **not** by themselves justify a new Discover surface.

```text
BACKEND CAPABILITY
≠
FRONTEND PAGE INVENTION
```

The default answer to a proposed Discover redesign is **no**.

---

## 2. Library — hard frozen

Normative authority:

- [`UI_PRODUCT_AUTHORITY.md`](UI_PRODUCT_AUTHORITY.md)
- [`LIBRARY_FULL_SCALE_FREEZE_2026-07-15.md`](LIBRARY_FULL_SCALE_FREEZE_2026-07-15.md)
- [`RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md)

Frozen product grammar:

```text
RESEARCH LOCATION
↓
COLLECTION TREE
↓
EVIDENCE ESTATE
↓
COLLECTION OR ASSET SELECTION
↓
DETAIL / ASK
↓
DURABLE LIBRARY CONSEQUENCE
```

Collection selection remains navigation.

Evidence selection remains inspection.

Source, verification, and readiness remain separate axes.

Collections remain research organisational contexts, not physical archive directories.

One durable evidence asset may belong to multiple collections without duplication.

No system or model silently moves evidence between collections.

### Library change rule

The default answer to a proposed Library composition redesign is **no**.

Any material composition change must amend both `UI_PRODUCT_AUTHORITY.md` and `LIBRARY_FULL_SCALE_FREEZE_2026-07-15.md` before implementation.

---

## 3. Profile — grounded hard freeze

Normative grounded authority:

- [`PROFILE_GROUNDED_FREEZE_2026-07-16.md`](PROFILE_GROUNDED_FREEZE_2026-07-16.md)
- current faculty-profile / registry data contract
- current `profileViewModel.js` evidence-gated derivation rules

Frozen information architecture:

```text
MEMORY
↓
WORKS
↓
LAB

LINKED | SUGGESTED
```

Profile remains research memory derived from the real faculty-profile / registry contract.

It is not:

```text
social profile
CV / resume builder
academic identity graph
settings form
opaque AI-memory inspector
context-origin ledger
ranking-effect ledger
synthetic researcher ontology
```

The current frontend must not invent canonical Profile truth for:

```text
markets / entities
evidence preferences
inferred signals
accepted context
product-effect ledgers
profile-belief provenance
```

unless a durable backing profile model and authority contract are built first.

### Profile change rule

```text
PRODUCT MODEL        FROZEN
IA                   FROZEN
DATA HONESTY RULE    FROZEN
MAJOR REDESIGN       NO
VISUAL POLISH        YES
```

Permitted work is limited to in-place convergence such as:

```text
Memory hierarchy
Current research direction emphasis
Works density
Lab Linked / Suggested balance
Detail rail typography / spacing
thin-profile rendering
pilot / unbound labelling
responsive convergence
pixel polish
```

A richer faculty-profile backend does not automatically reopen Profile design.

If the backend later gains additional durable fields, those fields must first be evaluated against the existing `Memory → Works → Lab` composition. Only a proven inability to represent truthful research memory inside the frozen composition can justify reopening the page.

The default answer to a proposed Profile redesign is **no**.

---

## 4. What remains open

The following pages may still undergo active product-design iteration:

```text
HOME          OPEN — current Iteration 06 is only interim frozen
PREVIEW       narrow renderer / overlay validation remains
SETTINGS      truthful low-complexity convergence remains
SYNTHESIS     final major product-design problem remains
```

Responsive, component, and pixel convergence may continue across all pages, but must preserve frozen page ownership and composition.

---

## 5. Recovery rule

When a new agent, model, developer, or design session enters the repository:

```text
READ UI_PRODUCT_AUTHORITY.md
↓
READ THE PAGE'S FREEZE APPENDIX / GROUNDED FREEZE
↓
READ RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md WHERE RELEVANT
↓
IMPLEMENT OR POLISH INSIDE THE FROZEN COMPOSITION
```

Do not infer that an old component, screenshot, test, fixture, backend object, or newly added capability grants permission to redesign a frozen page.

```text
OLD UI
NEW BACKEND
NEW TOOL
NEW EVENT KIND
NEW MODEL OUTPUT

DO NOT OVERRIDE

FROZEN PRODUCT COMPOSITION
```

---

## Final lock

```text
DISCOVER
DO NOT REDESIGN.

LIBRARY
DO NOT REDESIGN.

PROFILE
DO NOT REDESIGN.

HOME
STILL UNDER REVIEW.
```

The frozen pages may be implemented better, rendered better, made responsive, and pixel-polished.

They are not waiting for another conceptual pass.
