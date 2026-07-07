# Discover — acquisition ladder (live desk)

Discover is the **procurement entry point**: find external datasets, assess fit, probe sources, queue collection, then verify in Library.

**Requires:** query engine `:8765` + Vite UI `:5178` (not GitHub Pages demo).

## Ladder (what runs in production)

```
1. Registry search     GET /library/discover?q=…
2. Unified catalogs    GET /library/search?q=…     (DataCite, HuggingFace, scrape when index miss)
3. Open web            GET /library/discover/web?q=… (Tavily + fallbacks)
4. Probe source        POST /library/discover/probe  { url, name }
5. Collect / Ask       POST /library/discover/collect { connector_id }
                       or Ask rail with structured JSON plan
6. Library             vaulted dataset findable under lab folders
```

## Professor walkthrough (≈3 min)

| Step | Action | Screenshot |
|------|--------|------------|
| 1 | Header search **MOPS** → Discover tab | `desktop-discover-acquire-viewport.png` |
| 2 | Select external candidate (not **In lab**) | Rail shows Fit · Access · Probe · Destination |
| 3 | **Probe source** | `desktop-discover-probe-viewport.png` — connector, access mode, file count |
| 4 | **Add to lab** | Queues collection job (if probed) or structured Ask | `desktop-discover-ask-viewport.png` |
| 5 | Resources → Active jobs | Pending approval if policy requires |
| 6 | Library | Dataset appears after collect completes |

**TWSE** search is useful to show **already vaulted** hits: primary CTA becomes **Open in Library** and the **All matches already in lab** banner may appear.

## Live API smoke tests

```bash
# Registry
curl -s "http://127.0.0.1:8765/library/discover?q=MOPS&limit=5&email=drkong@saturn.yzu.edu.tw" | jq '.total'

# Open web (tavily=0 uses offline fallbacks in dev)
curl -s "http://127.0.0.1:8765/library/discover/web?q=ethereum%20stablecoin&limit=3" | jq '.total'

# Probe
curl -s -X POST "http://127.0.0.1:8765/library/discover/probe" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.example.com","name":"Example"}' | jq '.summary'
```

## ChatGPT review packet

Attach together:

1. `research-drive-screenshots.zip` — refresh with `npm run desk:capture:live`
2. `docs/status/generated/professor_demo_report.md` — `npm run test:professor-demo`
3. This file for ladder semantics

**Prompt snippet:**

```text
Review Discover acquisition ladder on Research Drive v2.
Screenshots: discover-acquire, discover-probe, discover-ask (desktop viewport set).
Judge: Is Search → Probe → Collect → Library credible for a faculty procurement desk?
Compare TWSE (in-lab) vs MOPS (acquire) flows.
```

## Automated evidence

```bash
bash scripts/run_yzu_cluster.sh          # or ensure :8765 + :5178 up
npm run desk:capture:live
npm run test:professor-demo
```

E2E: `e2e/v2-discover.spec.js` (mocked), `e2e/professor-demo.spec.js` (live API).
