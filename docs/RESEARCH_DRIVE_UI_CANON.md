# Research Drive UI — canonical direction

**Status:** Frozen direction — 2026-07-01  
**Authority:** Single source for UI **product**, **composition**, and **workflow**.  
**Scope:** [`DESK_STATUS.md`](DESK_STATUS.md). Backend: `create_stack()`, `:8765`.

| Doc | Role |
|-----|------|
| **This file** | Product + composition + workflows — implement here |
| [`RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md) | Right rail as interface + backend integration spine |
| [`design/WIREFRAME_V2_FROZEN.md`](design/WIREFRAME_V2_FROZEN.md) | **FROZEN** ASCII wireframes + polish + ship checklist |
| [`design/V2_FORWARD_FROZEN.md`](design/V2_FORWARD_FROZEN.md) | **FROZEN** implementation phases, Preview contract, next step |
| [`design/V2_FRONTEND_BACKEND.md`](design/V2_FRONTEND_BACKEND.md) | UI ↔ :8765 API integration map |
| [`design/TOKENS.md`](design/TOKENS.md) | Visual tokens only (colors, spacing) |
| [`RESEARCH_DRIVE_UI_CONTRACT.md`](RESEARCH_DRIVE_UI_CONTRACT.md) | Legacy `main.jsx` + Playwright only |

**Sketches:** [`design/WIREFRAME_V2_FROZEN.md`](design/WIREFRAME_V2_FROZEN.md) · CLI: `scripts/rd_layout_preview.py`

---

## 0. Frozen interface contract — Object/Rail OS

This app is a **research data drive**, not a spreadsheet, generic dashboard, or chat-first agent. The main canvas shows a work surface; the right rail is the active object's inspector and action surface. Every page must feed the same loop:

```text
PAGE LENS -> SELECT / CREATE OBJECT -> RIGHT RAIL DETAIL -> ASK / ACT
```

The rail is the anchor. It always answers four questions:

| Question | Rail responsibility |
|----------|---------------------|
| What is this? | Object title, id/path, source, state |
| Why does it matter? | Coverage, evidence, fit to faculty scope |
| What can I do? | Preview, upload, add URL/DOI, procure, approve, ask |
| What happens next? | Composer prompt, job/procurement state, vault target |

The app has **six visible sidebar tabs** while Cluster is deferred: Home, Library, Discover, Resources, Profile, Settings. Cluster code may remain routable for development, but it is not part of the faculty navigation until its daily workflow is clear.

### 0.1 Object types

| Object | Created by | Rail behavior |
|--------|------------|---------------|
| `library_folder` | Opening Library or a folder row | Branch stats, vault destination, upload/add/procure actions |
| `dataset` | Selecting a Library/Home row | Structured dataset metadata, preview, ask, deferred compare |
| `external_candidate` | Selecting a Discover result | Source metadata, probe/procure/add-to-lab actions |
| `resource_row` | Selecting a Resources ledger row | Spend/capacity/job detail and approval/inspection action |
| `faculty_gap` | Profile scope gap | Search/procurement intent for Discover |
| `library_intake` | Upload, URL/DOI, procure actions | Rail-local intake form, then Ask/Composer handoff |

Do not make separate page-local inspectors for these. If something is selectable or actionable, it becomes an active object in the right rail.

### 0.2 Page roles

| Page | Role | Must not become |
|------|------|-----------------|
| Home | Attention surface and recent objects | Marketing dashboard |
| Library | Canonical drive grammar for lab holdings | Spreadsheet + tree split brain |
| Discover | External acquisition funnel | Search page detached from vault state |
| Resources | Ledger for spend, capacity, jobs, approvals | Decorative ops cards |
| Profile | Faculty scope and corpus gaps | Social profile |
| Settings | Admin and credentials | Workflow surface |
| Cluster | Deferred comparison workspace | Mandatory moat before core design ships |

### 0.3 Shell sizing

No hardcoded product promise like `280 | flex | 440`. The shell uses named CSS variables with content-driven clamps:

```text
sidebar = clamp(sidebar-min, sidebar-ideal, sidebar-max)
main    = minmax(0, 1fr)
rail    = clamp(rail-min, rail-ideal, rail-max)
```

The rail should be wide enough for readable actions and narrow enough that the main list still feels like the primary work surface. If a future layout needs tuning, tune the variables and tests, not scattered literal widths.

### 0.4 Growth rule

New capability lands in this order:

1. Define the object it creates or selects.
2. Define the rail state and primary action.
3. Add the page lens only if the canvas needs structure beyond the rail.
4. Add Composer/Ask handoff through `/library/chat` or `/library/chat/stream`.

Do not use Ask as a patch for missing controls. Ask is the agent surface for the selected object, not a replacement for the interface.

## 1. Product (one paragraph)

Lab research data desk: **six visible sidebar tabs** + a **right rail** with one pane and a **Detail | Ask** toggle. The rail is the product anchor and integration boundary: selected object truth in Detail, Composer + MCP action in Ask. Tabs are parallel lenses over the same drive workspace. Ask is not a tab and not a path — it is the agent view in that same rail. Composition stays consistent; **paths are not prescribed**.

---

## 2. Composition consistency (what “theme” means here)

**Not** light vs dark. **Yes:**

- Same shell grid on every page  
- Same selection → detail → action loop  
- Same components in the same zones  
- Same labels for the same concepts (`SOURCE`, `ACCESS`, readiness pills)  
- **Context follows the user** when they jump tabs (selection, session) — not a forced sequence  

If a professor learns Library in one minute, Discover, Resources, Profile, and the deferred Cluster workspace should feel like the **same app**, not separate products stitched together.

### 2.1 Fixed shell (never changes)

```text
┌──────────────────────────────────────────────────────────────────┐
│ ZONE A — Global header (fixed height)                            │
│  Logo · unified search ⌘K · account                                │
├──────────┬───────────────────────────────────────┬───────────────┤
│ ZONE B   │ ZONE C — Main canvas                  │ ZONE D        │
│ Sidebar  │                                       │ Right rail    │
│ nav      │  C1 PageHeader (title + actions)      │ clamp target  │
│ clamp    │  C2 Toolbar (filters / mode toggle)   │               │
│          │  C3 Content (table · map · list)      │ [Detail|Ask]  │
│          │                                       │  one pane     │
└──────────┴───────────────────────────────────────┴───────────────┘
```

| Zone | Rule |
|------|------|
| **A** | Unified search; Enter / ⌘K may switch rail to **Ask** and focus input |
| **B** | Same visible sidebar items, same order; **Ask is never a sidebar item** |
| **C1–C3** | Unchanged — main canvas per tab |
| **D** | `InspectorRail` — **one full-height pane**; segmented **Detail \| Ask** toggle in rail header; see [`RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md) |

Detail and Ask **share the rail**; they do not stack or compete for height. Both views stay mounted (state preserved); only one is visible.

**Preview** opens a **modal/drawer** over the current tab (usually Library). Zones A + B + D stay mounted; list selection is preserved. Esc closes. **Not** a sidebar tab or full-page route.

Within any tab, selecting something updates the **Detail** view and typically switches the rail to Detail:

```text
SELECT → rail → Detail  →  INSPECT  →  ACT
              ↘  Ask (user toggle or shortcut; context carries over)
```

| Rule | Detail |
|------|--------|
| Select | Updates `DetailPanel`; sets `?dataset=`; **switches rail to Detail** |
| Toggle | User flips **Detail \| Ask** anytime; choice persists across tab changes until next select |
| Inspect | Same field order in Detail on every data tab |
| Act | Buttons in Detail; **Add to lab** switches to Ask with prefilled input |
| Ask | Full rail height; not a sidebar tab, not a funnel step |

**No “correct path.”** Examples:

- Library → select row → Detail auto-shows → **Preview rows** (modal)  
- Discover → Add to lab → rail flips to Ask (prefilled)  
- On Settings, toggle to Ask without leaving the page  
- Deferred Cluster route → select node → Detail; toggle to Ask to “explain this overlap”  

**Never:** stacked split rail fighting for vertical space. **Never:** forced wizards.

| | **Ask (rail mode)** | **Tabs + Detail (rail mode)** |
|--|---------------------|-------------------------------|
| Best for | Quick question, procure, agent preview | Filters, maps, structured metadata, **Preview modal** |
| Detail quality | Agent prose + inline chips | API-backed `DetailPanel` fields |
| Access | Toggle rail to Ask, or search → Enter | Select row → Detail (auto) |

Ask is a **shortcut**, not a substitute for tabs. Detail mode is authoritative for metadata.

Header search: filter catalog in place, or **Enter** switches rail to Ask with query prefilled.

### 2.3 Shared components (composition building blocks)

Build once; forbid tab-local copies.

| Component | Composition role |
|-----------|------------------|
| `AppShell` | Zones A–D grid |
| `PageHeader` | C1 — title, subtitle, one primary CTA |
| `FilterChips` | C2 — horizontal chips, same chip component |
| `CatalogList` + `CatalogRow` | C3 list pattern (Library, Home recent, Discover results) |
| `InspectorRail` | Zone D — toggle host + one visible pane |
| `RailToggle` | Segmented **Detail \| Ask** in rail header |
| `DetailPanel` | Detail mode — structured inspect/act |
| `AskRail` | Ask mode — thread + input (mounted, hidden when Detail active) |
| `StatusPill` | Same enums, same position (under title in panel) |
| `EmptyState` | Same layout when nothing selected |
| `SectionBlock` | Profile, Resources — titled sections with same spacing |
| `ClusterCanvas` | Deferred C3 comparison surface — selection still feeds `DetailPanel` when enabled |

### 2.4 Ambient toolkit (optional links, not a pipeline)

Tabs are **tools in a shared workspace**, like Drive + Sheets + Gmail — not a procurement assembly line.

```text
 Home · Library · Discover · Resources · Profile · Settings
                   │
                   ▼
            ┌──────────────────┐
            │  InspectorRail   │
            │  [ Detail | Ask ]│  ← one pane; toggle
            └──────────────────┘
```

| Guarantee | Not |
|-----------|-----|
| Same rail + toggle on every tab | Ask as sidebar tab or full-page chat |
| Detail shape identical on Library / Discover / Resources / deferred Cluster | Discover → Ask funnel |
| Selection + `dataset_id` carry across tabs | Forced redirects |
| Shortcuts flip rail mode (Add to lab → Ask) | Stacked split rail |

**Optional shortcuts** (convenience, not required steps):

| From | Shortcut | Lands on |
|------|----------|----------|
| DetailPanel | See on Cluster | Deferred Cluster focus |
| DetailPanel | Open in Library | Library with same dataset |
| Discover Detail | Add to lab | rail → Ask, prefilled |
| Resources row | View job | job detail / related dataset |

User can ignore every shortcut and use sidebar tabs or type in D2 freely.

### 2.5 Page anatomy per tab

| Tab | C3 content | Rail default on enter |
|-----|------------|----------------------|
| **Home** | Continue + recent object list | Last mode; select → Detail |
| **Library** | `CatalogList` drive rows — folders + datasets | Folder object; dataset select → Detail |
| **Discover** | external `CatalogList` candidates | Last mode; candidate select → Detail |
| **Resources** | `SectionBlock` × 3 | Last mode (often Ask while checking ops) |
| **Profile** | memory sections | Last mode |
| **Settings** | forms | Last mode |

Discover uses **the same list + DetailPanel split as Library** — not a different card-grid layout.

### 2.6 Copy & concept consistency

One vocabulary app-wide:

| Concept | UI label | Not |
|---------|----------|-----|
| Registry dataset | name + `dataset_id` subline | “Drive file” |
| Readiness | `StatusPill` | custom text per tab |
| External hit | source ribbon on row | “External” only in Discover |
| Procure | **Ask** / **Add to lab** | Magic procure, Source nav |
| Jobs | “Running” / “Completed” | job_id, yzu |

---

## 3. Visible tabs — job & API

| Tab | Job | Reference (interaction only) | API |
|-----|-----|------------------------------|-----|
| **Home** | Continue + recent + running | Drive Home | desk brief, pins, jobs |
| **Library** | Catalog default landing | Drive list with research metadata | overview, catalog, query |
| **Discover** | External discovery and acquisition | Google Dataset Search list+detail | search, discover, extensions |
| **Resources** | **Capacity ledger** — compute, storage, query plane, jobs | `platform_status` / ops dashboards | `/health`, `storage_tiers`, `/yzu/workers`, jobs |
| **Profile** | **Research context** for ranking & procure scope | Faculty CV section (not social) | `faculty_profile`, registry alignment |
| **Settings** | Prefs + admin | GitHub Settings | credentials |

Deferred: **Cluster** remains a routable comparison workspace for development, not a sidebar promise.

### 3.1 Resources — everything countable

Resources is the desk **status board**, not four service cards. One scrollable ledger grouped by domain; each row is **measured** (used/cap, OK/WARN/FAIL), sourced from live health where possible.

| Section | Rows include |
|---------|----------------|
| **Compute** | Controller (`optiplex`), `windows_lab` pool (hosts, busy, capabilities), job queue depth |
| **Storage** | GDrive vault + archive quota (`storage_tiers` canonical), NVMe hot (`hot` free/used/headroom), USB bulk cache (`cache` mount) |
| **Data plane** | Query engine `:8765`, registry dataset count, partition index freshness |
| **Remote query** | BigQuery SA, dry-run gate, bytes scanned (period), public-table routes |
| **Procurement** | Composer MCP tool count, session count, worker routing policy |
| **Credentials** | Configured / missing (summary only — vault in Settings) |
| **Pipelines** | Running jobs (GDELT, DataCite, …), systemd timers (`alpha-live`, collection sync) |
| **LLM / desk** | `llm_configured`, API reachability |

Home shows a **short strip** (running jobs + worst WARN); Resources is the full ledger. No decorative cards — dense tables, honest `platform_status` semantics.

### 3.2 Profile — academic standard, not personalization

Profile is **system memory** for search ranking, Discover defaults, and Ask context — not a social profile.

| Include | Exclude |
|---------|---------|
| Affiliation, ORCID/Scholar/SSRN links | Avatar, cover image |
| Numbered research program (`research_tracks`) | Gamified pins, emoji chips |
| Corpus scope table (holdings vs gaps per track) | “Starter intents” casual copy |
| Pinned corpora as **editable table** (`dataset_id`, label) | Card grids, hero blocks |
| Publications / grants counts (from `faculty_profile`) | Personality tone, greetings |

Tone: CV appendix + lab data scope. Actions: Edit tracks, Sync Scholar, Export scope.

**Not sidebar tabs:** Ask (rail mode only), Pipeline (Home + Resources), Vault tree, Cluster while deferred.

---

## 4. Right rail contract

Zone D is `InspectorRail`: **one pane**, **Detail \| Ask** toggle in the rail header. Both views stay mounted (thread + selection preserved); CSS/state shows one at a time.

The interaction rules live here. The backend/entity/context mapping lives in [`RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md). Treat that companion as binding for all v2 integration work.

### 4.1 Rail toggle behavior

| Event | Rail mode |
|-------|-----------|
| User clicks **Detail** / **Ask** | Manual toggle |
| User selects row / node | **Detail** (auto) |
| **Ask about this** / **Add to lab** / search Enter | **Ask** (auto) + prefill |
| Tab change | **Keep last mode** (do not reset thread) |
| New chat | Clears Ask thread only |

Optional: subtle badge on **Ask** when agent has unread reply while user is on Detail.

### 4.2 DetailPanel (Detail mode)

Field order **fixed**:

```text
[ StatusPill × n ]
SOURCE · ACCESS · COVERAGE · GRAIN · VAULT PATH
USE · LIMITATIONS
[ Preview rows ]  [ Ask about this → Ask mode ]  [ contextual tertiary ]
```

| Context | Tertiary button |
|---------|-----------------|
| Library / Home | Preview rows |
| Discover | Add to lab |
| Deferred Cluster | See overlaps (expand in panel) |

Detail idle (nothing selected): `EmptyState` — “Select a dataset” — user may still toggle to Ask.

### 4.3 AskRail (Ask mode)

| Element | Rule |
|---------|------|
| Thread | `POST /library/chat/stream`; persists across tab + toggle |
| Input | Full rail height; placeholder reflects selection when present |
| Context | `dataset_id`, tab, search query sent with each message |
| Replies | Agent chips / previews; user toggles to Detail for authoritative fields |

### 4.4 PreviewModal (overlay — not a page)

Implementation authority: [`design/V2_FORWARD_FROZEN.md`](design/V2_FORWARD_FROZEN.md) §Preview.

| Rule | Detail |
|------|--------|
| Mount | `AppShell` root portal; not a sidebar tab or ZONE C route |
| Shell | Zones A + B + D stay mounted; ZONE C scrim + centered panel |
| Triggers | Detail **Preview rows**; Library double-click; Home Continue; Discover **Preview ext** |
| Tabs | Preview \| Schema \| Query — **one tab body visible** |
| Lab data | `GET /query/{id}?limit=50`; Schema from registry + preview inference |
| External | `mode=external` — metadata snippet; Query disabled until In lab |
| Close | Esc / × / scrim; preserve `?dataset=` selection |
| Retire | Legacy `rd-dataset-nav` full-page analyzer in `main.jsx` |

Optional shareable state: `?dataset=id&preview=1` — still not a navigable “page.”

---

## 5. Visual tokens

Colors and spacing only — [`design/TOKENS.md`](design/TOKENS.md). Tokens support composition; they do not define it.

Default palette is light and calm; **composition rules apply regardless of palette.**

---

## 6. Anti-patterns (composition)

- Different layout per tab (cards on Discover, drive rows on Library)  
- Different inspector field order on Discover  
- **Linear funnel UX** — steppers, “next step” wizards, mandatory Discover → Ask → Library  
- Stacked split rail (Detail and Ask sharing vertical space)  
- Ask as sidebar tab or full-page overlay  
- Treating Ask replies as canonical metadata  
- Home as a different product (hero, fake stepper)  
- Cluster as ops dashboard or procurement moat  

---

## 7. Backend readiness

| Area | v2? |
|------|-----|
| Library, Home, Discover, Profile, Ask | Yes |
| Resources live status | Yes |
| Resources usage history | v2.1 |
| Cluster graph | Deferred; UI-composed from registry when revived |

---

## 8. Build order (composition-first)

| # | Deliverable |
|---|-------------|
| 1 | `AppShell` + `InspectorRail` + `RailToggle` + selection URL state |
| 2 | `AskRail` + `DetailPanel` (toggle between; both mounted) |
| 3 | `CatalogRow` + `EmptyState` |
| 4 | **Library** (reference implementation for all list tabs) |
| 5 | Home + Discover (reuse Library list + D1 — **no new layout**) |
| 6 | Deferred Cluster canvas → same D1 |
| 7 | **Preview modal** (Preview / Schema / Query tabs; overlay, not route) |
| 8 | Profile, Resources, Settings (`SectionBlock`; same rail toggle) |
| 9 | Cutover `VITE_UI_V2=1`, retire `main.jsx` |

---

## 9. Change process

1. Composition or workflow change → amend **this file** first.  
2. Visual token change → [`design/TOKENS.md`](design/TOKENS.md).  
3. New tab or handoff → must reuse §2.3 components; no one-off layouts.  
4. Sketches → [`design/references/`](design/references/).
