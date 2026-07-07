# ChatGPT review packet — Research Drive v2 (Discover complete)

**Generated:** 2026-07-06T07:27Z · Live desk `:5178` + API `:8765` · 128 datasets

## Upload to ChatGPT

**Upload this file only** (screenshots + markdown evidence):

```text
/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/research-drive-chatgpt-packet.zip
```

**Verify before upload** (must PASS):

```bash
node scripts/verify_chatgpt_packet.mjs
```

Expected: **~6.3 MB**, SHA256 `70b7733fb586d59e30c6b22ac48b32cd7bfa60ea1a8be6fad2b893d99879eb35`, `manifest.acquire_query` = `MOPS director pledge raw filings Taiwan`, `captured_at` = `2026-07-06T07:27:30.545Z`.

## What to ask ChatGPT

```text
Review Research Drive v2 — YZU faculty procurement desk.

Product model:
  Home = command surface
  Library = lab vault (128 datasets)
  Discover = acquisition ladder (registry → unified → web → probe → collect → Library)
  Resources = operational safety ledger
  Right rail = Detail | Ask

Attached:
  - research-drive-chatgpt-packet.zip (54 PNGs + markdown; desktop-discover-acquire/probe/ask = external acquisition ladder)
  - professor_demo_report.md (9/9 live e2e scenarios PASS, 2026-07-06)
  - DISCOVER_ACQUISITION.md semantics

Acquisition query in manifest: "MOPS director pledge raw filings Taiwan" (local MOPS hits + open-web candidates with URLs).

Judge:
1. Is Discover a credible procurement entry (not a stub)?
2. Probe → Add to lab → Ask flow — clear for a professor?
3. TWSE (in-lab) vs MOPS (acquire) — both handled?
4. Visual hierarchy vs “student repo” feel
5. Resources ledger as ops panel, not marketing

Reference canon: docs/RESEARCH_DRIVE_UI_CANON.md (yzu-cluster repo)
```

## Key screenshots (desktop)

| File | Shows |
|------|--------|
| `desktop-discover-acquire-viewport.png` | External open-web candidate selected (not In lab); Probe source visible |
| `desktop-discover-probe-viewport.png` | Probe result + connector summary in rail |
| `desktop-discover-ask-viewport.png` | Add to lab → Ask with structured JSON prompt |
| `desktop-discover-search-viewport.png` | TWSE — mostly in-lab hits |
| `desktop-resources-viewport.png` | Safety ledger |

## Live evidence summary

- Professor demo e2e: **9/9 PASS** (`npm run test:professor-demo`)
- Discover e2e: **9/9 PASS** (`e2e/v2-discover.spec.js`)
- API routes live: `/library/discover/web`, `/probe`, `/collect`

## Refresh commands

```bash
bash scripts/run_yzu_cluster.sh    # if stack down
npm run desk:capture:live
npm run test:professor-demo
npm run sync:yzu-cluster             # push to Spectating101/yzu-cluster
```
