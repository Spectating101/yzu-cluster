# Synthesis frontend freeze candidate — 2026-08-27

This is a non-functional audit marker for the final frontend hardening proof.

Product and browser-contract tree immediately below this marker: `0eccbbd589940a327afea061117c51f3b061ce5e`.

Final sequencing contract now pinned in product code and browser tests:

- durable construction creation does not implicitly launch Ask reasoning;
- registered-method seeding does not implicitly launch Ask reasoning;
- held Library evidence discovery remains automatic and read-only;
- evidence becomes durable only after explicit researcher mapping;
- method reasoning remains disabled until evidence is mapped;
- method reasoning begins only after an explicit researcher action;
- an explicit reasoning turn remains pending across evidence-mapped `explore` state until a proposal, execution state, registration/query-ready state, or failure resolves it;
- assistant availability gates reasoning, not deterministic construction/evidence setup;
- browser contracts explicitly enter the durable thread they intend to exercise because Synthesis now opens at workspace home;
- the current five-stage project grammar is Define → Ground → Review → Build → Reuse;
- pairwise overlap tests assert the current population-overlap visual rather than an obsolete intersection test id;
- the opening rail is asserted as structured Evidence / Measured / Method / Output state instead of superseded summary prose.

Freeze requires Runtime contracts, Synthesis convergence render, and Synthesis UI Validation to pass on this exact checkpoint SHA, followed by artifact/pixel and PR-residue inspection.

This marker does not authorize merge or deployment.
