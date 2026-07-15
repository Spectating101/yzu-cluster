# Research Drive — Home Full-Scale Freeze

**Status:** INTERIM FROZEN VISUAL / INTERACTION AUTHORITY  
**Date:** 2026-07-16  
**Scope:** `Home` desktop composition, scaling limits, and re-entry ownership  
**Current authority:** Visual Iteration 06 — Re-entry Brief  
**Freeze posture:** preserve this composition until explicitly reopened by product review

This document preserves the Home convergence reached after repeated visual iteration.

Home is not where sustained research happens.

```text
A NORMAL RESEARCH DRIVE SESSION

HOME
↓
DISCOVER
↓
LIBRARY
↓
SYNTHESIS
↓
LIBRARY
↓
DISCOVER
↓
...
```

The user may not revisit Home during the session. That is acceptable.

Home exists to reconstruct orientation before the researcher returns to the actual work surfaces.

---

## 1. Home ownership

The rejected framing was:

```text
WHAT DO I DO NOW?
```

The stronger framing is:

```text
WHERE WAS I?

WHAT MATERIALLY CHANGED IN MY RESEARCH ESTATE?

IS THERE ANYTHING NEW AROUND MY RESEARCH
THAT MAY BE WORTH THINKING ABOUT?
```

Home is therefore a **research re-entry brief**.

It is not:

```text
command centre
metrics dashboard
worker monitor
catalogue
job dashboard
generic chat landing page
activity feed
session analytics surface
```

Do not show pseudo-personal telemetry such as:

```text
You were last here yesterday at 23:41.
```

Home may know resume state. It should not make login/session chronology the content experience.

---

## 2. Current frozen hierarchy

```text
WHERE YOU LEFT OFF

WHAT CHANGED

NEW AROUND YOUR RESEARCH

RECENT
```

The sections answer different questions:

```text
WHERE YOU LEFT OFF
=
Which exact research objects can I resume?


WHAT CHANGED
=
What durable consequence, decision state,
or unresolved gap changed in our research estate?


NEW AROUND YOUR RESEARCH
=
What source / evidence / research development
may be relevant enough to spark further investigation?


RECENT
=
What other research objects was I touching?
```

`WHAT CHANGED` and `NEW AROUND YOUR RESEARCH` must never collapse into one generic updates feed.

```text
WHAT CHANGED
=
OUR RESEARCH ESTATE CHANGED

NEW AROUND YOUR RESEARCH
=
THE EVIDENCE WORLD MAY HAVE SOMETHING RELEVANT
```

---

## 3. Full-scale binding visual

The following complete CLI wireframe is the current Home implementation target and backup authority.

```text
RESEARCH DRIVE — HOME
VISUAL ITERATION 06

RE-ENTRY BRIEF

DESKTOP / 1440 × 1024

CURRENT BEST CANDIDATE
INTERIM FROZEN


┌────────────────────────┬─────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────┐
│ RESEARCH DRIVE         │ STABLECOIN RESEARCH ▾   HOME                                                │ DETAIL ●              ASK           │
│                        │                                                                             │ ACTIVE RESEARCH                     │
│  ● Home                │ HOME                                                                        │                                     │
│    Library             │                                                                             │ STABLECOIN RESEARCH                 │
│    Discover            │ WHERE YOU LEFT OFF                                                          │                                     │
│    Synthesis           │                                                                             │ Stablecoins                         │
│    Resources           │ PRIVATE USDT TRANSACTIONS                                                   │ Event studies                       │
│    Profile             │ Source relationship under review                                            │ Market structure                    │
│    Settings            │                                                                             │                                     │
│                        │ Self-provided evidence · matched against BigQuery                            │ CURRENT RESUME                      │
│ ACTIVE RESEARCH        │ Library / Raw evidence                                                      │                                     │
│                        │                                                                             │ PRIVATE USDT TRANSACTIONS           │
│ Stablecoin Research   │                                                         [ Continue ]         │                                     │
│                        │                                                                             │ Library · Raw evidence              │
│ Event studies          │ STABLECOIN EVENT STUDY PANEL                                                │                                     │
│                        │ Input readiness · 1 unresolved evidence gap                                  │ Source relationship under review    │
│ Market structure       │ Synthesis                                                       Continue →  │                                     │
│                        │                                                                             │                                     │
│ ────────────────────── │ ─────────────────────────────────────────────────────────────────────────── │                                     │
│                        │                                                                             │                                     │
│ RECENT                 │ WHAT CHANGED                                                                │                                     │
│                        │                                                                             │                                     │
│ USDT transactions      │ 01   USDT TRANSACTION DATASET                                               │                                     │
│ Event study panel      │      Registration completed · evidence is now query-ready                    │                                     │
│                        │                                                                    Library → │                                     │
│                        │                                                                             │                                     │
│                        │ 02   HISTORICAL USDT TRANSACTIONS                                           │                                     │
│                        │      Acquisition method ready for researcher review                          │                                     │
│                        │                                                                    Review →  │                                     │
│                        │                                                                             │                                     │
│                        │ 03   STABLECOIN EVENT STUDY PANEL                                           │                                     │
│                        │      Pre-2021 transaction evidence remains missing                           │                                     │
│                        │                                                                    Gap →     │                                     │
│                        │                                                                             │                                     │
│                        │ ─────────────────────────────────────────────────────────────────────────── │                                     │
│                        │                                                                             │                                     │
│                        │ NEW AROUND YOUR RESEARCH                                                     │                                     │
│                        │                                                                             │                                     │
│                        │ STABLECOIN ISSUER RESERVE DISCLOSURES                                       │                                     │
│                        │ New source evidence may support issuer-level event timing.                   │                                     │
│                        │                                                                    Explore → │                                     │
│                        │                                                                             │                                     │
│                        │ A COMPARABLE EVENT-WINDOW DESIGN                                            │                                     │
│                        │ Newly indexed research uses a related shock-window method.                   │                                     │
│                        │                                                                    Explore → │                                     │
│                        │                                                                             │                                     │
│                        │ ─────────────────────────────────────────────────────────────────────────── │                                     │
│                        │                                                                             │                                     │
│                        │ RECENT                                                                      │                                     │
│                        │                                                                             │                                     │
│                        │ Market stress events    LIBRARY       Ethereum / USDT history      DISCOVER  │                                     │
│                        │ Attention panel         PREVIEW       Event study panel            SYNTHESIS │                                     │
│                        │                                                                             ├─────────────────────────────────────┤
│                        │                                                                             │ [ Continue ]                        │
│                        │                                                                             │ Ask about active research           │
├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
│ Stablecoin Research    │ Resume points · material state changes · bounded research novelty              │ Research orientation                 │
└────────────────────────┴─────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────┘
```

---

## 4. Desktop scaling is a hard product rule

Home must fit within the desktop application viewport.

```text
DESKTOP HOME PAGE SCROLL
=
NEVER
```

Home is a projection, not an inventory.

The hard display caps are:

```text
WHERE YOU LEFT OFF

1 PRIMARY RESUME POINT
1 SECONDARY RESUME POINT MAX


WHAT CHANGED

3 ITEMS MAX


NEW AROUND YOUR RESEARCH

2 ITEMS MAX


RECENT

4 ITEMS MAX
```

Examples:

```text
10 MATERIAL CHANGES EXIST

HOME DOES NOT SHOW 10.
HOME RANKS 3.


47 RESEARCH UPDATES EXIST

HOME DOES NOT SHOW 47.
HOME RANKS 2.


18 RECENT OBJECTS EXIST

HOME DOES NOT SHOW 18.
HOME SHOWS 4.
```

Overflow routes to the owning surface:

```text
Library
Discover / History
Synthesis
Explore
```

Do not introduce a Home-local infinite list, carousel, accordion archive, or scroll feed to preserve more items.

---

## 5. Where You Left Off

The current Home implementation uses the first recently touched dataset as `Continue`.

That is insufficient as the final projection because:

```text
RECENT DATASET
≠
EXACT WORKING CONTEXT
```

The target resume concept is a typed resume point:

```text
resume_point

kind
object_id
title
page
state_summary
location
last_interacted_at
```

The centre displays the object and exact resumable state, not a claim about the researcher's cognition.

Allowed:

```text
PRIVATE USDT TRANSACTIONS
Source relationship under review
Library / Raw evidence
```

Avoid narrative inference such as:

```text
You were thinking about whether the dataset had been transformed.
```

unless a durable research note or explicit conversation state actually establishes that claim.

The primary resume point is visually dominant.

The secondary resume point is a single compact line.

---

## 6. What Changed

`WHAT CHANGED` is not an activity feed.

It is a bounded researcher-specific changelog of durable consequences and material states.

Normal grammar:

```text
01   OBJECT
     exact durable consequence
                                              destination →
```

Example:

```text
01   USDT TRANSACTION DATASET
     Registration completed · evidence is now query-ready
                                              Library →
```

Candidate change classes include:

```text
researcher decision now available
readiness changed
verification relationship changed
registration completed
output registered
material acquisition state changed
known evidence gap recorded / changed
bounded failure requiring researcher attention
```

Do not promote ordinary execution noise:

```text
worker started
poll completed
heartbeat updated
progress changed 41% → 43%
cache refreshed
```

Home does not become Resources or Discover History.

The ranking priority is approximately:

```text
1. researcher decision required
2. durable consequence affecting evidence use
3. material unresolved gap
4. bounded failure / recovery state
5. other material state change
```

The exact rank must be grounded in durable state authority rather than generated urgency copy.

---

## 7. New Around Your Research

This is the optional serendipity layer.

It exists because Home may be useful not only for memory reconstruction but also for a small amount of research-adjacent novelty that can spark investigation.

It must remain bounded and curated.

```text
2 ITEMS MAX
```

The preferred visual balance is:

```text
ONE EVIDENCE / SOURCE DEVELOPMENT

+

ONE PAPER / METHOD / RESEARCH DEVELOPMENT
```

Examples:

```text
STABLECOIN ISSUER RESERVE DISCLOSURES
New source evidence may support issuer-level event timing.
Explore →


A COMPARABLE EVENT-WINDOW DESIGN
Newly indexed research uses a related shock-window method.
Explore →
```

This section is **not required for the first Home implementation**.

Until a truthful freshness and source-authority contract exists:

```text
NO REAL UPDATE AUTHORITY
↓
SECTION DISAPPEARS
```

Do not fill the territory with fake recommendations, generic AI ideas, or stale profile prompts.

A future projection may use:

```text
faculty profile
specialties
research tracks
starter prompts
procurement recommendations
default search query

        ↓

profile-aligned Discover / source search

        ↓

freshness + novelty + source authority filter

        ↓

2 bounded research updates
```

The eventual object shape may be:

```text
research_update

title
update_type
summary
profile_match_signals
source_authority
observed_at
discover_handoff
```

This is a future backend contract, not permission to hardcode the visual examples above.

---

## 8. Recent

Recent is low-weight orientation only.

```text
RECENT

Market stress events    LIBRARY
Ethereum / USDT history DISCOVER
Attention panel         PREVIEW
Event study panel       SYNTHESIS
```

Maximum four objects.

Recent should become typed-object recency rather than dataset-only recency:

```text
recent_object

kind
object_id
title
page
last_interacted_at
```

Current dataset localStorage recency may remain as an implementation fallback until cross-page typed recency exists.

Recent must not become an activity timeline.

---

## 9. Empty-state scaling

A section with no authoritative data disappears.

```text
NO MATERIAL CHANGES
→ WHAT CHANGED disappears

NO FRESH RESEARCH UPDATE AUTHORITY
→ NEW AROUND YOUR RESEARCH disappears

NO SECONDARY RESUME POINT
→ show primary only
```

Do not inflate remaining sections to fill the entire viewport with giant cards or decorative emptiness.

A quiet Home is valid:

```text
WHERE YOU LEFT OFF

PRIVATE USDT TRANSACTIONS
Source relationship under review

                                   [ Continue ]


NEW AROUND YOUR RESEARCH

STABLECOIN ISSUER RESERVE DISCLOSURES
New source evidence may support issuer-level event timing.

                                                     Explore →


RECENT

Market stress events · Ethereum / USDT history · Event study panel
```

---

## 10. Detail / Ask

Home uses the quietest right-rail implementation in the product.

Default Detail owns:

```text
ACTIVE RESEARCH

current research identity
bounded current context
current resume object
```

Example:

```text
ACTIVE RESEARCH

STABLECOIN RESEARCH

Stablecoins
Event studies
Market structure


CURRENT RESUME

PRIVATE USDT TRANSACTIONS

Library · Raw evidence

Source relationship under review
```

The rail may provide:

```text
[ Continue ]
Ask about active research
```

It is not an asset inspector duplicate. Exact asset authority still belongs to Library Detail after resume.

`Ask` remains the application-wide stable tab name. Composer / Cite-Agent may receive active research and resume scope where truthful.

---

## 11. Rejected Home directions

### Rejected: command centre

```text
CONTINUE WORKING
SEARCH THE LAB | DISCOVER DATA | ASK
ATTENTION
RECENT
SUGGESTED ASKS
DESK STATS
RUNNING JOBS
```

Reason:

```text
TOO MANY COMPETING IDEAS
TRIES TO MAKE HOME A CONTINUOUS WORK SURFACE
DUPLICATES PERMANENT NAVIGATION
DRIFTS INTO DASHBOARD / OPERATIONS
```

### Rejected: research-intention hero as permanent Home ownership

```text
WHAT ARE YOU INVESTIGATING?
```

Reason:

```text
USEFUL AS A START CONCEPT
BUT WRONG AS HOME'S PRIMARY LONG-TERM ROLE

AFTER PRODUCT ADOPTION,
RESEARCHERS ENTER THROUGH RESUME / CONTEXT,
THEN MOVE TO DISCOVER / LIBRARY / SYNTHESIS
```

Research intention remains valuable in Ask / Discover initiation. It is not the permanent Home hero in this freeze.

### Rejected: last-session telemetry

```text
You were last here yesterday at 23:41.
```

Reason:

```text
FEELS LIKE SESSION ANALYTICS
NOT RESEARCH ORIENTATION
```

### Rejected: narrative reconstruction of cognition

```text
You were reviewing the source relationship...
The event-study panel also still has...
```

Reason:

```text
SYSTEM MAY KNOW OBJECTS + STATES
WITHOUT KNOWING THE RESEARCHER'S ACTUAL TRAIN OF THOUGHT
```

### Rejected: split update dashboard

```text
WHAT CHANGED              RESEARCH PULSE
3 rows                    3 rows
```

Reason:

```text
CLEAN
BUT STILL A DASHBOARD
```

The current vertical editorial re-entry brief is stronger.

---

## 12. Freeze rule

The binding current Home composition is:

```text
WHERE YOU LEFT OFF
↓
WHAT CHANGED
↓
NEW AROUND YOUR RESEARCH
↓
RECENT
```

with hard desktop display caps:

```text
2 resume points max
3 material changes max
2 research updates max
4 recent objects max
no desktop page scroll
```

This composition is **interim frozen** for preservation and implementation planning.

It may be reopened only by explicit product review or by a material backend contradiction discovered during implementation.

The first implementation does **not** need to invent `NEW AROUND YOUR RESEARCH`. The section disappears until a truthful freshness / authority projection exists.

The immediate implementation priority is:

```text
1. remove command-centre clutter
2. preserve one-viewport Home
3. introduce typed resume-point projection or honest fallback
4. derive bounded material changes from durable page states
5. expand dataset-only recency toward typed recent objects
6. add research updates only after source freshness authority exists
```
