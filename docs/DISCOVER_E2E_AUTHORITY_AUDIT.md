# Discover E2E — authority audit and classification

**Status:** Current test-contract for Discover browser gates  
**Date:** 2026-07-14  
**Authority:** Derived exclusively from [`UI_PRODUCT_AUTHORITY.md`](UI_PRODUCT_AUTHORITY.md)  
**Program:** [`UI_IMPLEMENTATION_PROGRAM.md`](UI_IMPLEMENTATION_PROGRAM.md)  
**Scope:** `e2e/v2-discover-loop.spec.js`, `e2e/v2-discover.spec.js`, and any Discover Playwright greps

This document is **not** product authority. It is the mandatory lens for interpreting Discover E2E results so “Playwright is red” is never ambiguous again.

---

## 1. Why this exists

On 2026-07-14 a Discover Playwright run against `:5179` produced many reds. Two distinct problems were present at once:

1. **Environment contamination** — the served frontend was not the tree under test.
2. **E2E contract drift** — several assertions still encode the superseded `Search | Activity` Discover model.

Discarding the contaminated run as **product evidence** was correct. Treating every red as “just contamination” was incomplete. Legacy Activity expectations would remain invalid even on a perfect isolated Vite instance.

**Required outcome:** clean environment **plus** authority-aligned tests. Only then do remaining reds mean CURRENT AUTHORITY FAILURE.

---

## 2. Product contract (Discover subset)

From `UI_PRODUCT_AUTHORITY.md`:

```text
Faculty destinations (only):
  Home · Library · Discover · Synthesis · Resources · Profile · Settings

Not destinations:
  Activity, Cluster, Pipeline, Preview, Approval, …

Discover internal modes (exactly two):
  Explore | History

Explore:
  search-first external candidates
  selection leaves list visible and drives Detail | Ask
  pending work may appear as an in-Explore review strip / selected request Detail
  Activity is NOT a third Discover tab

History:
  durable researcher lifecycle inbox
  Needs you · Active · Ready · Needs recovery · Scheduled
  NOT a worker dashboard
  NOT sourced from Resources activity events

Active research context:
  one named research object may influence and explain Discover recommendations
```

From `UI_IMPLEMENTATION_PROGRAM.md` Slice 1 acceptance:

```text
Select source → list remains visible → Detail changes.
Explore and History are the only Discover modes.
Legacy URLs land in Explore without losing query/selection context.
History is not sourced from Resources activity events.
```

Legacy aliases (`search`, `activity`, `approvals`, `awaiting`) may normalize into Explore with optional focus state. They must not revive an Activity workspace.

---

## 3. Failure classification vocabulary

Every Discover E2E result (pass or fail) must be reported with exactly one primary class:

| Class | Meaning | Typical action |
|---|---|---|
| **CURRENT AUTHORITY FAILURE** | Assertion matches current product authority; failure indicates product or live contract gap | Fix product / BE contract after a clean run |
| **LEGACY EXPECTATION** | Assertion targets superseded Search/Activity (or Resources-as-approve) model | Retire or rewrite before using as a gate |
| **SELECTOR DRIFT** | Behavior may be correct; locator/copy is not product authority | Update test to authority hooks; do not change product for the selector |
| **ENVIRONMENT FAILURE** | Wrong tree, contested port, overlapping Playwright, HMR from another worker, missing SHA identity | Discard run; fix harness; rerun report-only |
| **MIXED** | Part of the assertion is current; part is stale language or obsolete surface | Split the test; keep the current half |

Do not collapse LEGACY EXPECTATION into ENVIRONMENT FAILURE.

---

## 4. Identity protocol (required on every report)

“Playwright is red” is meaningless without identity. Every Discover E2E report must open with:

```text
git_sha:            <git rev-parse HEAD>
git_branch:         <git rev-parse --abbrev-ref HEAD>
repo_root:          <pwd of the git root under test>
drive_root:         <realpath drive>
vite_cwd:           <exact cwd used to start Vite>
vite_url:           <YZU_DESK_URL / baseURL>
vite_strict_port:   true|false
backend_url:        <API base, usually :8765>
data_mode:          live | fixture/mock | demo/offline
playwright_workers: <usually 1>
suites:             <paths>
authority_sha_note: <whether UI_PRODUCT_AUTHORITY.md matches tested tree>
```

### Known colliding identities (2026-07-14)

At least three trees were discussed as if they were one product:

```text
1. GitHub main (yzu-cluster) — authority normalized at ec5d939…
2. Local Sharpe-Renaissance worktree — e.g. feat/discover-fe-be-integration @ 9cb1310(+)
3. /tmp/yzu-discover-routes served on :5179 — materially different BrowsePage.jsx
```

Default Playwright `reuseExistingServer: true` against `:5179` will happily attach to identity (3). That is an ENVIRONMENT FAILURE, not a product verdict.

---

## 5. Contaminated run — discarded evidence

Full snapshot: [`status/generated/discover_e2e_contaminated_run_2026-07-14.md`](status/generated/discover_e2e_contaminated_run_2026-07-14.md)

Summary:

```text
Verdict: DISCARD as product evidence
Reason:  Vite :5179 → /tmp/yzu-discover-routes (+ overlapping Playwright)
Product code was correctly left unchanged from that run.
```

---

## 6. Classification — `e2e/v2-discover-loop.spec.js`

Titles reflect the suite as of 2026-07-14 (post Terra Explore-queue retarget; still contains one Activity summary test).

| Test title | Class | Authority notes | Rewrite / keep |
|---|---|---|---|
| suggested card commits search into SERP | **CURRENT AUTHORITY FAILURE** (after clean run) | Explore search-first; suggested commit into results | Keep; confirm hooks against Explore empty/home |
| search status settles without stuck Checking | **SELECTOR DRIFT** / clean rerun | Settling status is valid; `.rd-v2-discover-search-summary` is not product authority | Keep intent; prefer durable `data-testid` / toolbar count |
| query is preserved when the Explore queue opens | **MIXED** | Query preservation is Slice 1; “Review queue” copy may be stale vs “Needs your review” strip | Keep preservation; align copy/hooks to strip |
| Explore queue selection owns the rail | **CURRENT AUTHORITY FAILURE** (after clean run) | Pending selection drives Detail; list/strip remains | Keep; assert strip + rail, not Activity panel |
| header pending opens the Explore queue | **CURRENT AUTHORITY FAILURE** (after clean run) if rewritten; was **LEGACY** when it asserted Activity | Header pending → Discover Explore with focus / strip | Keep current Explore-queue form; reject Activity URL/mode |
| Discover exposes Explore and History as stable modes | **CURRENT AUTHORITY FAILURE** (critical) | Exactly two modes; no Activity tab; legacy `mode=activity` → Explore | Keep as hard gate |
| History shows the research trail and selected outcome in the rail | **CURRENT AUTHORITY FAILURE** (critical) | History inbox + Detail ownership | Evolve labels toward lifecycle states (`Needs you · …`) without requiring Activity |
| committed Discover search is shareable and survives History round trip | **CURRENT AUTHORITY FAILURE** / contract direction | Shareable `q=` + mode round-trip | Keep |
| Activity summarizes actionable acquisition states | **LEGACY EXPECTATION** | Asserts `mode=activity` + `discover-activity-summary` + Awaiting/Running worker dashboard | **Retire or rewrite** → History lifecycle / Explore strip + Detail |
| dataset-driven Discover reveals the research operating loop | **CURRENT AUTHORITY FAILURE** (critical) | Active research context must influence Discover | Keep |
| research context owns its column backgrounds… | Visual / layout gate | Not Discover mode authority; still useful pixel gate | Keep under visual slice |

### Explicit legacy titles that must not gate Slice 1

Any remaining assertion that requires:

```text
mode=activity | mode=approvals as a live workspace
discover-activity / discover-activity-summary / discover-activity-filters
Activity tab
Awaiting/Running/Queued as Discover Activity dashboard chrome
```

is **LEGACY EXPECTATION** until rewritten to:

```text
Explore + discover-queue-strip (or selected pending Detail)
  and/or
History row → Detail owns approval / recovery
```

---

## 7. Classification — `e2e/v2-discover.spec.js` (Activity-adjacent)

| Test title | Class | Notes |
|---|---|---|
| awaiting approval uses sticky approve in rail footer | **MIXED** → rewrite | Sticky approve in Detail is current; URL expecting `mode=(approvals\|activity)` + `discover-activity` is legacy |
| pending approvals open Discover Review queue, not Resources | **MIXED** → rewrite | “Not Resources” is current; Activity panel / `mode=activity` is legacy; target Explore strip |
| Discover Review queue shows acquisition jobs separate from Resources | **LEGACY EXPECTATION** (as written) | Uses `mode=activity` + `discover-activity*` | Rewrite to strip/History |

Other tests in this file (probe, Add to lab, Preview, Ask context, live API rows) are **candidate CURRENT** gates for Slices 1–3, but must still be classified on each run for selector drift vs authority.

---

## 8. Clean report-only audit procedure

Do **not** fix product code during this audit. Do **not** redesign. Do **not** rerun the contaminated suite blindly.

```bash
# 0) Identity
cd /path/to/Sharpe-Renaissance   # the tree you intend to certify
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
pwd
realpath drive

# 1) Free port; never attach to a foreign Vite by accident
export YZU_DESK_URL=http://127.0.0.1:5180
# Start Vite from THIS tree only, with strictPort:
#   cd <repo> && npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
# Confirm the process cwd is this repo (not /tmp/...).

# 2) Print report header (SHA, vite cwd, backend, live|fixture)

# 3) Discover E2E alone, single worker
mkdir -p .tmp-pw
TMPDIR=$PWD/.tmp-pw \
YZU_DESK_URL=http://127.0.0.1:5180 \
npx playwright test e2e/v2-discover-loop.spec.js e2e/v2-discover.spec.js \
  --workers=1 --retries=0

# Optional: set playwright webServer.reuseExistingServer=false for this audit,
# or stop any foreign server on the chosen port first.
```

On **first** failure capture:

```text
screenshot (Playwright already retains on failure)
trace
current URL
page title
relevant DOM excerpt (mode tabs, strip, history, rail)
failed network requests
```

Then classify each test with the vocabulary in §3. Make **zero** product changes in the audit pass.

JSON reporter path (existing config): `docs/status/generated/yzu_desk_e2e.json`.

---

## 9. Re-anchor checklist (after the clean audit)

1. Retire or rewrite every **LEGACY EXPECTATION** before calling Slice 1 “E2E green.”
2. Prefer `data-testid` hooks named for Explore / History / queue strip / research context over CSS class archaeology.
3. History assertions should converge on lifecycle inbox semantics, not worker dashboards.
4. Update this classification table when tests are rewritten; do not silently leave Activity titles in the suite.
5. Replace [`design/DISCOVER_LOOP_ANCHOR.md`](design/DISCOVER_LOOP_ANCHOR.md) phase gates with program slices; that anchor is historical.

---

## 10. Verdict on the 2026-07-14 Grok assessment (Codex review)

```text
Environment contamination diagnosis     Correct
Decision to stop Playwright             Correct
Decision not to fix product code        Correct
“Reds are not a verdict”                Correct
Treating all ten as merely contaminated Incomplete
```

Correct next instruction to implementers:

> We do not merely need a clean test environment; we need the Discover E2E suite re-anchored to the newly consolidated product authority. Clean port **plus** authority-aligned tests, report-only. Then remaining reds finally mean something.
