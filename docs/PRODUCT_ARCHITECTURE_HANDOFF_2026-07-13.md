# Research Drive product architecture handoff — 2026-07-13

## Purpose of this freeze

This document freezes the product interpretation reached after the premium frontend pass, Library/Discover contract work, the first-class Synthesis studio, and the subsequent Synthesis construction-graph exploration.

Use this as the starting authority for the next product-design chat. Do not re-derive the app as one linear workflow and do not expand Resources into an operations console.

## Product thesis

Research Drive is a set of purpose-built research workspaces connected by the same data objects, AI context, source knowledge, and institutional state.

Core principle:

> workspace-specific excellence with shared intelligence

The app is not an AI chat product with tabs. It is not one global workflow. Ask is the contextual reasoning layer across specialised workspaces.

## Whole-product model

- **Home** resumes and orients.
- **Library** remembers what research assets the lab owns.
- **Discover** understands the external evidence universe and designs how evidence can be sourced.
- **Synthesis** designs how defensible research assets, measures, proxies, panels, event sets, and derived constructs can be built.
- **Resources** reports the lab's available capability, usage, spend, and demonstrated value.
- **Profile** stores transparent researcher context.
- **Ask** reasons around the current workspace, object, and institutional context.

The two main differentiation/moat surfaces are **Discover** and **Synthesis**.

## Home

Role: Drive Home / workspace start.

It should answer:

1. What was I working on?
2. What needs attention?
3. Where can I begin?

Keep it restrained. Current recent-work/attention/start composition is broadly correct, although equal Search/Discover/Ask launchers can still feel generic.

Do not turn Home into a workflow dashboard.

## Library

Role: the lab's owned research-data estate.

Mental model:

> Google Drive for research data, where every object understands research-data concepts.

Library owns organisation and memory:

- folders/collections;
- list/grid;
- sorting/filtering;
- selection;
- preview;
- breadcrumbs;
- move/rename/organise;
- contextual actions;
- recent/shared assets;
- distinction between raw, acquired, cleaned, and derived assets.

Research object truth remains important:

- readiness;
- provenance;
- grain;
- coverage;
- access state;
- ownership;
- source identity.

Unknown state must never default to Query ready. Only Query ready exposes Preview rows.

Do not add giant lineage graphs or metadata walls to Library.

## Discover — moat surface 1

Discover is larger than a catalogue.

Its governing question is:

> What evidence exists, and how can the lab obtain it?

### Discover mode A: index / browse / Focus

This is the current source and dataset universe.

It answers:

- what exists;
- who provides it;
- what it covers;
- whether the lab already has it;
- whether the lab can access it;
- whether it is usable/acquirable;
- how it compares with local coverage and grain.

Protected Browse grammar:

- RESEARCH INDEX
- `N results for query`
- Already in your lab
- Sources beyond your lab
- Needs access

Protected Focus hierarchy:

1. Identity
2. Can I use this?
3. Lab coverage
4. Useful for
5. Coverage
6. Evidence
7. Uncertainty
8. Action
9. Technical details

Protected identity chain:

`candidate_key → probe_id → job_id → output_manifest_id → registered_dataset_id`

Do not replace canonical identity with title matching.

### Discover mode B: sourcing / acquisition engineering

This is the major product correction frozen in this handoff.

The second Discover subtab/mode should not be moved to Resources.

Its question is:

> Given a research evidence need, what is the strongest acquisition route the lab can design from known providers, query systems, APIs, licensed sources, public datasets, connectors, and collection methods?

The agent may reason across, for example:

- BigQuery public datasets;
- GDELT;
- DataCite;
- Refinitiv;
- Etherscan;
- CoinGecko;
- public dumps;
- websites and archives;
- configured connectors;
- known external providers;
- existing lab holdings.

A proposed sourcing state can compare routes by:

- coverage;
- grain;
- fields;
- access/license state;
- expected cost or quota use;
- rate limits;
- historical availability;
- filtering/entity-resolution requirements;
- refresh strategy;
- failure/uncertainty;
- destination object in Library.

Example conceptual output:

`research need → candidate routes → selected source → filter/query/collect design → refresh strategy → registered raw/acquired asset`

Discover therefore **constructs acquisition machinery**.

The LLM/Composer should propose sourcing changes as structured state, not only prose. The researcher should be able to inspect why one route is preferred and approve material sourcing choices.

## Synthesis — moat surface 2

Synthesis is not merely a join studio and is not limited to assets already held in Library.

Its governing question is:

> The research asset or measure I need does not cleanly exist. What is the strongest defensible thing the lab can construct from held, queryable, sourceable, licensed, missing, and derivable evidence?

Canonical example: historical stablecoin attention.

The ideal direct measure, historical X follower growth, is unavailable. The lab can reason across Google Trends, Reddit, Wikipedia, GDELT, and other reachable signals; interpret what each measures; assign core versus validation roles; align temporal grain; normalise; define component-availability and weighting rules; validate; and materialise a new `attention_proxy_index` research asset.

Synthesis therefore **constructs research meaning and derived assets**.

Possible outputs include:

- proxy variables;
- indices/factors;
- longitudinal reconstructions;
- derived feature panels;
- event datasets;
- combined research panels;
- matched samples;
- transformed series;
- reusable research asset specifications.

### Agent/interface model

The LLM already has sufficient reasoning capability for much of this work when given source/index/tool context. The harder product problem is persistent state representation.

The intended model is:

> agent reasons → proposes controlled state patch → interface renders the construction state/diff → researcher inspects/challenges/approves → state persists → tools execute/materialise honestly

The graph is not a manual Alteryx-style editor. Researchers should not be expected to drag and wire arbitrary nodes.

### PR #29 construction-workbench experiment

Draft PR #29 (`agent/synthesis-construction-graph`) replaces the narrow recipe-style Synthesis concept with an AI-maintained construction workspace using React Flow and ELK.

Implemented concepts:

- semantic construction map;
- target, evidence-family, source, process, and output nodes;
- held/queryable/proposed/missing/derived state language;
- typed semantic relationships;
- ELK layered automatic composition;
- right-rail Detail context driven by node selection;
- Ask attached to the active synthesis;
- Map / Spec / Data / Charts views over the same synthesis state;
- controlled apply/reject proposal state;
- honest no-rows-materialised and planned-output states;
- model/state unit tests and Synthesis browser contracts.

The stablecoin-attention seed is intentionally based on the real stable-attention-proxy problem.

Current frozen validation before cleanup:

- normal CI run #243: success;
- Synthesis graph visual audit run #22: success;
- focused Synthesis browser contract: 5/5 passed;
- latest interaction correction: minimap is overview-only so it cannot intercept node clicks.

Important caveat:

> PR #29 is still a draft product experiment. Do not blindly merge it merely because tests are green. The next chat should review the final graph silhouette and decide whether the workbench composition is genuinely the right premium interface.

CLI wireframes should be used before large frontend rewrites for unresolved Synthesis/Discover interface states.

## Discover versus Synthesis

These are related but distinct.

### Discover

> How can we obtain the evidence we need?

Output: sourcing specification / acquisition pipeline.

### Synthesis

> How can we construct the research asset or measure we need?

Output: research-asset specification / derived construction / materialised asset.

They may hand off to each other naturally. Synthesis can identify a missing evidence family and open a sourcing problem in Discover. Discover can acquire/register an asset and return it to an active Synthesis state.

Do not collapse them into one global workflow.

## Resources — capacity, usage, value; not operations

This section corrects the earlier mistaken interpretation of Resources as a cloud operations console.

Resources is descriptive and explanatory.

Its governing questions are:

1. What capability, access, credits, quotas, licenses, storage, and computational resources does the lab currently have?
2. What have those resources been spent or consumed on?
3. What value or capability has the lab produced because those resources exist?

Think of the familiar modern LLM/API usage dashboard, expanded for a research lab.

Possible resource inventory:

- BigQuery credits/billing capacity;
- Refinitiv connection/license;
- CoinGecko plan/credits;
- DigitalOcean or compute credits;
- storage capacity;
- model/Composer usage;
- API quota/usage;
- source access and licensed capacity.

Possible consumption attribution:

- project/synthesis;
- Discover sourcing pipeline;
- query/collection task;
- output dataset;
- storage growth;
- model calls;
- API calls;
- scanned bytes / compute spend.

Resources should also contain a restrained **value/pitch layer**. It should help a professor or lab lead understand what the lab can provide and what the infrastructure has enabled.

Examples:

- evidence universes reachable with current access;
- datasets/derived assets produced;
- historical coverage created;
- repeated work avoided through registered assets;
- projects supported;
- capability unlocked by a license or credit pool;
- approximate cost/time saved where defensibly measurable.

Resources can answer:

> We have this capacity. We used it here. This is what the lab can now do or has produced because of it.

Resources does **not** design, run, or operate sourcing pipelines. Those interactions belong to Discover. It should not become a jobs/approvals/failures operations console.

## Profile

Role: transparent researcher identity and context.

Current conceptual structure is broadly correct:

- Memory;
- Works;
- Lab.

Context may influence Discover ranking, source explanations, Ask context, and recommendations, but it must remain visible, understandable, and editable.

Do not add a giant influence graph.

## Ask / right rail

Ask is the contextual copilot layer, not a competing destination or global workflow.

The existing `Detail | Ask` right rail is a major app-wide unifying device.

Examples:

- Library asset selected → Ask understands the asset.
- Discover candidate selected → Ask understands candidate, source, access, and local coverage.
- Discover sourcing plan selected → Ask understands the current route and acquisition assumptions.
- Synthesis node selected → Ask understands its methodological role in the active construction.
- Resources usage item selected → Ask explains attribution and value context.
- Profile context selected → Ask reasons with transparent researcher context.

Pages may have very different main-canvas grammar. Shared context and object intelligence stay consistent in the right rail.

## Shared object intelligence

The same object should remain recognisable across workspaces through consistent:

- identity;
- ownership;
- readiness;
- provenance;
- coverage;
- grain;
- access state;
- actions;
- status language.

The frontend should never invent backend success. Use honest states such as Preview, Review, Not run, Registration pending, planned output, produced but registration not confirmed, and registered only when evidence confirms registration.

Raw IDs must not be primary user actions.

## Visual/product standard

Visual review order is strict:

`pixels → visual quality/silhouette → apparent UX affordances → inferred workflow → product-category read → competitor benchmark → code/copy verification`

Screenshots are primary evidence.

Ask:

> What would I infer from a blurred screenshot before reading words?

Simple is not permission to look cheap, flat, empty, or unfinished.

> Simple products have nowhere to hide bad visual decisions.

Target:

> as effortless as Google Drive, as visually complete as a top-tier premium product, while making radically more intelligent decisions with fewer visible steps

Do not imitate Atlan/DataHub density simply to signal capability.

The backend can become more powerful while the professor sees less operational bullshit.

## Recommended next-chat order

1. Review PR #29's final Synthesis screenshots/pixels and decide: merge, revise once, or keep the workbench model but redraw the composition. Do not reopen the function definition from zero.
2. Design Discover's second mode as AI sourcing/acquisition engineering. Start with CLI wireframes using a real case such as historical stablecoin/Ethereum transaction history across BigQuery, Etherscan, Alchemy, and current lab holdings.
3. Reframe Resources from operational console to capacity + usage/spend attribution + lab value/pitch dashboard.
4. Only after the two moat surfaces are settled, return to Home/Library/Profile polish.

## Repository boundaries

Public frontend repo: `Spectating101/yzu-cluster`.

Private control-plane/backend monorepo: `Sharpe-Renaissance/drive`.

The private monorepo is not accessible through the ChatGPT GitHub connector in this environment. Never claim to inspect it unless its contents are explicitly supplied through another accessible source.

## Freeze state

At this handoff, `main` still contains the merged first-class recipe/compatibility Synthesis from PR #28 at `5797aa8cdf53e2265825a631b2b02ac0dab56c74`.

The graph-based Synthesis workbench remains in draft PR #29 on `agent/synthesis-construction-graph`.

This is intentional. Product understanding advanced during the branch work. Preserve the implementation as a reviewable experiment and use the next chat to judge the final visual composition before merging.
