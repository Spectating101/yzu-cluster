# Research Drive layout geometry contract

This document defines the runtime geometry invariants that protect the release shell from viewport clipping, nested full-page scrolling, and fixed-chrome collisions.

## Authority model

Research Drive is a fixed application shell, not a document-scrolling website.

1. `.rd-v2-shell` owns the browser viewport.
2. `main.yzu-main` is contained by that shell and must not make the document scroll.
3. A normal `PageShell` uses `.rd-v2-body-scroll` as its primary vertical scroll authority.
4. A page root (`.rd-v2-page` and page-specific root classes) must not independently claim `overflow-y: auto|scroll|overlay` above an active `.rd-v2-body-scroll`.
5. Nested workbench/list panes may scroll when their interaction model requires it, but they must not become a second page-sized scroll authority around the primary body scroller.
6. On mobile, the bottom navigation and Detail/Ask inspector are fixed chrome. The primary page scroller must end above that chrome; content may not rely on being visible underneath it.
7. The document and body must remain viewport-sized. Horizontal document overflow is always a release failure.
8. Reaching `scrollTop == scrollHeight - clientHeight` must expose the final in-flow content inside the scroller. Presence in the DOM is not sufficient.

## Certified viewport matrix

The release geometry gate covers every major surface (Home, Library, Discover, Synthesis, Resources, Profile, Settings) at:

- 360×640 — short phone stress case
- 390×844 — canonical phone capture
- 768×1024 — breakpoint-adjacent tablet portrait
- 1024×768 — short tablet / compact laptop landscape
- 1366×768 — common short laptop
- 1920×1080 — wide desktop

The existing release-visual suite separately preserves the canonical 1440×900 visual reference.

## What the gate rejects

`e2e/layout-geometry-contract.spec.js` fails when it observes any of these conditions:

- document/body horizontal overflow;
- document/body becoming a second vertical page around the application shell;
- shell or main escaping the viewport;
- fixed mobile chrome escaping the viewport;
- a primary `.rd-v2-body-scroll` with another overflow-scrolling ancestor before `main`;
- a scrollable body that is not actually configured as a scroll container;
- inability to reach the primary scroller's true end;
- final in-flow content remaining below the scroller after scrolling to the end;
- mobile primary content extending underneath fixed navigation/inspector chrome.

Every surface/viewport step attaches JSON geometry diagnostics. A failing run also captures the failing viewport screenshot. CI retains those artifacts for review.

## Change rule

Do not fix a geometry failure by adding another broad `!important`, page-wide `overflow`, or viewport-height override without first identifying the current authority chain.

When changing shell, breakpoint, page-root, rail, or body-scroll CSS:

1. identify the intended scroll owner;
2. remove competing ownership rather than masking it;
3. keep fixed chrome outside the content geometry;
4. run the layout geometry gate;
5. inspect the corresponding release visual when the change affects hierarchy or density.

A page-specific nested scroller that is genuinely required should be documented here with its selector and interaction reason before weakening the generic gate.
