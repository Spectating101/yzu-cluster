# UI vocabulary application

Applied `docs/UI_VOCABULARY.md` to user-visible copy. 189 files changed, including this report.

## Review and validation

- Restored `CHECK` / `NEED` lookup values and the `a declared route` sentinel. Their displayed wording uses a label mapping.
- Kept History decision values separate from the displayed status. Approval actions and pill classes still use the original internal labels.
- Kept saved records, unconfirmed receipts, connection tests, sample results, and query readiness distinct.
- Updated only changed text assertions. Test fixtures, test names, selectors, internal enums, existing object keys, API field names, URL literals, and CSS class names remain intact.
- CSS differences are exclusively `content:` strings. Technical details / Technical record JSX disclosures match the original source.
- `node --test drive/src/v2/*.test.js`: passed (85 test files). A run with `--test-isolation=none` also passed all 671 tests in 45 suites.
- `npx vite build`: passed. Vite reports the existing large-chunk warning. A temporary writable config cache resolved the initial shared-dependency read-only cache error; shared dependency files were untouched.
- Eight additional checks compared original Synthesis prompts, decision/risk wording, and request context against the new display mappings; all passed.
- `node scripts/ui-vocabulary.mjs`: passed; 1,835 unique terms. Occurrences: 1,174 JSX text, 477 JSX attributes, 623 object labels, 84 templates, 19 CSS content strings.
- `git diff --check`: passed.
- Live desk / Playwright UI behavior was not verified. The desk baseline check reported no listening service.

## Remaining inventory rows

Counts below match the **term column**, case-insensitively. The last column also gives literal full-row matches, including filenames such as `discoverIntent.js` and `historyLifecycleLabel.js`, for comparison.

| Search text | Term rows | Full CSV rows |
|---|---:|---:|
| durable | 0 | 0 |
| construction | 1 | 1 |
| holding | 1 | 11 |
| authority | 0 | 2 |
| lifecycle | 0 | 78 |
| grain | 0 | 0 |
| bounded | 0 | 0 |
| materialis | 0 | 0 |
| intent | 1 | 54 |
| probe | 0 | 0 |
| sourcing | 0 | 0 |
| Registered · unconfirmed | 0 | 0 |

Three matching term rows remain:

- **Known holdings** — `LibraryDatasetRailPanel.jsx`, inside Technical details.
- **Intent ID** — `DiscoverIntentRailPanel.jsx` and `DiscoverIntentWorkspace.jsx`, inside Technical details.
- **New construction** — `SynthesisPage.jsx`, the existing ephemeral context title sent to Ask. The visible draft label is mapped to **New build**.

## Deliberately retained strings

Backend prompt wording and context labels are preserved even where the same string is offered as an Ask shortcut. Researcher-authored titles, source descriptions, raw backend responses, identifiers, URLs, and technical evidence retain their recorded values. Financial **asset × week** describes a unit of observation, rather than a Library object.

The following table lists the audited retained vocabulary literals and their reason. Template expressions are shown as `{…}`. Identical literals with the same reason are grouped. Ordinary uses of “hold” and “intentional” are included to distinguish them from the vocabulary concepts.

| Retained string | Files | Reason |
|---|---|---|
| /library/desk/resources{…} | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/discover/intents/{…} | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/discover/intents/{…}/proposal | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/discover/intents/{…}/review | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/discover/intents/{…}/route | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/discover/intents/{…}/submit | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| /library/synthesis/threads/{…}/materialisation | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Accept or reject this exact revision-bound proposal | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Accept the recommended construction and draft the detailed method. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Acceptance makes this exact method revision eligible for bounded Preview | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Acquisition is {…}; History holds the saved request record. | `drive/src/v2/homeIteration10.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Acquisition or registration work is still pending. | `drive/src/v2/datasetMeta.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Add URL or DOI to {…}. Targets: {…}. Probe source, collect metadata, and procure if missing. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Advance only if the recorded evidence supports one defensible construction | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Assess this Library asset for the current research context: {…}. State what the declared evidence supports, what is not established, whether local access is proven, and the safest valid next action. Do not infer readiness beyond the recorded state. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Audit this asset's provenance and construction limitations. | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Audit this registered asset's provenance. | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Bounded Preview | `drive/src/v2/synthesisObjectContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Can I answer my research question with the local asset already matched to {…}? | `drive/src/v2/discoverSufficiency.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Can I use the output of {…} yet? Distinguish registered vs query-ready honestly. | `drive/src/v2/DiscoverEvaluationSurface.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Canonical archive | `drive/src/v2/LibraryDatasetRailPanel.jsx` | Inside a technical disclosure; preserved by scope. |
| Challenge this unsaved research-object framing before it becomes durable: {…}. Identify the single most consequential ambiguity in construct, unit, period, or intended use. Do not choose evidence or methodology. | `drive/src/v2/SynthesisThreadRailPanel.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Collection finished, but registration is still pending. | `drive/src/v2/discoverLifecycle.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Compare the alternative constructions and say what each one costs. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Compare {…} with my Library holdings | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Connector route declared; collection remains approval-gated. | `drive/src/v2/discoverIntent.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Construction recommendation | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Construction recommended | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Decide whether this exact previewed revision should request execution approval | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Desk setup | `drive/src/v2/askContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Discover holds the approval decision. | `drive/src/v2/homeBriefing.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Distinguish a retryable worker failure from a construction defect | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Do not treat external Discover candidates as held Library evidence. Do not infer missing schema, provenance, coverage, or verification. | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Downstream studies still inherit the construction's recorded limitations | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain each recommended match using recorded identity/topic, schema or fields, grain, coverage, source/provenance, readiness, and verification when those facts exist. | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain the current construction and its authority state. | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain the current construction. | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain the current desk setup. | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain the difference between worker completion and registration here. | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain this Discover lifecycle item: {…}. Summarize its durable state, what is verified, what is still unknown, and the safest next action. Do not claim collection, registration, or query readiness unless the record proves it. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Explain this Library branch: {…}. Summarize holdings, query readiness, missing material, and the next acquisition action. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Find and review held Library evidence | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Find the best evidence already held in my Library for: "{…}". | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| For the revision, change {…}. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Given {…}, what should I probe next, and what would still remain unknown after a successful probe? | `drive/src/v2/DiscoverEvaluationSurface.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Ground this research brief in the recorded Library evidence and create one reviewable Synthesis proposal. State its evidence roles, target grain, direct-measure limitation, and the one unresolved choice that matters most. Record the proposal for review; do not accept it, collect evidence, execute work, or alter data. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Held Library inputs | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Help me frame a new Synthesis research object. Ask one high-value clarification at a time. Help me state the research object, unit or grain, time horizon, and intended use. Do not choose evidence or methodology yet. | `drive/src/v2/synthesisDraft.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| How could another construction reuse this result without overstating readiness? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| How is the local asset related to {…}? Do not claim equivalence. | `drive/src/v2/discoverSufficiency.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| How should I use this query-ready asset defensibly? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| I want to revise this research intent. Show the change that would be recorded before applying it. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Identify the next material construction decision | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| If no held asset materially fits, say that clearly and recommend Discover for the missing evidence rather than forcing a weak match. | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| If no job was queued, probe the source if needed, then submit yzu_submit_job with a safe collection plan. | `drive/src/v2/discoverActions.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| If one construction is defensible, choose it, state the research consequence, and record one exact reviewable Synthesis proposal that incorporates that choice. | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect the bounded failure before retrying | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect the current durable research state | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect the durable construction | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect the registered asset and its readiness boundary | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect {…} in this construction. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Inspect {…} in this construction. State what it establishes, what remains unknown, and the valid next method decision. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Instant retrieval found no confident held candidate. | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Intent ID | `drive/src/v2/DiscoverIntentRailPanel.jsx`<br>`drive/src/v2/DiscoverIntentWorkspace.jsx` | Inside a technical disclosure; preserved by scope. |
| Investigate acquisition routes for {…}. Intent {…}. Explain only supported routes, required evidence, and unknowns. Do not submit procurement. | `drive/src/v2/BrowsePage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Investigate this evidence need: {…}. Begin with held evidence, ask for missing requirement details when needed, and use wider discovery only when it adds value. Keep procurement approval-gated. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Is a retry sufficient, or does this failure require a method revision? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Is a retry sufficient, or should I revise the construction first? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Is there any indication registration is blocked? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Known holdings | `drive/src/v2/LibraryDatasetRailPanel.jsx` | Inside a technical disclosure; preserved by scope. |
| Library confirms what is actually held | `drive/src/v2/RailPanels.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Library holds saved data | `drive/src/v2/HomePage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Method construction | `drive/src/v2/synthesisObjectContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Methods, execution, archive, registration, and readiness are separate records | `drive/src/v2/RailPanels.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| New construction | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| No held Library evidence matched this research object | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| No registered output exists from this failed execution | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| No registered output is claimed until archive and registry proof exists | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Not declared | `drive/src/v2/LibraryAssetWorkspace.jsx` | Inside a technical disclosure; preserved by scope. |
| Not registered | `drive/src/v2/SynthesisPage.jsx` | Inside a technical disclosure; preserved by scope. |
| Nothing is durable until the construction is created | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Observe durable execution proof; no new method decision is required while the accepted build is active | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Open the asset in Library or start a reviewed variation | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Preview this revision before building it. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Procure datasets for {…}. Search faculty sources, check the local catalog, probe public sources, and propose acquisition steps. | `drive/src/v2/App.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Query-ready output | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Query-ready output reported | `drive/src/v2/SynthesisPage.jsx` | Inside a technical disclosure; preserved by scope. |
| Query-ready result | `drive/src/v2/synthesisAssist.js`<br>`drive/src/v2/synthesisObjectContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| REGISTERED ASSET | `drive/src/v2/homeIteration10.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Raw probe summary | `drive/src/v2/discoverProbeEvidence.js` | Raw diagnostic label in the Technical evidence disclosure. |
| Registered inputs: {…} | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Registered output | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Registered output reported | `drive/src/v2/SynthesisPage.jsx` | Inside a technical disclosure; preserved by scope. |
| Registered result | `drive/src/v2/synthesisAssist.js`<br>`drive/src/v2/synthesisObjectContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Registered · reconciliation pending | `drive/src/v2/historyLifecycleLabel.js` | Original internal status; displayed through the label mapping. |
| Registered · unconfirmed | `drive/src/v2/historyLifecycleLabel.js` | Original internal status; displayed through the label mapping. |
| Registration does not imply query readiness unless it is explicitly verified | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Registration evidence | `drive/src/v2/SynthesisPage.jsx` | Inside a technical disclosure; preserved by scope. |
| Registration in progress | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Registration not complete | `drive/src/v2/discoverLifecycle.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Related lab asset | `drive/src/v2/BrowsePage.jsx` | Matcher for incoming legacy copy; displayed replacement is “Related Library dataset”. |
| Request one reviewable construction for explicit method review | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Rerun Preview for the current accepted revision | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Researcher-recorded specification from measured held evidence. | `drive/src/v2/SynthesisSpecificationPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review held evidence | `drive/src/v2/SynthesisAgentConsole.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review held evidence and route genuine gaps | `drive/src/v2/SynthesisIdleRailPanel.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review held evidence before method reasoning | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review measured evidence and turn it into one reviewable construction | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review pending procurement approvals on this desk. | `drive/src/v2/homeBriefing.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review the declared connector route for {…}. | `drive/src/v2/discoverIntent.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review the recommendation and decide whether this is the right construction to design | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Review the revision, Preview evidence, inputs and requested output before deciding | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Scope this construction {…}. Say what that removes from my question. | `drive/src/v2/SynthesisPage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Search and describe Library holdings as needed. Rank evidence by what the asset actually contains, not just title similarity. | `drive/src/v2/librarySearch.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| State the research purpose or reuse a registered method | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Synthesis Autopilot is allowed to resolve supported method decisions for this durable thread. | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Synthesis holds saved builds | `drive/src/v2/HomePage.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Test the accepted recipe on bounded bytes | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| The accepted recipe did not complete on bounded bytes | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| The accepted recipe has not yet been executed on bounded bytes | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| The construction has no reviewed evidence yet | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| The engine refuses to hold more than a million rows in one step. It fails loud rather than sampling silently. | `drive/src/v2/ScopePanel.jsx` | Ordinary verb or adjective; does not name a replaced concept. |
| The faculty registry holds no specialties, methods, or current research direction for this record. | `drive/src/v2/ProfilePage.jsx` | Ordinary verb or adjective; does not name a replaced concept. |
| The receipt is bounded evidence, not a full-population result | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| The saved receipt belongs to an older method or input revision | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| This inner join changes the observed population. Confirm that row loss is an intentional research choice. | `drive/src/v2/SynthesisSpecificationPage.jsx` | Ordinary verb or adjective; does not name a replaced concept. |
| Trace the evidence and authority behind the current Synthesis decision. | `drive/src/v2/SynthesisAgentConsole.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Unit / grain | `drive/src/v2/synthesisDraft.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Use only the recorded research object, held evidence, deterministic measurements, and source/documentation evidence available to this thread. | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Use or reuse the registered research asset | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Use the durable thread and measured evidence as authority; do not infer facts merely from the visual label. | `drive/src/v2/synthesisObjectContext.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Use what your Library already holds before collecting again. | `drive/src/v2/discoverComposition.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Wait for the worker and registry lifecycle to produce durable evidence | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What changed in the durable Synthesis state most recently? | `drive/src/v2/SynthesisAgentConsole.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What coverage would acquiring {…} add beyond the local asset? Do not invent dimensions. | `drive/src/v2/discoverSufficiency.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What did the completed local comparison check for {…}, and why was no qualifying Library asset found? | `drive/src/v2/discoverSufficiency.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What does this bounded Preview fail to cover? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What exactly will bounded Preview test for this method? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What grain and time horizon should I state before creating this construction? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What is the next material method decision in this construction? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What proof is still missing before this worker output becomes a Library asset? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What query-ready datasets do we already hold for my research? | `drive/src/v2/homePrompts.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What remains before this asset is query-ready? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What remains unverified until registration completes? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What should I probe next for {…}? | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What was or will be registered from collecting {…}? | `drive/src/v2/DiscoverEvaluationSurface.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| What would falsify this proposed proxy construction? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Which assumption changes if I accept this revision? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Which durable execution evidence tells us where this failed? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Which held assets overlap? | `drive/src/v2/AskRail.jsx` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Which method and input revisions are bound to this approval request? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Which part of the accepted recipe caused the bounded run to fail? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Why is the local dataset only partial for {…}? Use the documented coverage/grain differences only. | `drive/src/v2/discoverSufficiency.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Why is this construction preferred over the alternatives? | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| Worker completion is not registration or query readiness | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| [{…}].authority must be "observed" (the data settled it) or "desk" (a choice, so contestable) | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| a construction whose row count exceeds MAX_OUTPUT_ROWS | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| a declared route | `drive/src/v2/collectRouteLabel.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| and what the desk would have to fix. Exit 1 if any field is malformed. | `drive/src/v2/synthesisContractCheck.js` | Technical validation/sample contract, not rendered UI copy. |
| asset × week | `drive/src/v2/synthesisDraft.js` | Financial asset unit of observation, not a Library object. |
| asset × week | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| bounded input rows, not the full population | `drive/src/v2/synthesisAssist.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| decisions must be the settled decisions the revision inherits | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| estimates and revisions | `drive/src/v2/browseMeta.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| grain incompatible | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| not declared | `drive/src/v2/LibraryDatasetRailPanel.jsx` | Inside a technical disclosure; preserved by scope. |
| target grain asset × week | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| the prior method this thread is a revision of | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| the registered execution's method record | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| what differs between the prior method and this revision | `drive/src/v2/synthesisContract.js` | Technical validation/sample contract, not rendered UI copy. |
| {…}/library/desk/session | `drive/src/v2/apiCore.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |
| {…}:holding:{…} | `drive/src/v2/libraryHoldings.js` | Backend-bound prompt, context, proposal, or legacy request wording; preserved by scope. |

Protected identifiers and control strings, including `query_ready`, `pending_approval`, `registered`, `CHECK`, `NEED`, `NOT CHECKED`, `a declared route`, test IDs, CSS class names, and route IDs, remain technical values rather than display vocabulary. Their occurrences are not renamed.

Existing font declarations and typography classes were retained because the authorized scope is user-visible strings and CSS `content:` only. No claim is made that existing typography or live layouts were verified.

## Every changed file

- `docs/status/generated/ui-vocabulary-application.md`
- `docs/status/generated/ui-vocabulary.csv`
- `drive/src/v2/App.jsx`
- `drive/src/v2/AskRail.jsx`
- `drive/src/v2/BrowsePage.jsx`
- `drive/src/v2/CatalogList.jsx`
- `drive/src/v2/CatalogRow.jsx`
- `drive/src/v2/ConnectedAccountsSection.jsx`
- `drive/src/v2/DeskAccessGate.jsx`
- `drive/src/v2/DeskError.jsx`
- `drive/src/v2/DetailPanel.jsx`
- `drive/src/v2/DiscoverCoveragePanel.jsx`
- `drive/src/v2/DiscoverEvaluationSurface.jsx`
- `drive/src/v2/DiscoverEvidenceBrief.jsx`
- `drive/src/v2/DiscoverEvidenceField.jsx`
- `drive/src/v2/DiscoverHistoryPanel.jsx`
- `drive/src/v2/DiscoverHistoryRailPanel.jsx`
- `drive/src/v2/DiscoverIntentRailPanel.jsx`
- `drive/src/v2/DiscoverIntentWorkspace.jsx`
- `drive/src/v2/HomePage.jsx`
- `drive/src/v2/HomeSuggestedAsks.jsx`
- `drive/src/v2/InspectorRail.jsx`
- `drive/src/v2/LibraryAssetWorkspace.jsx`
- `drive/src/v2/LibraryDatasetRailPanel.jsx`
- `drive/src/v2/LibraryDatasetRailPanel.test.js`
- `drive/src/v2/LibraryEvidenceEstate.jsx`
- `drive/src/v2/LibraryFolderRailPanel.jsx`
- `drive/src/v2/LibraryHoldingsOverlay.jsx`
- `drive/src/v2/LibraryIntakeRailPanel.jsx`
- `drive/src/v2/LibraryPackagePanel.jsx`
- `drive/src/v2/LibraryPage.jsx`
- `drive/src/v2/MethodSurfacePanel.jsx`
- `drive/src/v2/MultiOverlapVisual.jsx`
- `drive/src/v2/PreviewModal.jsx`
- `drive/src/v2/ProfilePage.jsx`
- `drive/src/v2/RailPanels.jsx`
- `drive/src/v2/ResearchSituationRail.jsx`
- `drive/src/v2/ResourcesOverviewRailPanel.jsx`
- `drive/src/v2/ResourcesPage.jsx`
- `drive/src/v2/ReusePanel.jsx`
- `drive/src/v2/ScopePanel.jsx`
- `drive/src/v2/SettingsPage.jsx`
- `drive/src/v2/SettledDecisionsPanel.jsx`
- `drive/src/v2/StatusPill.jsx`
- `drive/src/v2/SynthesisAgentConsole.jsx`
- `drive/src/v2/SynthesisAuthorityMount.jsx`
- `drive/src/v2/SynthesisHome.jsx`
- `drive/src/v2/SynthesisIdleRailPanel.jsx`
- `drive/src/v2/SynthesisJourneyNav.jsx`
- `drive/src/v2/SynthesisPage.jsx`
- `drive/src/v2/SynthesisSpecificationPage.jsx`
- `drive/src/v2/SynthesisThreadRailPanel.jsx`
- `drive/src/v2/SynthesisVisualReasoning.jsx`
- `drive/src/v2/V2DeskHeader.jsx`
- `drive/src/v2/activeObject.js`
- `drive/src/v2/api.js`
- `drive/src/v2/apiCore.js`
- `drive/src/v2/archiveRuntimeStatus.js`
- `drive/src/v2/archiveRuntimeStatus.test.js`
- `drive/src/v2/askText.jsx`
- `drive/src/v2/assessmentLabels.js`
- `drive/src/v2/assetAuthority.js`
- `drive/src/v2/attentionModel.js`
- `drive/src/v2/browseMeta.js`
- `drive/src/v2/collectRouteLabel.js`
- `drive/src/v2/composerRuntimeStatus.js`
- `drive/src/v2/datasetMeta.js`
- `drive/src/v2/datasetMeta.test.js`
- `drive/src/v2/deskErrorCopy.js`
- `drive/src/v2/deskErrorCopy.test.js`
- `drive/src/v2/deskIntegration.js`
- `drive/src/v2/deskStatusBadge.js`
- `drive/src/v2/deskStatusBadge.test.js`
- `drive/src/v2/discoverActions.js`
- `drive/src/v2/discoverAdapters.js`
- `drive/src/v2/discoverEvaluation.js`
- `drive/src/v2/discoverEvaluation.test.js`
- `drive/src/v2/discoverHistoryHandoff.test.js`
- `drive/src/v2/discoverHistoryTruth.test.js`
- `drive/src/v2/discoverIntent.js`
- `drive/src/v2/discoverIntent.test.js`
- `drive/src/v2/discoverLifecycle.js`
- `drive/src/v2/discoverLifecycle.test.js`
- `drive/src/v2/discoverProbeEvidence.js`
- `drive/src/v2/discoverProbeEvidence.test.js`
- `drive/src/v2/discoverRestingSummary.js`
- `drive/src/v2/discoverRestingSummary.test.js`
- `drive/src/v2/discoverStrategyCard.js`
- `drive/src/v2/discoverStrategyCard.test.js`
- `drive/src/v2/discoverSufficiency.js`
- `drive/src/v2/discoverTaxonomy.js`
- `drive/src/v2/discoverTaxonomy.test.js`
- `drive/src/v2/folderBrowseSummary.js`
- `drive/src/v2/folderBrowseSummary.test.js`
- `drive/src/v2/historyKnownUnknowns.js`
- `drive/src/v2/historyKnownUnknowns.test.js`
- `drive/src/v2/historyLifecycleLabel.js`
- `drive/src/v2/historyLifecycleLabel.test.js`
- `drive/src/v2/homeBriefing.js`
- `drive/src/v2/homeBriefing.test.js`
- `drive/src/v2/homeIteration10.js`
- `drive/src/v2/hpsHomeContinuity.test.js`
- `drive/src/v2/libraryEstate.js`
- `drive/src/v2/libraryHoldings.js`
- `drive/src/v2/libraryHoldings.test.js`
- `drive/src/v2/libraryPackageApi.js`
- `drive/src/v2/libraryReadinessOwnership.test.js`
- `drive/src/v2/librarySearch.js`
- `drive/src/v2/libraryVerification.js`
- `drive/src/v2/liveIdentity.js`
- `drive/src/v2/liveIdentity.test.js`
- `drive/src/v2/plainText.js`
- `drive/src/v2/previewValue.js`
- `drive/src/v2/procurementJobs.js`
- `drive/src/v2/professorVaultTree.js`
- `drive/src/v2/profileViewModel.js`
- `drive/src/v2/providerMarks.js`
- `drive/src/v2/refreshLifecycleStates.test.js`
- `drive/src/v2/resourcesCapacity.js`
- `drive/src/v2/resourcesFromRollup.js`
- `drive/src/v2/resourcesLedger.js`
- `drive/src/v2/resourcesSpending.js`
- `drive/src/v2/styles/05-synthesis-workstation.css`
- `drive/src/v2/synthesisAssist.js`
- `drive/src/v2/synthesisAssist.test.js`
- `drive/src/v2/synthesisAutomation.js`
- `drive/src/v2/synthesisBrief.js`
- `drive/src/v2/synthesisDraft.js`
- `drive/src/v2/synthesisFocus.js`
- `drive/src/v2/synthesisLifecycle.js`
- `drive/src/v2/synthesisLifecycle.test.js`
- `drive/src/v2/synthesisWorkspace.js`
- `drive/src/v2/synthesisWorkspace.test.js`
- `drive/src/v2/threadRecord.js`
- `drive/src/v2/threadRecord.test.js`
- `drive/src/v2/useAskChat.js`
- `e2e/desk-access-boundary.spec.js`
- `e2e/desk-access-gate.spec.js`
- `e2e/desk-error-copy.spec.js`
- `e2e/discover-composition-screenshots.spec.js`
- `e2e/discover-d0-screenshots.spec.js`
- `e2e/discover-d1-screenshots.spec.js`
- `e2e/discover-evaluation-screenshots.spec.js`
- `e2e/discover-history-visual.spec.js`
- `e2e/discover-lifecycle-screenshots.spec.js`
- `e2e/discover-reconvergence-visual.spec.js`
- `e2e/discover-sufficiency-screenshots.spec.js`
- `e2e/discover-visual-convergence.spec.js`
- `e2e/history-reconciliation-truth.spec.js`
- `e2e/hps-functional-convergence.spec.js`
- `e2e/interaction-guidance.spec.js`
- `e2e/interaction-robustness.spec.js`
- `e2e/layout-overlay-geometry.spec.js`
- `e2e/library-convergence-render.spec.js`
- `e2e/library-estate-screenshots.spec.js`
- `e2e/library-folder-workflow.spec.js`
- `e2e/library-freshness.spec.js`
- `e2e/library-holdings.spec.js`
- `e2e/library-preview-closure-render.spec.js`
- `e2e/library-retrieval-excellence-render.spec.js`
- `e2e/library-visual-depth-render.spec.js`
- `e2e/multi-user-authority.spec.js`
- `e2e/professor-demo.spec.js`
- `e2e/rc2-release-journey.spec.js`
- `e2e/release-visual-convergence.spec.js`
- `e2e/synthesis-acceptance-screenshots.spec.js`
- `e2e/synthesis-continuity.spec.js`
- `e2e/synthesis-convergence-render.spec.js`
- `e2e/synthesis-layout-robustness.spec.js`
- `e2e/synthesis-preview-authority.spec.js`
- `e2e/synthesis-production-scale-render.spec.js`
- `e2e/unmeasured-not-zero.spec.js`
- `e2e/v2-discover-adversarial.spec.js`
- `e2e/v2-discover-authority-depth.spec.js`
- `e2e/v2-discover-evidence.spec.js`
- `e2e/v2-discover-hostile-journey.spec.js`
- `e2e/v2-discover-loop.spec.js`
- `e2e/v2-discover-submit-recovery.spec.js`
- `e2e/v2-discover.spec.js`
- `e2e/v2-home.spec.js`
- `e2e/v2-library-package.spec.js`
- `e2e/v2-library.spec.js`
- `e2e/v2-parity.spec.js`
- `e2e/v2-platform-convergence.spec.js`
- `e2e/v2-preview.spec.js`
- `e2e/v2-profile-freeze.spec.js`
- `e2e/v2-resources.spec.js`
- `e2e/v2-synthesis.spec.js`
- `e2e/visual-closure-acceptance.spec.js`
