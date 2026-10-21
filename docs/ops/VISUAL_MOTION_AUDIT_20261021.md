# Visual and interaction audit — 2026-10-21

## Candidate and scope

Base: `claude/preview-ui-20261015` at `2f45431c89eacd4ec19eec67da9a4927aa0d5d47`.
Changes are isolated on `codex/visual-motion-audit-20261021`. Existing composition,
colour palette, information hierarchy and desktop density are preserved.

The final audit uses headless Chromium. Home, Library, Discover, Synthesis,
Resources, Profile and Settings were captured at **1440×900, 1280×800 and
390×844**. Geometry checks were followed by screenshot inspection; absence of
page overflow alone did not catch the squeezed Resources cards.

The built candidate was served on loopback through the repository's read-only
candidate proxy, backed by the existing pilot member and real held data. This
checks member rendering and inspection, not a new browser sign-in. Writes,
collection execution and model requests were blocked. Public signup, sign-in
and recovery screens were separately captured from the existing rc3 release;
no form was submitted and no account was created.

## Findings resolved

- **Narrow data viewer:** the wide three-column rule overrode its responsive
  rule, leaving the viewer only 16px wide at 390px. Move the base rule ahead of
  the breakpoint; wrap toolbar controls and reserve space above mobile navigation.
- **Download menu:** its fixed 360px width extended beyond the phone viewport.
  Bound the width and keep it in the narrow inspector's scroll flow.
- **Resources:** three desktop cards squeezed request labels and values together
  on phones. Stack those cards below 680px; preserve the desktop grid.
- **Rail preference:** a saved desktop fold could remove the mobile context
  sheet. Retain that preference for desktop while using the compact sheet on
  mobile; hide the desktop chevron there.
- **Covered controls and focus:** centre-only inspectors incorrectly advertised
  application-wide modality and left covered controls keyboard-accessible.
  Make covered centre siblings inert, restore their previous states on close,
  and retain working navigation/Detail/Ask. Restore data-view opener focus.
- **Preview shortcuts:** scope optional previous/next arrow shortcuts to the
  viewer and exclude editable fields, so they cannot swallow rail/editor keys.
- **Snippet tabs:** add roving focus, Arrow/Home/End navigation and associated
  tab/panel IDs. Reset copied feedback when changing tools; Escape returns to
  the menu opener without dismissing the inspector.
- **Loading honesty:** reserve sample space while loading instead of also
  claiming there is no table structure or only documented structure.
- **Row-count honesty:** use the existing shared count resolver. The real GDP
  viewer now identifies its 5,000-row query limit against 13,979 total rows,
  rather than implying it contains the whole file.
- **Motion and focus polish:** use existing 150ms opacity-only entrance tokens
  for inspection layers and the download panel, without moving tables or the
  rail. Disable these animations with reduced motion. Restore visible 2px
  keyboard outlines on preview close/adjacent controls.

## Evidence and verification

- **20 focused headless browser tests passed:** all destination mounts, existing
  Ask activity/motion behavior, export/snippet behavior and seven inspection
  regressions. The menu/reduced-motion and Resources checks were rechecked after
  the final adjustments.
- **21 unit tests passed:** table operations, shared count/coverage resolution
  and Library selection.
- Production build passed in the isolated, non-serving worktree.
- Real-data capture: **21 page/viewport checks**, desktop and phone GDP data
  viewers, phone download-menu keyboard operation and populated GDP Discover.
  No uncaught UI errors in the real-data contexts.
- Public account-screen captures passed on desktop/phone without submitting.
- `git diff --check` passed.

Commands:

```sh
rtk proxy env YZU_DESK_URL=http://127.0.0.1:5191 npx playwright test \
  e2e/visual-inspection-polish.spec.js e2e/app-mounts.spec.js \
  e2e/decoration-layer.spec.js e2e/library-use-dataset.spec.js --workers=1
rtk proxy node --test drive/src/v2/dataTable.test.js \
  drive/src/v2/libraryGlance.test.js drive/src/v2/librarySelection.test.js
rtk proxy npm run build
rtk proxy git diff --check
```

Screenshots and the real-data JSON receipt are local ignored artifacts under
`artifacts/visual-audit-20261021/headless/`. They are deliberately not included
in this public repository. Fixture tests substitute API responses and are not
proof of delivery, account authentication or collection execution. Existing
fixtures also log refused requests to an unmocked `/library/seed` endpoint;
the destination mount checks still detect uncaught page exceptions.

## Release boundary and remaining limits

This is a visual/interaction candidate, not a public promotion. The running
rc3 release and Claude's branch are unchanged. No backend, credentials, account
records or datasets were changed. The temporary audit proxy is shut down after
verification.

This pass does not certify every dataset, operator workflow or account lifecycle.
Public email delivery, real external MCP consent, expensive queries and recovery
operations need their own operational evidence. Existing large-bundle build
warnings remain; no new dependency or ranking/model call was added. Slow initial
metadata reads can still briefly show a dataset handle before its title arrives.
