# Agent notes — yzu-cluster (Research Drive desk UI)

Read [`docs/RESEARCH_DRIVE_UI.md`](docs/RESEARCH_DRIVE_UI.md) first. It is the only UI
authority: where the code and desks are, how to work, each page's job and current
state, what has been rejected, and what is still open. Everything in
`docs/archive/` is history.

This repository is the **frontend**. The backend, its HTTP API and the dataset
registry live in `Spectating101/research-drive-private`.

## Branches

The current UI line is `claude/center-column-20261021` (local worktree
`Molina-Optiplex/research-drive-ui-current`). `main` is far behind and is not what
any desk serves. Check what a desk serves with `./scripts/desk status` in
`Molina-Optiplex`.

## If you are a hosted agent without the desk

You have the repo only: no desk API, no session token, no datasets. The unit suite
(`node --test drive/src/v2/*.test.js`) is your feedback loop; Playwright specs that
talk to the desk are host-only. Do not report UI behaviour as verified when only
the unit suite ran.

## Rules

1. Never push to `main`, never force-push, never run a release or promote script.
2. Commit only files you changed; checkouts can carry unrelated dirty files.
3. `dist/` and `releases/` are build output — never commit them.
4. Follow the existing test style in a file.
