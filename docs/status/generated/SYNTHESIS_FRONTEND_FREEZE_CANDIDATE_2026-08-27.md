# Synthesis frontend freeze candidate — 2026-08-27

This is a non-functional audit marker for the final frontend hardening proof.

Product and browser-contract tree immediately below this marker: `0892061242d912e57dcc26556d92a500d90516e3`.

Final sequencing, interaction, and reproducibility contract now pinned in product code and browser tests:

- durable construction creation does not implicitly launch Ask reasoning;
- registered-method seeding does not implicitly launch Ask reasoning;
- held Library evidence discovery remains automatic and read-only;
- evidence becomes durable only after explicit researcher mapping;
- method reasoning remains disabled until evidence is mapped;
- method reasoning begins only after an explicit researcher action;
- an explicit reasoning turn remains pending across evidence-mapped `explore` state until a proposal, execution state, registration/query-ready state, or failure resolves it;
- assistant availability gates reasoning, not deterministic construction/evidence setup;
- browser contracts explicitly enter the durable thread they intend to exercise because Synthesis now opens at workspace home;
- proposal-recording fixtures preserve the pre-proposal state until the researcher actually starts or uses Ask;
- the pre-acceptance opening retains its deliberate four-step grammar: Define → Map evidence → Reason → Approve;
- the durable project lifecycle remains Define → Ground → Review → Build → Reuse;
- Ask assertions follow the actual phase-aware rail: Research objective, Method design, and Proposal review;
- pairwise overlap contracts assert explicit current-only / usable-overlap / added-only populations;
- measured unit conflicts are asserted as the authoritative consequential decision surface ahead of deep method evidence;
- finalized registered/query-ready outputs expose a first-class Reproduce surface for the exact archived `method.py`;
- View and Download retrieve the checksum-bound frozen artifact directly and never route through Ask/LLM regeneration;
- the Reproduce surface distinguishes Composer proposal → researcher acceptance → deterministic script generation and exposes method/spec hashes;
- the opening rail is asserted as structured Evidence / Measured / Method / Output state instead of superseded summary prose.

Freeze requires Runtime contracts, Synthesis convergence render, and Synthesis UI Validation to pass on this exact checkpoint SHA, followed by artifact/pixel and PR-residue inspection.

This marker does not authorize merge or deployment.
