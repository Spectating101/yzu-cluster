# Professor demo script — Research Drive v2

Use this narrative for live demos, advisor walkthroughs, and **ChatGPT product review** (with screenshots in `docs/screenshots-review/` and evidence from `npm run test:professor-demo`).

## Story (7 beats)

| # | Beat | Where | Professor sees |
|---|------|-------|----------------|
| 1 | **Orient** | Home | Command surface, attention queue, pending approvals count |
| 2 | **What we have** | Library | Vault folders, query-ready datasets, preview rows |
| 3 | **What we need** | Discover | Search `TWSE` (vaulted) or `MOPS` (acquire); pipeline Search→Register |
| 4 | **Assess candidate** | Discover rail | Fit · Access · Probe · Destination; **Probe source** → **Add to lab** |
| 5 | **Safety check** | Resources | Ask usage, Collection workers, Lab vault, Desk connection |
| 6 | **Approve if needed** | Resources rail | Pending job → Approve (dry-run protected) |
| 7 | **Verify reuse** | Discover / Library | **In lab** filter or Library folder — registered dataset findable |

## Automated run

**Monorepo (full stack):**

```bash
bash scripts/run_yzu_cluster.sh
npm run test:professor-demo
```

**Public UI repo** (API must run from Sharpe-Renaissance):

```bash
npm run test:professor-demo
```

Outputs:

- `docs/status/generated/professor_demo_report.json` — machine evidence
- `docs/status/generated/professor_demo_report.md` — paste into ChatGPT

Synced to public `yzu-cluster` on `npm run sync:yzu-cluster` (monorepo).

## ChatGPT packet

1. Zip: `research-drive-screenshots.zip` (live capture: `npm run desk:capture:live`)
2. Markdown: `docs/status/generated/professor_demo_report.md`
3. Ladder doc: `docs/DISCOVER_ACQUISITION.md`
4. Prompt:

```text
Review Research Drive v2 professor procurement demo.

Product model:
  Home = command surface
  Library = lab vault
  Discover = acquisition pipeline
  Resources = operational safety ledger
  Right rail = Detail | Ask

Evidence attached: live screenshots + professor_demo_report.md + DISCOVER_ACQUISITION.md.
Screenshots include discover-acquire, discover-probe, discover-ask (MOPS acquisition path).
Judge workflow credibility: missing data search → Library → Discover probe → Resources → procurement queue → registered result findable.
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `YZU_API_URL` | `http://127.0.0.1:8765` | Live registry API |
| `YZU_DESK_URL` | `http://127.0.0.1:5178` | Vite UI |
| `DESK_TEST_EMAIL` | `drkong@saturn.yzu.edu.tw` | Faculty profile |
| `DEMO_SEARCH_QUERY` | `TWSE` | Discover search |
| `DEMO_KNOWN_DATASET` | `gdelt_asia_daily_country_panel` | Library preview target |
