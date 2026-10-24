# Research Drive UI — the one authority

Written 2026-10-23. This file replaces every earlier UI authority, freeze, contract,
handoff and wireframe file; those are in `docs/archive/ui-2026/` for history only and
are never cited for a decision. If something here is wrong, change it here, with the
owner's agreement, before changing the UI.

## 1. Where everything is

| Thing | Where |
|---|---|
| UI repository | `Spectating101/yzu-cluster` (frontend only; the backend is `Spectating101/research-drive-private`) |
| Current UI line | branch `claude/center-column-20261021`, worktree `Molina-Optiplex/research-drive-ui-current` (local; push needs the owner) |
| Code | `drive/src/v2/` (`BrowsePage.jsx` = Discover, `SynthesisPage.jsx`, `App.jsx`), styles in `drive/src/v2/styles/01..11-*.css` |
| Desks | `./scripts/desk status` in `Molina-Optiplex` is the authority. 8775 = preview (free to deploy), 8774 = rc3 public (`rc3.easycamp.tech`, deploy only when the owner says "promote"), 8765 = previous |
| Deploy | `./scripts/desk build --ui <sha8> --backend <sha8> --for candidate-memory-next`, then `./scripts/desk deploy candidate-memory-next <release> --yes` |
| Tests | `npm test` (unit); `npm run test:e2e` (mocked API; the three live-backend specs skip unless `YZU_LIVE_BACKEND=1`); `npm run test:candidate-release` runs them against the live API; `repo-check` is the local gate. Flaky under load: discover-lifecycle-screenshots:44, synthesis-authority-workflow:205, synthesis-revisit-evidence:123 — rerun alone |
| Page budgets | `e2e/fixtures/page-budgets.json`, enforced by `e2e/page-budgets.spec.js`; limits only go down |

## 2. How to work (rules that exist because they were broken)

1. Read this file before proposing any layout. Check every proposal against §6 (rejected) and §7 (open). If it matches a rejected pattern, do not propose it.
2. Polish inside the current layouts. A layout change needs a terminal-text wireframe in the reply and the owner's nod; a conditional nod means redraw the tweaks and build in the same stretch.
3. Judge real behaviour, not fixtures. The preview proxy `scripts/serve_candidate.py` blocks every POST except sign-in unless started with `--allow-writes`; the Discover coverage check and Ask are POSTs. Use a temporary `--allow-writes` server only for read-like checks and stop it afterwards.
4. Look at the rendered page yourself at 1440×900 before saying anything works; count words when density is the question.
5. Data shown thin is often the catalogue, not the layout. Check the API payload before redesigning.
6. Generic critics (screenshot reviewers, design skills) check craft, not product decisions; their advice is checked against §6 before use.
7. Never print the desk token; read it inside Python/Node. No explanatory code comments. Desktop only; mobile is not a target.

## 3. The product and each page's one job

Research Drive is a research-evidence procurement and Library workbench: a research need → what the Library holds → what can be collected → review-gated collection → a registered Library dataset → optional Synthesis build.

| Page | Job | Does not carry |
|---|---|---|
| Home | Resume what I was doing and see what needs me | Library coverage, explanations of other pages, metrics |
| Library | Find a dataset I already have and open it | Source catalogues, Discover's search |
| Discover | Ask for data; see what the Library holds and what could be collected | Source lists, coverage dashboards, step explainers on the idle page |
| Synthesis | Say what dataset I need and why; the agent proposes how to build it from held data; review it as a diagram; approve | Explanations of what Synthesis is |
| Resources | What the desk can reach and how much capacity is left | Anything about a specific dataset |
| Profile | What I work on, so suggestions fit | Account administration |
| Settings | Account, connections, preferences | Operational dashboards |

## 4. Shell and right panel

- Grammar on every page: left navigation · centre = the object being worked on · right panel = Detail | Ask about the selected object.
- The right panel should be full rather than sparse (owner, 2026-10-24): it carries what only it can show for the selection (readiness checklist, inputs, provenance, diagnostics), led by identity and the current decision in a few lines. It never repeats the centre, never shows a page echo (the page name lives in the page head), and never holds a data table or row sample.
- The right panel is always present, like an assistant beside the work (owner, 2026-10-23). With nothing selected it opens on Ask, scoped to the page; selecting an object switches it to Detail. A Detail the researcher chose stays until they leave the page. Guests, who cannot use Ask, keep Detail. Never an explainer or report in the empty state (`drive/src/v2/railDefaultTab.js`).
- Row data and samples belong in Preview (the centre overlay), not the right panel.
- A Home resume point opens the real object's own Detail, never a generic Home inspector, and only with data Home actually has (Home's thread list lacks measurements; reusing the full Synthesis panel there printed false "no risk" claims).
- Ask is scoped to the selected object and never leaks context across objects.

- Page head (owner, 2026-10-24): every page uses `PageHead` (title, one state line, actions on the right, fixed height, rule below); the top bar carries only Focus, status and account.

## 5. Pages as they are now (live on 8775, ui d0f63a65 + backend bb4abb7d)

### Home
Welcome strip for an unset research focus · Pick up card (one resume point; a Synthesis build shows its seven readiness checks and the one decision it needs, from the same `synthesisGates.js` and read-only measurement call as the Synthesis panel, and shows nothing until measured) · a second row (one line) · Recent trail (3 rows, "View all" opens Discover History) · with an empty trail, "Ask to get started" prompts; only a true first visit (no work) explains the four pages. Right panel: Ask until the researcher selects something.
Decisions: Home is a resume / needs-you surface, never a metrics dashboard or chat landing (owner, July). No-scroll desktop; caps: 1–2 resume points, 3 trail rows.

### Library
Search · Type · Sort · collection chips · Featured / All lens · Ready to query / Not ready yet filters · rows: title · Coverage (row count + span bar + years, one line) · Source (one line, full name on hover) · Readiness, then the curated one-line summary at full width (up to two lines). The summary is the main content: it says what the data is for, which competitors lack (owner, 2026-10-24). Selecting a row opens Preview ("Library · Inspect") with an observed sample, columns and ranges.
Decisions: opens on a lens, not the inventory — guests see featured datasets, members a profile-matched list, All is one click away (owner, 2026-10-19); readiness and verification stay separate columns/axes; the description is plain language, never metadata soup; no per-row action buttons; duplicate datasets collapse into one row with several sources (owner, 2026-10-20); nobody reads raw dataset ids.

### Discover
Explore | History only. Idle: "What data do you need?", one search box, a "Try" line, three Start-with cards (held datasets and one collectable), URL/DOI intake. Results: counts chrome `N sources │ N in your Library ▾ │ N web results`; held Library matches live behind the "in your Library" popover (with row counts and years); external offerings as compact rows with a small Add.
Coverage check: runs automatically for signed-in members when the query reads as a research need (a question, a question opener, 8+ words, or two need cues such as "monthly" + "by country"); plain keywords never trigger it; guests can press Assess coverage (backend cap 15/hour/IP). It calls Copilot `gpt-5-mini` only — never Azure (owner, 2026-10-23).
Answer band (above results, ~60–90 words): "What your question needs" + counts + verdict; the held match with Open in Library; one line of needs with ✗/?/✓ marks from the catalogue's per-need record; Gap (one sentence); Next (how many documented sources could fill it); the brief editor; the next actions (Review collection strategy, Start Synthesis, Search wider) as the band's footer. The right panel holds the verdict, one support fact and the next step; while the check runs, a progress list (Library searched, sources listed, verdict with seconds, ways to close a gap); after it, the reasoning: the assistant's explanation, the Library records checked with their limits, the gap, documented routes, capacity and basis (rendered into the panel through `railSlot.js`; falls back to a Details fold when the panel is folded or on Ask).
Decisions: no source list on the idle page — that is Resources' job (owner, 2026-10-22); idle cards are fine (owner, 2026-10-22); held evidence is chrome, never a centre section; marks say what the catalogue records, never "held" unless held; do not soften or qualify procurement/collection claims in the UI (owner, 2026-10-22).

### Synthesis
Home: one compose box ("What dataset do you need, and what is it for?"), saved-method picker that only selects (creating a build needs the button), a directory of builds (needs decision / in progress / running / finished) and Built in Synthesis examples; left sidebar keeps the thread list (Active work / Outputs saved to Library). Thread: the method diagram leads every state (inputs → steps → output, real transform steps from the spec, measured join facts), then the current decision card, proposal review, execution record; evidence map folds away once a method is drawn.
Decisions: show the work, not explanations — the July/August studio was the version the owner liked (owner, 2026-10-22); diagram as the hero (owner, 2026-10-22); nothing runs before approval; proposal ≠ accepted method ≠ executed ≠ registered ≠ query-ready.

### Resources
Three facts (assistant allowance, collection requests, access) and "Where the data comes from" grouped by licence and kind with each source's state.
Decision: one job per page, each number once, no repeated "Open to you" rows (owner, 2026-10-21).

### Profile, Settings
Not reviewed in this consolidation; treat as low weight.

## 6. Rejected — do not propose again

| Pattern | Rejected |
|---|---|
| A permanent "Already in your Library" / held-evidence section in Discover results | Discover freeze 07-28; G 08-15; reverted again 2026-10-23 |
| A grid comparing sources/routes per need on the results page ("route-comparison panel") | Discover freeze 07-28; proposed and withdrawn 2026-10-23. Source comparison lives only inside the review modal |
| A coverage band that is long prose (169 words) | owner, 2026-10-23 ("bit text heavy") |
| Source list, coverage panel or step explainer on the Discover idle page | owner, 2026-10-22 |
| Search \| Ask toggle, Plan / Acquisition / Activity modes, selected-candidate centre page, full-page acquisition workspace | Discover freeze 07-28 |
| BEST FIT / OTHER MATCHES headers or any ranking without a measured score | G 08-15 |
| Printing a date range, coverage or fit that no field reports; UI heuristics presented as coverage | authority 07-30; G 08-15 |
| A data table or row sample in the right panel | rail contract; reverted 2026-10-23 |
| A generic Home inspector (e.g. Library-by-topic counts) | Home freeze; reverted 2026-10-23 |
| Removing the Synthesis left thread list | frozen Synthesis render; tried and reverted 2026-10-23 |
| Dropping Library's readiness column or merging readiness with verification | Library rules |
| Per-row Preview / Ask / Use buttons in Library | Library rules |
| Synthesis as an explanation page, a five-step wizard, or a manual node-graph canvas | owner 2026-10-22; Synthesis spec |
| Home as research-intention hero, metrics dashboard, activity feed, chat landing | Home freeze |
| Resources tabs Overview \| Activity, worker dashboard, fake quota bars | Resources freeze |
| Dashboards of statistic cards, cards added to fill space, nested cards | visual closure 07-30 |
| Softening procurement claims to "be honest" | owner, 2026-10-22 |

## 7. Open questions (owner decides; do not settle by building)

1. Home: the July Home design had Pick up beside Resource headroom, Recommended evidence and Recent trail; the live Home has no headroom and adds a welcome strip. Keep live, or restore headroom?
2. Resources: the July design had Sources | Usage | Method tabs; the live page is one view. Keep one view?
3. Per-row Add on Discover offerings: allowed by the July Discover freeze, banned by G. Live has it.
4. Guests and the coverage check: keep the manual Assess coverage button for guests (uses Copilot, capped 15/hour/IP), or hide it?
5. The coverage band's Gap sentence comes from the backend and can be long; shorten it in the backend wording?

## 8. Agreed, not built yet

- Preview as the investigative data view: clickable columns with distributions (`/query/{id}?profile=1`, label it as a sample), spread sample (`sample=spread`).

## 9. Truth and wording

- Never collapse: completed ≠ archived ≠ registered ≠ query-ready; proposed ≠ accepted ≠ executed; declared ≠ verified; a route existing ≠ access verified.
- No fixture, cache, UI estimate, filename, folder name, lexical similarity or model prose renders as a fact. Where there is no producer, say "not recorded".
- Say what the researcher can do: "Ready to query", "In Library · not yet checked", "Waiting for your approval", "Access not checked", "Download method known". One noun per concept (Library, build, request). Sentence case; identifiers only under Technical details.

## 10. Archive

`docs/archive/ui-2026/` holds the July–October 2026 authorities, freezes, contracts, programs, handoffs and wireframes (UI_PRODUCT_AUTHORITY, the Discover/Home/Library/Profile/Resources freezes, the visual-closure freeze, the right-rail contract, the change lock, the convergence and implementation programs, the Synthesis S-04 spec, the Ask contract, PAGE_JOBS, UI_VOCABULARY, the design/ folder, the 2026-10-22 wireframes). The frozen render files (`FROZEN_RENDERS.txt`, blob 9f651515; composition G, blob 6ee8d708) are in the Sharpe-Renaissance git history. All of them are history: read them to understand why, never to decide.
