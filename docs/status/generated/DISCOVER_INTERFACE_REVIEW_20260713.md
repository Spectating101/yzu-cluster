# Discover Interface Review — 2026-07-13

## Current public state

PR #30 now includes a first acquisition-engineering correction for Discover's second workspace.

Implemented:

- acquisition-plan framing around source, access, scope, refresh design, and Library outcome;
- explicit separation of registered, archived-but-unregistered, completed-but-unregistered, failed, active, and unknown states;
- archive evidence can no longer be presented as registry evidence;
- selected-route detail explains the acquisition decision before operational evidence;
- responsive visual styling;
- Playwright state-honesty tests;
- CI-published overview and selected-route screenshots.

## Pixel judgement

The rendered overview is visually coherent and premium enough for the current shell. It no longer resembles connector administration.

However, it is not the final Discover moat surface yet:

1. The visible tab still says `Collection routes`, which preserves an operations-first category read.
2. Four summary counters dominate the upper canvas and retain a dashboard silhouette.
3. The route list begins only after a job exists; the researcher still cannot compare several candidate acquisition routes before submission.
4. The selected route expands inline and pushes the most important source/access/refresh facts below the initial viewport.
5. Small route metadata is visually underweighted.

## Next interface contract

The final second mode should be `Acquisition plan` and begin before execution:

`research need -> lab gap -> candidate routes -> comparison -> selected route -> exact acquisition design -> approval -> execution history -> registered Library asset`

Candidate comparison should expose:

- source and canonical identity;
- coverage and grain;
- access and license;
- expected cost/quota;
- history and rate limits;
- filtering/entity-resolution requirements;
- refresh strategy;
- uncertainty/failure risk;
- Library destination.

The current collection-job groups should remain, but as execution history beneath an approved plan rather than the primary product object.
