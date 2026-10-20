# Research Drive researcher pilot usability protocol

Status: **pilot protocol — not yet human evidence**

This protocol turns visual/product polish into inspectable researcher evidence. Automated browser tests protect interface contracts; they do **not** prove that researchers understand or can use the product. Human pilot results must remain separate from CI results.

## Goal

Test whether a researcher can move through Research Drive's actual research loop with minimal explanation:

`orient -> inspect held evidence -> identify a gap -> inspect an external candidate -> understand readiness/authority -> construct or resume durable research work`

The pilot is specifically looking for failures in information architecture, evidence-state comprehension, and recovery/resume behavior. It is not a satisfaction survey and it is not a feature-request session.

## Pilot population

Start with 3–5 invited researchers or graduate students who did not build the interface. Prefer a mix of:

- one domain expert familiar with the available data;
- one researcher comfortable with data tools but unfamiliar with Research Drive;
- one relatively cold user who can expose vocabulary and navigation assumptions.

Do not coach participants through the tasks unless they are blocked. Any operator intervention must be recorded.

## Setup

Use one exact staged frontend/backend release pair and record both SHAs before every session.

For each participant record:

- participant code, not personal identity;
- exact frontend SHA;
- exact backend SHA;
- browser / viewport;
- member role / authority class;
- whether Ask is available;
- whether the task uses already-held evidence or requires Discover;
- start and end timestamps for each task.

The participant may receive one short orientation only:

> Library is what the desk currently holds. Discover looks for evidence beyond those holdings. Ask reasons over the current research context. Synthesis preserves durable research constructions and outputs.

No route-by-route instructions should be given after that.

## Tasks

### Task 1 — orient from Home

Prompt:

> You have a research question and want to understand where to begin. Show where you would go if the required evidence is already available, and where you would go if it is missing.

Observe:

- whether the participant distinguishes Library from Discover;
- whether Ask is mistaken for a data-acquisition mechanism;
- whether Synthesis is understood as downstream durable work rather than generic chat;
- first destination chosen and reason.

### Task 2 — inspect held evidence

Prompt:

> Find an existing research asset that could be used in an analysis. Decide whether it is actually usable now.

Observe whether the participant can locate and interpret:

- source/provenance;
- verification state;
- possession/holding truth;
- query readiness;
- important boundaries or unknowns.

A participant should not receive credit merely for opening a dataset. They must correctly distinguish `exists`, `held`, `verified`, and `query-ready` when those states differ.

### Task 3 — close an evidence gap with Discover

Prompt:

> Assume the Library does not fully satisfy the research need. Use Discover to find an external candidate and decide what the desk knows about it.

Observe:

- search/query formulation;
- whether result rows are scannable;
- whether the selected row remains visually connected to Detail / Ask;
- whether the participant can identify access/collection uncertainty;
- whether they understand that a candidate is not automatically held or usable.

### Task 4 — understand the acquisition boundary

Use a candidate with a supported collection path when available.

Prompt:

> Move this candidate as far toward usable research evidence as your current authority permits. Stop before doing anything you believe requires approval.

Observe:

- whether the participant notices the approval boundary;
- whether they can explain the current lifecycle state;
- whether they mistake `submitted`, `running`, `registered`, or `query-ready` for one another;
- whether an operator must rescue the workflow.

A failed acquisition must never be interpreted as registered evidence.

### Task 5 — durable synthesis and resume

Prompt:

> Use the available evidence to begin or open a durable research construction. Leave it, then return and continue from the saved state.

Observe:

- whether Synthesis entry is discoverable;
- whether the evidence/method/preview/execution distinction is understood;
- whether the participant can leave the surface and later resume the correct object;
- whether prior evidence and state are reused rather than reconstructed manually.

## Measures

Record these per task:

| Measure | Definition |
|---|---|
| Task completion | Participant reaches the correct end state without being told the route |
| Time to correct first action | Time until the first action that advances toward the task goal |
| Wrong turns | Navigation/actions the participant reverses because the mental model was wrong |
| Operator interventions | Any instruction or backend/admin rescue required to continue |
| Evidence-state errors | Incorrect claims about held / verified / registered / query-ready state |
| Resume success | Participant returns to the correct durable object and continues it |
| Confidence explanation | Participant can explain why they trust or do not yet trust the evidence |

## Initial decision targets

These are pilot targets, not claims about current performance:

- at least 80% unassisted completion across Tasks 1–3;
- zero evidence-state errors on `registered` versus `query-ready` by the end of a session;
- no more than one operator intervention per participant across the full workflow;
- at least 80% successful resume on Task 5;
- every failure must be attributable to a specific interface, vocabulary, data, permission, or runtime cause rather than "user confusion" as a generic label.

Do not average away severe authority mistakes. One participant confidently treating external or failed evidence as query-ready is a release-significant finding even if aggregate completion is high.

## Observer notes

Use this structure for each task:

```text
participant:
task:
start:
end:
first action:
completion: yes / partial / no
wrong turns:
operator interventions:
evidence-state interpretation:
exact confusing copy/control:
participant explanation in their own words:
observed defect class: navigation / hierarchy / vocabulary / authority / data / runtime / other
```

Avoid leading questions while the task is active. Clarifying questions should come after the participant has committed to an interpretation.

## What counts as evidence

Valid pilot evidence:

- timestamped observer notes;
- screen recording with participant consent;
- exact release pair used;
- task result and intervention count;
- participant explanation of state/provenance;
- reproducible defect tied to a screen/control.

Not valid as human usability evidence:

- passing Playwright tests;
- screenshots alone;
- the builder successfully using the product;
- an LLM reviewing the interface;
- inferred participant sentiment without a recorded observation.

## Release use

After the first 3–5 sessions, classify findings into:

1. **authority defect** — user can take or infer a consequential action they should not;
2. **state-comprehension defect** — user misreads evidence/readiness/lifecycle truth;
3. **navigation defect** — correct surface/action is not discoverable;
4. **density/hierarchy defect** — correct information exists but cannot be located efficiently;
5. **copy defect** — wording produces a wrong mental model;
6. **runtime/data defect** — interface is correct but the underlying operation fails.

Fix authority and state-comprehension defects before broadening the pilot. Navigation and hierarchy defects should be fixed before calling the interface self-serve. Cosmetic preferences should not displace those gates.

## Relationship to CI

`e2e/researcher-first-use-contract.spec.js` protects a small automated prerequisite set: Home orientation, selected-object continuity, and phone containment. It should stay green, but the researcher pilot above is the evidence required to claim independent usability.
