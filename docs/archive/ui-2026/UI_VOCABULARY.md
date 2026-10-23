# Research Drive vocabulary

What a professor reads on screen. Built from the full string inventory
(`docs/status/generated/ui-vocabulary.csv`, 1,855 terms; 270 carry system jargon) and matched to the words
researchers already use on the platforms they know:

- **WRDS**: date range → company codes → variables → output; "query".
- **ICPSR**: public-use / restricted-use, secure download, online analysis, "study".
- **Dataverse**: draft / published, public / restricted, request access, version.
- **DataCite / CASRAI**: resource type (dataset, text, software), provenance.

## Rules

1. Say what the researcher can do, not what the system recorded. "Ready to query", not "Registered · query-ready authority".
2. One word per concept everywhere: the same thing is never a "holding", an "asset" and an "object" on different screens.
3. Sentence case. Uppercase is for small section labels only; never for buttons, questions or status sentences.
4. Mono type is for identifiers, code and numbers in tables — never for words.
5. The precise internal term may stay in a tooltip or under *Technical details*, never as the headline.
6. Never claim more than the evidence: plain words keep the same honesty ("not yet checked", not "ready").

## Concepts

| On screen now | Say instead | Why |
|---|---|---|
| Query-ready | Ready to query | WRDS/ICPSR "query", "online analysis" |
| Registered · unconfirmed | In Library · not yet checked | the file is saved; nobody has confirmed it opens |
| Registered · reconciliation pending | In Library · being checked | |
| Registered (output / method) | Saved to Library | Dataverse "published" is too strong; "saved" is accurate |
| Holdings / held evidence | Your Library / data you have | one noun: Library |
| Research lifecycle | Request history | it lists requests and their outcomes |
| Intent (record, ID) | Request | |
| Lifecycle item | Request | |
| Holding truth | Current state | |
| Recorded event | Last step | |
| Latest durable update | Last updated | |
| Durable (construction, record, work) | Saved | "durable" is a storage property, not a research one |
| Construction / new construction | Build / new build | Synthesis builds a derived dataset |
| Recommended construction | Suggested build | |
| Authority proof | How this was verified | |
| Decision basis | Why this status | |
| Evidence position | What your Library covers | |
| Truth boundary | What this does and doesn't claim | |
| Sourcing | Where to get it | |
| Source route / access route | How it's collected / access | |
| Collection route declared | Download method known | |
| Probe source / probed | Test connection / connection tested | |
| Grain / target grain / required grain | Unit of observation | standard empirical-research term (e.g. firm × week) |
| Bounded preview / bounded sample | Sample preview / test run on a sample | |
| Materialised | Built | |
| Revision bound / exact revision | This version | Dataverse "version" |
| Promote (to Library) | Add to Library | |
| Declared (fields, scale, coverage) | Documented | |
| Canonical archive | Master copy (Google Drive) | |
| Licensed / entitlement | Licensed · university access | ICPSR restricted-use pattern |
| Desk (notices, connection, degraded) | Research Drive / system | "desk" is our word, not theirs |
| Operator | Administrator | |
| Manifest, job id, registry id, revision id | *Technical details only* | identifiers, not vocabulary |

## Status words (pills)

| Now | Say instead |
|---|---|
| Query-ready | Ready to query |
| Registered · unconfirmed | Not yet checked |
| Approval required | Waiting for your approval |
| Collecting / running | Collecting |
| Needs recovery | Needs attention |
| Access not verified | Access not checked |
| Collection route declared | Download method known |
| Reference only | Reference (not downloadable) |
