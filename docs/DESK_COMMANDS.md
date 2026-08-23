# Desk commands — deployed desk vs development desk

Research Drive has two valid runtime shapes. They prove different things and
must not be conflated.

| Surface | Address shape | Use it for | It does **not** prove |
|---|---|---|---|
| **Deployed front door** | one same-origin address, currently `http://100.127.141.44:8765` | real session bootstrap, real registry data, all faculty routes, and release visual review | Vite development behavior or fixture parity |
| **Development desk** | API `:8765` + Vite UI `:5178` / `:5179` | implementation work and fixture-driven e2e | what a researcher sees from the deployed static release |

The front door resolves its static release at service start. A promoted static
directory is not visible until the front-door service restarts. Its browser
session is same-origin and HttpOnly; do not test it by pointing a separate
Vite host at the API and calling the result a deployed-session check.

## Deployed front-door acceptance

Use this after a promotion or whenever judging the desk a researcher can
actually use. It bootstraps the normal browser session, performs only read-only
API/page interactions, captures all faculty pages at the stable 1440×900 design
ruler and the measured 1920×961 Chrome content viewport, checks 1280×800 and
390×844 containment, and writes screenshots to a temporary directory. The
1920×961 size is the current workstation observation at 100% zoom; 1440×900
remains a comparison fixture, not a command to resize the user's browser.

```bash
YZU_DESK_URL=http://100.127.141.44:8765 npm run desk:audit:deployed
```

The audit intentionally does not create an Ask turn, synthesis thread,
collection intent, approval, or job. A successful API curl alone is not a UI
acceptance result: the audit must also report no access gate, no page errors,
and no horizontal overflow.

## Development desk

Screenshots and beta e2e tests require a live API — UI-only `npm run dev`
falls back to demo seed.

### Sharpe-Renaissance (monorepo — canonical)

Start everything (loads `CURSOR_API_KEY` from `.env.local`):

```bash
bash scripts/run_yzu_cluster.sh
# or
npm run desk:start
```

Verify + capture + test:

```bash
npm run desk:integration          # Python: env, API, registry, profile, UI proxy
npm run desk:capture:live         # screenshots; fails unless Live registry
npm run test:beta-workflow        # 7 live Playwright scenarios
```

### yzu-cluster (public UI repo)

This repo ships the faculty UI and e2e specs. It does **not** include the Python query engine or `run_yzu_cluster.sh`.

**Before capture or beta tests**, start the API from Sharpe-Renaissance in another terminal:

```bash
cd ../Molina-Optiplex/Sharpe-Renaissance
bash scripts/run_yzu_cluster.sh
```

Then in `yzu-cluster`:

```bash
npm run dev                       # UI on :5178 (proxies /api → :8765)
npm run desk:integration          # Node: API + UI proxy health
npm run desk:capture:live         # YZU_REQUIRE_LIVE=1 screenshots
npm run test:beta-workflow        # requires API on :8765
```

| Script | Public repo | Monorepo only |
|--------|-------------|---------------|
| `desk:start` | — | `bash scripts/run_yzu_cluster.sh` |
| `desk:integration` | `node scripts/desk_verify_live.mjs` | `python3 scripts/ops/desk_integration_check.py` |
| `desk:capture` / `desk:capture:live` | `bash scripts/capture_desk_screenshots.sh` | `bash scripts/yzu_cluster_github/capture_desk_screenshots.sh` |
| `test:beta-workflow` | yes (live API required) | yes |
| `sync:yzu-cluster` | — | publish UI → public repo |

## Development capture gate

```bash
YZU_REQUIRE_LIVE=1 bash scripts/capture_desk_screenshots.sh
```

Checks the development API on `:8765`, waits for **Live registry** in the
Vite-hosted UI, then captures 36 PNGs. This is useful implementation evidence,
but it is not a replacement for `desk:audit:deployed`: the latter is the
same-origin deployed-session check.
