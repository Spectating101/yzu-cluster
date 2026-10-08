# Request delivery UI acceptance — 2026-10-08

Private branch: `codex/request-delivery-ui-20261008`, based on `e5f196cc` (`codex/procurement-completion-ui-20261006`).
No public release was changed. Integrate with Claude's current work before promotion.

Changes:

- Passive Home Pick Up hydration retains the Home conversation. Explicit attention selection retains its separate context.
- The collection review renders each provider's series, dates, countries and frequency instead of object coercion.
- Saved CSV links become native downloads. Only the expected local dataset download route is made clickable by this formatter.
- Answer cards wrap long identities and source URLs inside the rail.
- Ask approvals activate the existing collection progress watcher.

Verification:

- `npm run test:candidate-key`: 577 passed; pretest Ask context checks: 4 passed.
- Targeted context/review/download checks: 8 passed.
- `npm run build`: passed; existing large bundle warning remains.
- Real browser on isolated localhost :8794: request, preview, review, approval, Library, saved-file link and repeated acquisition.
- Read screenshots: 1440×900 review and completion; 390×844 review. Narrow dialog wraps and scrolls vertically. Whole-product mobile usability was not certified.
- Project frontend gate: `ok=true`, recorded under `request-delivery-20261008`.

Screenshots:
`~/.config/yzu-host-acceptance/evidence/fe_loop_request-delivery-20261008/`

Backend counterpart: `codex/request-delivery-20261008`; detailed acceptance and CSV are in its `docs/ops/REQUEST_DELIVERY_ACCEPTANCE_20261008.md`.
