# Research Drive — desk UI

The frontend of Research Drive, the YZU research-evidence procurement and Library
workbench. The backend, its HTTP API and the dataset registry live in
`Spectating101/research-drive-private`.

Read [`docs/RESEARCH_DRIVE_UI.md`](docs/RESEARCH_DRIVE_UI.md) before any UI work. It is
the only UI authority: where the code and desks are, how to work, each page's job,
what has been rejected and what is still open.

## Layout

| Path | What |
|---|---|
| `drive/src/v2/` | The app: `main.jsx` entry, `App.jsx` shell, one `*Page.jsx` per destination, pure helpers with `*.test.js` beside them |
| `drive/src/v2/styles/01..11-*.css` | Stylesheets, imported in order from `main.jsx` |
| `drive/config/` | Demo catalogue, desk source list and Synthesis profiles bundled into the app |
| `e2e/` | Playwright specs; `e2e/fixtures/v2MockApi.js` is the mocked desk API |
| `scripts/` | Desk audits, the candidate proxy, the release gate and the CSS tools (`css-who`, `css-snap`, …) |
| `public/` | Static pages served beside the app (storage notice and privacy) |
| `docs/` | The UI authority, the layout-geometry contract, the pilot protocol, findings; `docs/archive/` is history |

## Run

```bash
npm ci
npm run dev            # Vite on 127.0.0.1:5178, API proxied to YZU_API_URL (default 127.0.0.1:8765)
```

## Check

```bash
npm test               # unit tests (node --test)
npm run test:mount     # every destination mounts without an uncaught error
npm run test:e2e       # full Playwright suite against the mocked API
npm run check:names    # undefined JSX/JS identifiers (vite does not catch these)
npm run check:layout   # stylesheet order and page-scroll rules
npm run test:python    # candidate proxy refuses writes by default
```

`repo-check` runs the same gate from `.local-check` (`--tier fast` or `full`).
Generated screenshots and reports go to `artifacts/`, which is not tracked.

## Deploy

Desks are built from commits with the desk CLI in `Molina-Optiplex`:

```bash
./scripts/desk status
./scripts/desk build --ui <sha8> --backend <sha8> --for candidate-memory-next
./scripts/desk deploy candidate-memory-next <release> --yes
```

8775 is the preview desk. rc3 (8774) changes only when the owner says "promote".
