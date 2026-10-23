# Research Drive audit consolidation — 3 October 2026

## Ownership and current release

Changes are isolated in `codex/audit-consolidation-20261003` (UI) and `codex/audit-consolidation-backend-20261003` (backend). Claude's working trees, scratch files, services, and deployment configuration were not edited. No release was deployed by Codex.

The audit began with UI `91f07150` and backend `c95e4ca5`. During implementation another operator advanced the public backend to `4d8bdfa9` (FRED routing and collection of HTML tables). The backend fix was rebased onto that release without conflicts and tested with its new collection tests. Public UI remains `91f07150`; private desk :8775 remains inactive.

Backend handoff commit: `9ae8373c2799217ee69ba6a973c4d1b01376985f`. UI handoff: the commit at the head of `codex/audit-consolidation-20261003`. Both branches are local and reviewable; nothing was pushed.

## Findings resolved

| Finding | Change and acceptance |
| --- | --- |
| Internal/stale records offered as external downloads | Collection index records reconcile against current registry IDs. Missing older versions are excluded; current records use their current local availability. Generic collection actions require a DOI before describing DataCite as a route. Identity-less procured metadata is excluded. Real DOI and queue routes remain supported. |
| Misleading Library evidence count | Backend counts only locally ready evidence and returns explicit result roles and offering flags. The UI also handles the previously served response shape, excludes missing index snapshots after catalog hydration, and preserves live registry results that precede hydration. Equal titles never merge distinct dataset IDs. |
| Readiness and verification conflated | The Status select groups query readiness separately from source verification. Queryable, unconfirmed data can be found through either appropriate filter. Counts retain their respective meanings. Removed the CSS-generated select-label substitution. |
| Similar Library titles difficult to distinguish | Titles allow two lines and expose the full title through the native title attribute. Match explanations use the dataset name when the search returned a raw ID as a name match. |
| Raw upstream IDs dominate provenance | Inputs resolve to named links by exact dataset ID. Clicking the captured county input opens that ID, including when other inputs have identical titles. Unknown inputs are labelled as absent from the current Library; IDs remain in Technical details. |
| Guest pages too large and misleading | Smaller Synthesis/Resources introductions, simpler copy, clearer sign-in/browsing actions. Home's Ask example prompts are hidden when Ask is unavailable. Guest rail Ask buttons without handlers become sign-in guidance. Empty Add evidence sections are hidden. |
| Keyboard recovery | Closing the Library inspector restores focus to its opening evidence row; metadata hydration does not reset inspector focus. |
| Smaller identity/copy defects | BLS is no longer misclassified as LAB because of “Labor”. Official API collection routes have a specific readable label. Legacy History URLs open Discover History; unsupported destinations show Home instead of an empty centre. |

The captured real county-unemployment search now shows **2 external official sources and 3 current Library results**, with no false DataCite route or procured metadata copies. Current catalogue holdings remain **78**, with **43 references**; the old 104/48/10 inventory is not a valid current baseline.

## Verification

- Main UI unit suite: **573 passed, 0 failed**; **3 Ask-context pretests passed**.
- Browser suite covering Discover, Library, guest/member boundaries, and every page mount: **50 passed**. Targeted reruns passed after final stale-ready index and guest-rail refinements.
- Backend tests after rebasing onto Claude's concurrent release: **204 passed**, covering identity reconciliation, grounded Discover/Synthesis, public-data resolution, and URL/table download handling.
- Production Vite build passed. Its large bundle warning remains; no code splitting was attempted in this pass.
- Captured public datasets, partitions, capabilities, history, saved analysis metadata, and bounded query output were replayed against the local patched UI at **1440×900, 1280×900, and 390×844**. All **15 page/viewport checks** had no uncaught browser errors or document horizontal overflow. Screenshots were read, including the saved OLS result, warning, coefficients, input link, and mobile controls. Statistical results were displayed, not independently recomputed.
- A durable browser regression covers stale ready and non-ready index rows, metadata-only collected receipts, equally titled current holdings, and a legitimate DOI source. The Search wider and late-hydration regressions preserve valid evidence.
- Frontend pipeline: `codex-audit-consolidation-20261003`, extending the existing Research Drive design and data-table template.

Evidence: `/home/phyrexian/.config/yzu-host-acceptance/evidence/fe_loop_codex_consolidation_20261003/`. See `browser-checks.json`, `verify.mjs`, the snapshot, and screenshots. Original read-only audit and research references: `../fe_loop_codex_audit_20261003/AUDIT.md`.

## Remaining work and limits

1. Verify a signed-in research journey using existing saved work: Discover → correct Library input → query → saved Synthesis method/result → reopen. This pass tested mocked member boundaries and real guest evidence, not authenticated Ask or creation/approval/execution.
2. Measure server cold load and concurrent use. Earlier warm measurements were fast enough to retire the blanket 4–15 second claim, but controlled cold/concurrency performance is still unmeasured.
3. Native 200% browser zoom, complete screen-reader/status-message behaviour, and a full accessibility audit remain unverified. Mobile reflow and focus return are covered.
4. Guest workflow explanations can be shortened further if user observation shows they still obstruct browsing. Library descriptions retain one-line truncation; two-line titles and named inputs address the immediate distinction problem.
5. The complete historical browser suite was not rerun. The earlier report's three old failures cannot be assumed to remain unchanged. No new visual grade is assigned.

## Integration

Review/cherry-pick the UI branch head into Claude's UI integration branch and backend commit `9ae8373c2799217ee69ba6a973c4d1b01376985f` into its backend integration branch. Check the live desk baseline again before combining or deploying; other work is ongoing. The backend patch is based on `4d8bdfa9`; UI is based on `91f07150`. Deployment is a separate action.
