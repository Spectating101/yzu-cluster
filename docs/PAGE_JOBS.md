# Page jobs and budgets

Each destination has one job. A change that adds a section, a panel or a block of
explanation to a page has to say which part of the job it serves; otherwise it does
not go in. The first-screen budgets are enforced by `e2e/page-budgets.spec.js`
(limits in `e2e/fixtures/page-budgets.json`) and only ever go down.

Measured at 1440x900, words visible without scrolling, framed boxes (three or more
borders), distinct text colours. The e2e gate runs on the mock API; real-data numbers
are reported by `scratchpad`-style probes and are the ones that matter to a researcher.

| Page | Job (one sentence) | Does not carry |
|---|---|---|
| Home | Resume what I was doing and see what needs me. | Library coverage, explanations of other pages. |
| Library | Find a dataset I already have and open it. | Source catalogues, Discover's search. |
| Discover | Ask for data I need; see what the Library holds and what could be collected. | Source lists, coverage panels, step explainers on the idle page. |
| Synthesis | Say what dataset I need and why; have the agent propose how to build it from datasets we hold; review it as a diagram and approve. | Explanations of what Synthesis is; lists of saved methods as the landing view. |
| Resources | Show what the desk can reach and how much capacity is left. | Anything about a specific dataset. |
| Profile | Say what I work on so suggestions fit. | Account administration. |
| Settings | Account, connections and preferences. | Operational dashboards. |

## Discover

Peers (idle page, 2026-10-22): Google Dataset Search is a title, a box and one line of
suggestions, about 20 words. Zenodo, Hugging Face and data.gov start from the box and a
filter column. Results everywhere are a list (title, provider, format, updated) with a
detail pane or detail page (provider, licence, period, area, description). Ours matches
that for results; only the idle page is the outlier (78 words in July, 273 on 2026-10-22).

Idle page: heading, one composer, one line of suggested searches. Nothing else.
Source information lives on Resources. Library counts live on Library and in the rail.

## Synthesis

Closest comparables are not search products: dbt lineage (sources on the left flowing
to the finished model on the right, small named nodes, a side panel with the selected
node's columns), DBeaver and dbdiagram ER diagrams (tables as boxes of columns joined by
lines), and the July Synthesis studio (datasets as boxes feeding one research object).

Job: researcher says what data they need and for what purpose, in conversation with the
agent. The agent proposes how to build it from datasets already held, and the page
shows that as a diagram: source datasets with their key columns, the joins between
them (on which key), derived measures, and the output dataset with its grain
(for example asset x week). Charts and a sample of the output illustrate the result.
The researcher edits, asks, and approves; nothing runs before approval.

Landing view: the diagram workspace with a list of builds, not a page that explains.
Right panel: the selected node (columns, provenance, gaps) and Ask.

## History of why pages changed (so it is not repeated)

* July pages showed ranked sections, progress steps and counts the backend could not
  support (commit 78e7e559). The fix removed those claims; later fixes added panels to
  prove claims instead of dropping them, and Discover's idle page grew from 78 to 273
  words. A fix for a wrong claim removes the claim.
* The July Synthesis canvas was view-only; it was replaced by a staged workflow
  (2026-08-25) because builds need approval, execution and a saved result.
