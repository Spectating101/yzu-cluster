# Agent notes — yzu-cluster (Research Drive desk UI)

This repository is the **frontend** of the Research Drive desk. The backend,
its HTTP API and the dataset registry live in a different repository,
`Spectating101/research-drive-private`. Do not look for server code here.

## You are probably in a cloud container

If you are Codex (or any hosted agent), you have the repo and nothing else. You
do **not** have the running desk API (`:8765`), a desk session token, or any
dataset. That means:

- The unit suite runs fine and is your real feedback loop.
- Playwright specs that talk to the desk **cannot run here**. Session bootstrap
  is bound to the browser's host, so even a local dev server cannot
  authenticate; `scripts/serve_candidate.py` exists on the host for exactly
  this reason.

Do not report UI behaviour as verified when only the unit suite ran.

## Which branch is real

`main` is **not** what runs. As of 2026-08-25 its newest commit is from
2026-08-13 and it is 108 commits behind the deployed UI.

| Branch | What it is |
|---|---|
| `live/deployed-ui-20260825` | The UI actually being served (`01fe463a`). Base new work here. |
| `work/discover-web-context-20260825` | The above plus in-flight Discover fixes (web context + research-brief keywords). |
| `main` | 108 commits stale. |

## Setup and tests

```bash
npm ci
npm run test:candidate-key    # node --test, expect 483 passing, ~1s
```

`pretest` prints the tree role and is harmless in a fresh clone (it will say
`UNLABELLED`). Playwright targets (`test:e2e`, `test:freeze`,
`test:lifecycle-states`, …) need a served build plus the live desk and are
host-only.

## Where the code is

- `drive/src/v2/` — the entire current desk UI. `BrowsePage.jsx` is Discover,
  `SynthesisPage.jsx` is Synthesis, `App.jsx` holds boot order and nav.
- `drive/src/v2/*.test.js` — colocated unit tests; add yours beside the module.
- `e2e/` — Playwright specs, host-only.
- `dist/`, `releases/` — build output. **Never commit these.**

## Rules

1. **Never push to `main`**, never force-push. Open a PR.
2. Never run a release or promote script.
3. Commit only files you changed. These checkouts routinely carry unrelated
   dirty files from other agents and machine processes.
4. Follow the existing test style in a file (most use `describe`/`it` from
   `node:test`, not a bare `test()`).

## Traps this codebase has actually hit

- **A build is not inert on the host.** The live front door serves a specific
  checkout's `dist/` directly, so building in that tree is effectively a
  deploy. Harmless in a container; never assume it elsewhere.
- **Grepping the bundle does not prove the app runs.** Vite compiles an
  undefined identifier inside JSX without complaint, so a blank page passes
  every string check. `e2e/app-mounts.spec.js` loads all destinations and fails
  on any uncaught error — that is the real check.
- **Many sibling checkouts exist and some sit on the deployed SHA**, which makes
  a stale tree look canonical. `scripts/desk-baseline.sh` is the authority, not
  a tree's own label.
- **Desktop-only.** Mobile layout is not a target; spend the effort on desktop
  density instead.
- **Parity drift is the dominant defect class.** The same rule is often
  implemented in both the UI and the backend and the copies disagree. When you
  change a classification or a filter, check whether the server does it too.
