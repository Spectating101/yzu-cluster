# Research Drive — handoff, 2026-08-24

Written after a long two-agent session. Read the traps section before touching
the release machinery; several of them cost hours today.

## Live state

    UI       7af5c38b
    backend  39915476
    serving tree   research-drive-…-ui-r5-build   ← this moved today
    backend tree   research-drive-…-r2
    rollback       7af5c38b -- 795dae61
    env backup     ~/.config/research-drive/front-door.env.before-7af5c38-20260824

Verified green: restartability probe ready, 139 datasets and registry
fingerprint preserved across restart, cold Discover approximately 1.5–3 seconds,
and the authenticated surface/viewport gate passed with no console errors or
horizontal overflow. A live Chrome sweep after release covered every faculty
destination at the browser's actual 1920×961 content viewport.

The development commit `6e081c6` and released commit `e99ea1c0` have the same
Git tree (`7a1553385df5501ad0b63ecdeb54ddf06f2c28c9`). The former is not an
unshipped UI change; the release process replayed it under the latter identity.

The final adaptive-density release is `7af5c38b--39915476`. Its candidate gate
passed 37 browser contracts, 5 focused page integrations, and 4 proxy-safety
tests. Backend verification passed 155 drive tests and 1,230 root tests (eight
environment-dependent skips). The post-restart exercise preserved 139 served
datasets and registry fingerprint `006a0276b94ee64c`, with the first
authenticated Discover query completing in 0.820s. The expanded deployed audit
(including 1920×961 and the 1920×905 short-height regression) completed with no
request, console, page-error, gate, or overflow failure.

Seven Refinitiv registry rows now resolve bytes that were already present in
the July backfill. The repair is reproducible through
`scripts.research_data_mcp.registry_relink`: report-only by default, apply only
when the row lacks `local_path` and the file exists, and idempotent on a second
run. All seven returned rows through the live authenticated `/query/{id}` path.

Direct `status` turns now describe the files produced by completed collection
jobs. A production-only symlink boundary found during release verification was
fixed: artifact links retain their logical `data_lake/procured/...` namespace
even when the physical runtime drive is outside the backend checkout. A real
completed TWSE job returned two artifacts, their sizes, and its promoted
dataset id after the fix.

## Live page and workflow sweep

The following was observed in the authenticated Chrome, not inferred from
fixtures or source strings:

- **Home:** a query-ready pickup, a second evidence continuation, storage and
  assistant headroom, and the recent trail all project real desk state. The
  lower canvas stays deliberately quiet once those decisions are exhausted.
- **Library:** shelf root → selected dataset workspace → 12-row/8-field preview
  works against the live query endpoint. Evidence shape, intended use,
  boundary, sample rows, queryability, and verification remain visually
  distinct.
- **Discover Explore:** idle estate → named staged lookup → ranked offerings →
  selected-source inspector works. A live `stablecoin` search preserved 18
  Library matches while returning 3 offerings and 2 references. Wide
  workstations name compact facts (`TYPE`, `ROUTE`); 1440 stays terse and the
  synthetic tall view expands descriptions and facts.
- **Discover History:** researcher decisions, ready outcomes, recovery cases,
  and system checks are separate territories. Selecting a row projects status,
  use-now truth, risk, evidence, and next action into the rail.
- **Synthesis:** Define and Map Evidence are complete for the selected thread;
  2 held inputs and 72 columns are measured without an assistant. The decision
  checkpoint is above the fold. Reason and Approve remain honestly blocked by
  the unverified assistant rather than behaving like demo actions.
- **Resources:** Sources reports capacity/access, Usage shows the live activity
  ledger, and Method explains Find → Acquire → Execute → Promote. The page also
  exposes the real operational weakness: 5 collectors registered, none
  connected, and 3 stale.
- **Profile:** research memory, works, methods, direction, and suggestions are
  coherent, but the visible identity is still the labelled EXAMPLE until the
  faculty identity is deliberately bound.
- **Settings:** session/access, identity, services, and display controls work;
  cold aggregate truth takes roughly 7–12s to settle. It stays `Syncing…` and
  then resolves to live/degraded, assistant unverified, and the current approval
  count rather than inventing readiness.

## The serving tree moved

`ui-r4` was the serving clone. It is now **ui-r5-build**, and `ui-r4` is a
development mirror one release behind. Both `.desk-role` files were updated, so
they currently tell the truth — but the labels have lied before. Always run
`scripts/desk-baseline.sh`; never trust the label.

`ui-r4/dist` previously dangled at the ancient `22ff7c8` release. The stale
symlink was removed during the consolidation pass; `ui-r5-build/dist` remains
the only release symlink used by the service.

## Traps that cost real time today

**`find` is rewritten in some shells.** Bare `find` returned 0 matches where
`/usr/bin/find` returned 33. This produced a confident, wrong conclusion that
the other agent had stopped working when it had six commits. The project notes
already warn about this for `git` and `du`. Use absolute paths for anything you
reason from.

**Do not assume an agent shell's `$HOME` is the user's home.** Some agent
environments replace it and some do not. Pass the explicit `FRONT_DOOR_ENV`
expected by the release scripts (or validate `HOME=/home/phyrexian`) before
running `promote_front_door.sh`, `serve_candidate.py`, or
`candidate-release-gate.sh`. Do not reach for `PROMOTE_SKIP_PREFLIGHT=1` — the
preflight is not the problem.

**Never leave the serving tree HEAD inconsistent with the env pin and built
identity.** The front door refuses to start unless the UI checkout SHA equals
`YZU_PUBLIC_SHA` and the build stamp matches. An ordinary development commit in
that tree makes the desk un-restartable. The controlled release workflow is the
exception: it advances the release identity, updates the pin, runs preflight,
and only then restarts. Skipping that sequence caused a real outage today.

**A build in the serving clone overwrites the live release in place.** `dist` is
a symlink into the release directory. `npm run build` there writes through it.
Build into a throwaway directory or use `release:stage`.

**e2e against the deployed URL cannot test local changes.** A spec run with
`YZU_DESK_URL` pointed at :8765 passes regardless of what you edited. Session
bootstrap is host-bound so a vite dev server cannot authenticate either. Use
`scripts/serve_candidate.py` to serve a built candidate with the desk token
injected server-side; that is what makes a pre-promote gate possible.

**A mutation test that passes is a result, not a green light.** Three times
today a mutation silently failed to apply (string mismatch on indentation) and
the "passing" test proved nothing. Verify the mutation actually changed the file.

## What is settled

Truth-state defects across four surfaces, all the same shape — the desk knew
something and did not say it:

- Home branched on "a key exists" and printed "Composer ready"; it now reads the
  same `composer_runtime` probe as Settings and Resources.
- History collapsed query-ready and archived-unusable holdings into one
  "Registered" label across 39 of 60 live rows; also could not distinguish a
  stopped refresh from a running one, and sent blocked collections after an
  execution failure when a licence gate had refused them.
- Discover reported "No Library alternative found" for datasets it held, because
  source identity compared a stable id on one side against a display label on
  the other.
- Synthesis styled a failed build as the step in progress, on both the execution
  track and the visible stage strip.

Cold Discover search went from ~13s (client timeout, rendered as a false zero
result) to roughly 1.5–3s: the embedding model and corpus vectors are warmed at
startup and a request no longer pays their full lazy-load cost.

The Library estate went from 13.3s to ~3s by loading navigation before the
resources rollup and aggregate health, which the boot comment already said to
defer.

Releases are now gated: promotion refuses when the desk could not restart into
the release, with a negative test proving the refusal.

## Open work

**Discover semantic relevance.** Still the substantive product gap. Read
`docs/findings/discover-relevance-measurements.md` first — two people have
independently tried a score threshold and the distributions provably overlap.
Do not spend a third day on it. Subject-term overlap, IDF-weighted, is the
direction that measured well.

**Synthesis Reason/Approve.** Correctly gated behind an unverified reasoning
provider. Not a defect; needs a provider.

**Operational backlog now visible because the interface stopped hiding it:**
7 pending approvals, 4 failed jobs, 39 registered-but-not-queryable records.
The last count includes receipt-only records that are intentionally not
queryable; do not treat it as 39 missing datasets. Nine Refinitiv registry rows
still have no matching local backfill file and remain genuine acquisition work.

**Housekeeping.** The serving tree now retains exactly two releases: live
`7af5c38b--39915476` and rollback `7af5c38b--795dae61`. Older release
directories were moved intact to
`Molina-Optiplex/research-drive-release-archive-20260824/`; nothing was deleted.
Five clean `/tmp` worktrees were removed after their branch refs were verified,
reducing this repository from 19 to 14 registered worktrees. The remaining
trees include dirty or non-ancestor work and require explicit disposition; do
not remove them as a batch.

**Backend capability sweep.** The original lead list was reduced substantially
by reachability and manual triage; unused does not mean missing. Continue to
classify remaining candidates as real gap, redundant duplicate, or deliberately
held — all three categories exist, and wiring a redundant one would double-queue
archive jobs. `apply_probe_catalog_hints` remains the best candidate and needs
probe results threaded into plan construction.

## Regression gates worth knowing about

    npm run test:candidate-key      unit, fast
    npm run test:runtime-contract   contracts
    npm run test:lifecycle-states   rendered history states, needs a candidate
    npm run test:synthesis-states   rendered execution track, needs a candidate
    npm run test:boot-recovery      hangs /health and the rollup, proves the estate still arrives
    scripts/candidate-release-gate.sh   the whole browser contract against a built candidate
    scripts/audit_deployed_desk.mjs     read-only live pages, workflows, widths, console, network

The rendered specs use fixtures because live data never produces failed,
blocked, pending_approval, paused or stopped. Every defect found in those states
existed precisely because nobody could see them.

The deployed audit must wait for a terminal preview outcome (rows or the
explicit unavailable panel), not merely for a loading status to be hidden. The
modal becomes visible one frame before React mounts its spinner; the old wait
could therefore capture a healthy 344ms query as a zero-row failure.
The destination sweep and workflow exercise also run on separate pages. Rapid
cross-page capture intentionally cancels enrichment calls and can otherwise
fill Chromium's per-origin connection pool, making the following workflow test
measure audit-created backlog instead of the workflow itself.
