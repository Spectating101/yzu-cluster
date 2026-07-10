# Discover audit + specification (pre-implementation)

**Date:** 2026-07-11  
**Repos:** `Spectating101/yzu-cluster` @ `ba270376` + Sharpe-Renaissance `drive/` backend  
**Status:** Audit complete — **do not implement** until this report is approved.

---

## CI baseline

| Item | Value |
|------|--------|
| New `main` SHA | `ba270376a0b91bb4db68988ffe74b8604282ade2` |
| Prior tip | `cf70bd68c77ca2d757342f299dfcfd39acbb2c58` (still visible as parent) |
| Merge method | Fast-forward only (`git merge --ff-only`) — no squash/amend/cherry-pick/force-push |
| Commit subject | `fix(ci): stop Pages base from breaking Playwright webServer` |
| Files in fix | `vite.config.js`, `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml` only |
| CI run | https://github.com/Spectating101/yzu-cluster/actions/runs/29110877090 |
| CI conclusion | **success** (`build-and-mock-e2e`) |
| Exact mock e2e | **`npm run test:v2-mock` → 40 passed (1.7m)** locally with `CI=true YZU_PAGES=false`; CI step **Mock e2e (no live API)** succeeded |
| Product UI | Unchanged (no Home / Discover / Library edits in this commit) |
| Pages deploy | https://github.com/Spectating101/yzu-cluster/actions/runs/29110877087 — **failed** (expected until Settings → Pages → Source → GitHub Actions). **Manual repo setting; not an app-code fix.** |

Preserved contract:

- Pages build: `YZU_PAGES=true`
- Mock Playwright: `YZU_PAGES=false`
- Base path no longer keyed off `GITHUB_ACTIONS`

---

## Discover audit

### Workflow map (current)

```text
research need
  → header search / suggestion chip (BrowsePage)
  → GET /library/discover  (local registry / smart_search)
  → on empty|index_miss|weak_match → GET /library/search (unified: DataCite/HF/…)
  → if still no acquire-able URL → GET /library/discover/web
  → else offline demo catalog (deskSeed)
  → select row → Detail rail (BrowseRailPanel)
  → optional Probe → POST /library/discover/probe
  → Add to lab:
       if connector_id → POST /library/discover/collect (often pending_approval)
       else → Ask with structured plan (Composer / MCP)
  → approval / worker (Resources + JobService)  ← mostly OFF Discover canvas
  → RegistryPromoter + CollectionFlywheel + optional GDrive archive
  → later Discover/Library hit via dataset_id / local_ready
```

**Gap vs intended journey:** Discover ends at “queued / Ask.” Running, failed, completed, archive path, and “now queryable” are not first-class Discover states.

### Component / file map (frontend)

| Role | Path |
|------|------|
| Page | `drive/src/v2/BrowsePage.jsx` |
| Empty | `drive/src/v2/DiscoverEmptyState.jsx` |
| Pipeline chrome | `drive/src/v2/DiscoverPipeline.jsx` |
| Card state heuristics | `drive/src/v2/browseMeta.js` |
| Keys / Add-to-lab copy | `drive/src/v2/discoverActions.js` |
| Shell / probe / collect | `drive/src/v2/App.jsx` |
| Detail rail | `drive/src/v2/RailPanels.jsx` (`BrowseRailPanel`) |
| Detail\|Ask chrome | `drive/src/v2/InspectorRail.jsx` |
| Ask | `drive/src/v2/AskRail.jsx`, `useAskChat.js` |
| API | `drive/src/v2/api.js` |
| Demo seed | `drive/src/v2/deskSeed.js`, `drive/config/desk_demo_catalog.json` |
| Contract docs | `docs/DISCOVER_ACQUISITION.md` |

### Backend dependency map

| Concern | Path |
|---------|------|
| HTTP surface | `drive/scripts/research_data_mcp/http_router.py` |
| Gateway | `drive/scripts/research_data_mcp/gateway.py` |
| Discover ranking | `drive/scripts/research_data_mcp/procurement_search.py` / `procurement_fast.py` |
| Unified search | `drive/scripts/research_data_mcp/unified_search.py` |
| Probe | `drive/scripts/research_query_engine/procurement.py` |
| Job complete → promote | `drive/scripts/research_data_mcp/bootstrap.py`, `registry_promotion.py` |
| Archive | `drive/scripts/research_data_mcp/archive_after_job.py` |
| Source truth | `drive/config/databank_source_map.json`, `desk_sources.json`, `research_query_registry.json` |
| UI proxy | `yzu-cluster/vite.config.js` → `:8765` |

### Audited states

| # | State | Status | Notes |
|---|-------|--------|-------|
| 1 | Initial / no-query | **Implemented** | `DiscoverEmptyState` + suggestions |
| 2 | Search loading | **Implemented** | “Searching catalogs…” |
| 3 | Local registry hit | **Implemented** | `/library/discover` |
| 4 | Multiple local hits | **Implemented** | list + filters |
| 5 | External candidates | **Implemented** | unified + web |
| 6 | Mixed local+external | **Implemented** | concat + `dedupeRows` |
| 7 | No results | **Implemented** | empty + optional Ask web CTA |
| 8 | Search/connector error | **Partial** | catch → demo or generic banner; no per-connector error |
| 9 | Candidate selected | **Implemented** | sets `browseRow` + Detail |
| 10 | Candidate deselected | **Not found** | only cleared on new query |
| 11 | Probe pending | **Implemented** | Probing… / Add disabled |
| 12 | Probe success | **Implemented** | summary + connector fields |
| 13 | Probe warning / incomplete | **Not found** | no warning severity |
| 14 | Probe failure | **Implemented** | error string |
| 15 | Inaccessible / unsuitable | **Partial** | no-URL error; no legal/robots UX |
| 16 | Add-to-lab enabled | **Implemented** | sticky primary |
| 17 | Add-to-lab unavailable | **Partial** | only when already in lab → Open in Library |
| 18 | Collection queued | **Partial** | fuzzy title↔job match; pill “Queued” |
| 19 | Collection running | **Not found** on Discover |
| 20 | Approval required | **Not found** on Discover (Resources/Ask) |
| 21 | Collection failed | **Not found** on Discover |
| 22 | Collection completed | **Partial** | only as eventual `in_lab` |
| 23 | Registered → rediscoverable | **Implemented** (backend) | promoter + flywheel; UI via `labIds` |
| 24 | Stale selection after new query | **Implemented** | cleared in App |
| 25 | Detail\|Ask transitions | **Implemented** | select→Detail; Add/Ask→Ask |

### Screenshots

Directory: `docs/screenshots-review/discover-audit-current/`  
Viewports: `desktop-1440x900`, `tablet-900x1200`, `mobile-390x1200`  
Capture harness: `e2e/discover-audit-screenshots.spec.js` (audit-only; not part of CI suite)

| Prefix | States covered |
|--------|----------------|
| `01-initial-empty` | no-query |
| `02-local-or-demo-hit` | demo/local list |
| `03-candidate-selected` | selected + rail |
| `03b-selected-rail-sheet` | tablet/mobile selected |
| `04-mops-selected-before-probe` | selected pre-probe |
| `05-probe-success` | probe toast + (tablet) probe evidence block |
| `06-add-to-lab-ask-queued` | Ask + toast “Collection job queued” |
| `07-empty-no-results` | empty |
| `08-external-candidates` | web/external list |
| `09-external-selected` | external selected |
| `10-search-error-or-fallback` | error/fallback |

**Visual findings from captures:**

- Desktop rail repeats Fit/Access/Probe/Destination already on the card.
- Probe evidence often sits below the fold; toast is the only immediate confirmation.
- Tablet: pipeline label truncates (`Approv`); candidate title truncates; three-pane pressure is real.
- Mobile: selection highlight works, but **Detail\|Ask bottom sheet did not appear** in the selected-state capture — primary actions (Add to lab / Probe) are not reachable from the list alone. Treat as **blocker** for mobile Discover.

### Decision-system checklist (per candidate)

| Question | Current answer quality |
|----------|------------------------|
| What is this? | Title + short description — OK |
| Why relevant? | Keyword “Faculty finance/crypto fit” heuristic — **overclaims** |
| Already possess equivalent? | Exact `dataset_id` / vault flags only — **no sufficiency** |
| Local / remote / metadata / query-ready? | Partial chips; all rows `data-kind="external"` |
| Publisher? | Source string — OK |
| Evidence? | Probe summary if run — thin |
| Access / license / auth / cost / rate? | License string; auth/cost/rate mostly absent |
| Coverage (time/geo/entity)? | Coverage string if present; geo/entity weak |
| File/API shape? | After probe: access_mode, content_type, file count |
| Uncertainty? | Not distinguished (verified vs inferred) |
| What Add to lab does? | Toast + Ask copy; approval path opaque on Discover |
| Where stored? | “Lab root” / vault — vague |
| When queryable? | Not shown |
| Next step? | Rail NEXT line — OK but often stale vs true job state |

### Source activation matrix

Depth: R reachable · D discoverable · P procurable · A archivable · N normalizable · Q query-ready · J join-ready · V research-validated · U reusable

| Source | Depth | Enumerate | Meta search | Preview | Collect | Normalize | Auto-register | Later local | Custom eng still needed |
|--------|-------|-----------|-------------|---------|---------|-----------|---------------|-------------|-------------------------|
| Local registry | R D Q U (+P/A via jobs) | Yes | Yes | describe/open | via jobs | domain | Yes (promote) | Yes | Join keys incomplete |
| GDrive vault | R A U | Mirror/FTS | Not live Drive API | hydrate | archive path | — | via flywheel | Yes | Live Drive search |
| MOPS | R D P | Desk/queue | Yes | limited | queue/scrape | partial | if promote | if path | Full normalize |
| TWSE | R D P Q* | Desk | Yes | OpenAPI layer | http_manifest | partial | yes* | sample layer | Full history product |
| SEC EDGAR | R D P Q* | Registry/scripts | limited | open | queue | domain | yes* | data_lake/sec | Generic EDGAR Discover |
| DataCite | R D P A Q* | API+harvest | Yes | resolve | `datacite_collect_doi` | partial | Yes | Yes | Size/repo gaps |
| Hugging Face | R D P Q* | API | Yes | HF path | `huggingface_collect_dataset` | load | Yes | Yes | License per set |
| GDELT | R D* P* A N Q* J* | Pipelines | Thin in Discover | panels | fleet/queue | Yes | registry cards | Yes | Discover-thin vs bulk |
| BigQuery | R Q (live) | list/schema | — | schema | read (gated) | — | not panels | live | Materialize panels |
| CoinGecko | R Q* | live/registry | — | — | live | — | — | live | Historical vault |
| Open repos / web | R D P* | web_discover | Yes | probe sample | http_manifest/scrape | as-is | if files | if promote | Site-specific |
| LSEG/CRSP/CapIQ/WRDS | R D* P† | source_map | — | — | licensed/manual | — | — | materialized | Entitlements |

\* partial † operator/licensed

**Do not frame the platform around “~150 datasets.”** That is a registry snapshot. Activation depth and reusable connector recipes are the real metrics.

### Local vs external equivalence

| Mechanism | Reality |
|-----------|---------|
| In-lab | Exact `dataset_id ∈ labIds` or `local_ready` / `in_vault` / `local_root` |
| Queued | **Fuzzy title** match vs jobs — false pos/neg risk |
| Sufficiency / narrower / stale / different grain | **Not implemented** |
| Enrichment vs missing | **Not implemented** |
| Backend judgment | `composer_decides`; soft `index_miss` / `weak_match` / `strong_local_hit` only |

Keyword matching ≠ deduplication. **No real equivalence engine.**

### Ranking assessment

| Layer | Behavior |
|-------|----------|
| Frontend | **Absent** — preserves API order; `dedupeRows` keeps first-seen |
| Discover backend | Lexical `relevance_score` + kind bonuses + ops demotion + fixture demotion |
| Unified | Parallel sources + similar scores; budget timeout |
| Semantic | Embedding cosine (HTTP; not primary Discover ladder) |
| Web | Provider merge; no cross-source ML rank |
| Faculty email | Query hint expansion — **not** score boosts in `score_row` |
| Fit labels in UI | Regex heuristics (`browseMeta.fitLabel`) — **display only, not sort** |

No invented confidence scores beyond what code emits.

### Probe-evidence assessment

**Backend records (verified):** HTTP status, content-type, length, etag/last-modified, accept-ranges, sample bytes, robots fetch.  
**Inferred:** access_mode, discovered_files, pagination hints, recommended_action, connector_id.  
**UI shows:** summary string, connector id, access_mode, content_type, file count.  
**UI does not show:** HTTP status, robots, license verification, auth/cost/rate, provenance of each claim, verified vs inferred separation.  
**Copy risk:** “verified source details” in Add-to-lab display text overstates probe depth (**important**).

### Add-to-lab trace

```text
Add to lab
  → if in_lab: navigate Library
  → else: switch Ask
  → if probe.connector_id:
       POST /library/discover/collect { connector_id, limit:200, auto_approve:false }
       → toast without job id
       → Ask displayText human; prompt includes job id + structured JSON
  → else: Ask plan only (Composer may probe/submit)
  → JobService: often pending_approval
  → worker tick → RegistryPromoter → flywheel → optional archive
  → Discover/Library rediscovery via registry
```

Fragile points: Add without probe; approval invisible on Discover; promote skip if artifacts missing; HTML catalog with zero files; worker must tick; chat path depends on Composer/MCP.

### Rail assessment (Discover)

Current order: header + status → decision summary → Registry/Probe/Plan/Lab chips → acquisition field grid (repeats card) → probe block (scroll) → sticky Add/Probe/Preview/Ask.

Desired hierarchy (spec below) is only partially met: NEXT exists, but evidence is buried, technical IDs lead the header, and Ask after Add restates queue rather than deciding coverage/sufficiency.

### Responsive findings

| Viewport | Findings |
|----------|----------|
| 1440×900 | Usable three-pane; metadata duplication; probe below fold |
| 900×1200 | Pipeline truncation; title truncation; rail steals width; table headers collide with card layout |
| 390×1200 | List scannable; **selected state does not surface Detail\|Ask sheet / primary CTAs** in capture; desktop chrome stacked; toast OK; composer not reachable for Add/Probe without rail |

### Classifications

#### Blocker

1. Mobile selected candidate does not expose Detail\|Ask / Add to lab / Probe (capture evidence).
2. `candidateId` vs `browseTargetKey` field-order mismatch (selection highlight / probe key edge cases).
3. Collection lifecycle (running / approve / fail / complete / queryable) absent from Discover while pipeline chrome implies it.

#### Important

4. No local↔external equivalence / sufficiency logic.
5. Fit labels are keyword heuristics presented as facts.
6. Probe UI thin vs backend evidence; “verified” copy overclaims.
7. Queued = fuzzy title match.
8. Settings/docs claim profile-aware ranking; client has none; backend email ≠ score boost.
9. Header Enter opens Ask (“Find datasets…”) rather than silent Discover search — contract ambiguity.
10. Add-to-lab can run without probe; approval path leaves Discover.

#### Polish

11. Decorative pipeline Approve/Collect/Register vs live FSM.
12. No explicit deselect.
13. No probe warning severity.
14. Repeated metadata card↔rail.
15. Backend IDs (`twse_openapi_…`, `example_com_data`) in primary header.

#### No change (for now)

16. Job id hidden in Ask bubble / toast (intentional e2e contract).
17. Offline demo catalog fallback.
18. Composer/MCP architecture (do not replace with Python planner).
19. Global shell / Home / Library redesign (out of scope).

---

## Discover specification (implementation — not started)

### 1. Information hierarchy (Discover-specific)

```text
1. What is selected? (human title, publisher — bury raw IDs)
2. Relevance to this query (why this row, not a keyword costume)
3. Possession: missing | related local | exact local | enrichable
4. Access feasibility (public / auth / license / cost / rate — unknowns explicit)
5. Evidence (probe): verified facts vs inferred vs unknown
6. Next action (one primary)
7. Technical details (collapsed)
```

### 2. Candidate-card anatomy

```text
[Publisher]  Title (2-line clamp)
One-line why-relevant (query-grounded, not “Faculty finance fit” regex)
Possession chip · Access chip · Readiness chip
Coverage one-liner (time · geo/entity if known · else “coverage unknown”)
Secondary: format/grain only if known
Action pill: Ready | Needs probe | Queued | In lab | Blocked
```

Remove equal-weight FIT·ACCESS·PROBE·DESTINATION grid as primary.

### 3. Selected-state treatment

- Desktop/tablet: list highlight + rail bound to same stable key (`dataset_id || url || doi || title` — **one** function).
- Mobile: selecting a row **must** open Detail sheet with primary CTA visible without hunting.
- New query clears selection (keep).
- Optional explicit clear control (polish).

### 4. Probe-evidence structure

```text
Verified
  URL, HTTP status, content-type, bytes/size estimate, robots summary
Inferred
  access_mode, discovered files, pagination guess, recommended action
Unknown
  license legality, auth, cost, rate, full coverage, schema stability
```

Never label the whole block “verified” unless HTTP facts are shown.

### 5. Add-to-lab decision flow

```text
If exact local query-ready → Open in Library (no collect)
If related local → show diff + optional enrich plan
If needs probe → require probe or explicit “skip probe” with warning
If probe OK → collect plan summary (what/where/approval?) → submit
Show job state on Discover: queued | awaiting approval | running | failed | registered
Deep-link Resources for approval; do not pretend Discover finished registration
```

### 6. Rail hierarchy

Match §1; sticky primary = context-dependent single action; Ask helps decide (coverage, overlap, risk), not restate inventory.

### 7–9. Acceptance criteria

**Desktop 1440:** decision questions answerable without operator vocabulary; probe evidence visible without hunting; Add-to-lab consequences clear.

**Tablet 900:** no pipeline-label collision; title readable; primary CTA visible; rail usable without clipping actions.

**Mobile 390:** result scan → select → sheet with Detail\|Ask → probe/Add → toast; not desktop stacked.

### 10. Empty / loading / warning / error

Keep empty suggestions; loading distinct from empty; connector errors named; probe warning state; collection failed state with retry path.

### 11. Test plan

- Extend `e2e/v2-discover.spec.js` for: key parity, mobile sheet, probe evidence sections, job-state pills (mock), no “verified” without HTTP facts.
- Keep job-id-hidden Ask contract.
- Do not rely on longer Playwright timeouts for startup.

### 12. Screenshot plan

Per commit: desktop/tablet/mobile for touched states under `docs/screenshots-review/discover-dN/`.

### 13. Bounded commit sequence (required — D0 first)

**Implementation is not approved yet.** When authorized, work must begin with **D0 only**, not visual taxonomy.

#### D0 — Canonical Discover identity and lifecycle linkage (**required first**)

Define **one** canonical candidate identity used by:

* result rows;
* selected state;
* URL state;
* Detail | Ask rail;
* probe records;
* Add-to-lab submission;
* queue/job metadata;
* approval status;
* completed output;
* resulting registered dataset.

Remove reliance on **fuzzy title matching** for lifecycle state.

Required linkage chain (conceptual):

```text
candidate_key
  → probe_id
  → job_id
  → output_manifest_id
  → registered_dataset_id
```

**What exists today (do not invent IDs):**

| Identifier | Current source | Notes |
|------------|----------------|-------|
| `candidate_key` | **Split / inconsistent** | UI has both `candidateId(row)` (`dataset_id‖title‖doi‖url`) and `browseTargetKey(target)` (`dataset_id‖url‖doi‖title`). **Must unify.** Prefer stable precedence: `dataset_id` → `doi` → `url` → normalized `title` (document exact algorithm in D0). |
| `probe_id` / connector | Backend `connector_id` (SHA of final URL) from `POST /library/discover/probe` | Stored in connector SQLite; compact HTTP returns `connector.id` / `connector_id`. UI holds probe result only in ephemeral `browseProbe` state keyed by `browseTargetKey`. |
| `job_id` | `POST /library/discover/collect` → `job.id`; also `GET /library/jobs` | Present. Discover does **not** bind job rows to candidates by ID — uses fuzzy title. |
| `output_manifest_id` | **Missing as first-class Discover field** | Job plans / manifests exist inside job records; no stable public ID on Discover rows. **Mark as backend contract gap** if D0 cannot surface it. |
| `registered_dataset_id` | Registry `dataset_id` after `RegistryPromoter` | Exists post-promotion; Discover only detects via `labIds.has(dataset_id)` / vault flags — no job→dataset link on the candidate. |

**D0 acceptance (when later authorized):**

1. One shared `candidateKey(row)` used everywhere listed above.
2. Probe result attached only when `probe.key === candidateKey(selected)`.
3. Queued / approval / running / failed derived from **job metadata that references `candidate_key` and/or `connector_id`**, never title substring.
4. If backend cannot yet return `candidate_key` / `connector_id` / `registered_dataset_id` on job objects, D0 documents the missing contract and stops at frontend key unification + explicit “linkage unavailable” — **no fake lifecycle**.

#### D1 — Honest result taxonomy

Clearly distinguish:

* local query-ready;
* local connected;
* local metadata-only;
* external discoverable;
* probed;
* acquisition available;
* acquisition unavailable;
* licensed/manual.

Remove or rename **“Faculty finance fit”** unless a real ranking model exists.  
Do not present keyword/regex matching as research relevance.

#### D2 — Probe evidence and claim integrity

Separate:

* verified facts;
* inferred metadata;
* model interpretation;
* unknown information.

Replace generic “verified” language with claims accurately supported by the probe.

#### D3 — Candidate decision hierarchy and selected rail

Candidate and rail must answer:

1. what it is;
2. why it matched;
3. whether the lab already has an adequate alternative;
4. whether it can be accessed;
5. what is known and unknown;
6. what the researcher can do next.

#### D4 — Acquisition lifecycle contract

Before implementing lifecycle UI, specify the backend state source for:

* probe required;
* ready to submit;
* queued;
* approval required;
* running;
* failed;
* completed;
* archived;
* registered;
* query-ready.

If the API does not expose reliable candidate→job→dataset linkage, split:

```text
D4a — backend lifecycle contract
D4b — Discover lifecycle presentation
```

Do **not** simulate lifecycle completion from titles or elapsed time.  
Approval may remain operationally in Resources, but Discover must show **awaiting approval** and deep-link to it.  
Add to lab may skip probe only under an **explicit trusted-source rule**, never silently.

#### D5 — Local sufficiency and equivalence v1

Deterministic, explainable comparisons only:

* exact registered identity;
* same publisher/source;
* same subject;
* geographic overlap;
* temporal overlap and freshness;
* grain compatibility;
* entity coverage;
* format/access differences.

Every conclusion labeled:

```text
Exact local match
Likely equivalent
Partial local coverage
Related asset
No local alternative found
```

Do not manufacture a numerical confidence score without grounded inputs.

#### D6 — Empty, loading, warning, and error states

#### D7 — Tablet behavior

#### D8 — Mobile acquisition workflow

Mobile must eventually support the complete decision path:

```text
select
→ inspect
→ probe
→ Add to lab
→ see approval/job status
→ open Detail or Ask
```

Do not implement mobile as merely stacked desktop cards.  
**Do not ship an isolated mobile patch before D0–D4 semantics are stable.**

### 14. Regression risks

Home Continue; Library directory; Ask humanize (displayText); Resources approvals; mock e2e base path; Pages `YZU_PAGES`.

### 15. Backend vs presentation

| Backend required | Presentation-only |
|------------------|-------------------|
| Job objects carrying `candidate_key` / `connector_id` / resulting `dataset_id` | Card/rail hierarchy |
| Equivalence/sufficiency signals (even v0 deterministic) | Copy / bury IDs |
| Richer probe payload in compact HTTP (HTTP status, robots) | Mobile sheet behavior |
| Stop fuzzy title queue match | Pipeline chrome honesty (hide steps without state) |

### 16. Metrics to track (platform lens)

Reachable source systems · discoverable universe · automated recipes · collection success rate · median time-to-first-usable-row · query-ready assets · provenance-complete assets · freshness/schema pass · reused procured assets · requests completed without custom code.

**Not a goal:** inflating registered card count.

### 17. Explicit non-goals (this workstream)

No nav rebuild; no chat-only Discover; no partition-as-nav; no second planner; no API contract break during audit; no Home/Library/entity-graph/source-activation expansion until after approval.

---

## Recommendation

1. **CI baseline is landed and green** — `main` @ `ba270376`.
2. **This branch publishes audit evidence only** — report + 32 screenshots for human review.
3. **Hold all D-series code** until the report and screenshots are reviewed.
4. **First authorized implementation (when approved) is D0 only** — canonical identity + lifecycle linkage; not visual taxonomy, not mobile-first.
5. Mobile CTA reachability remains a **blocker**, but is sequenced as **D8** after identity and lifecycle contracts are honest.
