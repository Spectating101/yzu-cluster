# Research Drive — screenshot review set

Live captures for **ChatGPT visual review** and advisor walkthroughs.

## Desktop set (start here)

| File | What it shows |
|------|----------------|
| [desktop-home-viewport.png](desktop-home-viewport.png) | Home command surface |
| [desktop-library-viewport.png](desktop-library-viewport.png) | Library vault root |
| [desktop-library-connections-queue-viewport.png](desktop-library-connections-queue-viewport.png) | Collection queue dataset |
| [desktop-discover-viewport.png](desktop-discover-viewport.png) | Discover empty / suggestions |
| [desktop-discover-search-viewport.png](desktop-discover-search-viewport.png) | TWSE search (in-lab hits) |
| [desktop-discover-acquire-viewport.png](desktop-discover-acquire-viewport.png) | MOPS candidate + acquisition rail |
| [desktop-discover-probe-viewport.png](desktop-discover-probe-viewport.png) | Probe result (connector spec) |
| [desktop-discover-ask-viewport.png](desktop-discover-ask-viewport.png) | Add to lab → Ask with structured prompt |
| [desktop-resources-viewport.png](desktop-resources-viewport.png) | Operational safety ledger |

Full-page variants: `*-full.png`. Tablet/mobile: `tablet-*`, `mobile-*`.

Metadata: [manifest.json](manifest.json).

## Refresh

```bash
# Development evidence: API :8765 + Vite UI :5178 must be running
npm run desk:capture:live

# Deployed same-origin acceptance: creates a temporary review set
YZU_DESK_URL=http://100.127.141.44:8765 npm run desk:audit:deployed
```

Zip for upload: `research-drive-screenshots.zip` at repo root.

The committed set is development-capture evidence unless its manifest says it
was produced by the deployed audit. Do not infer a deployed researcher session
from a Vite capture.

See [docs/CHATGPT_VISUAL_REVIEW.md](../CHATGPT_VISUAL_REVIEW.md) and [docs/DISCOVER_ACQUISITION.md](../DISCOVER_ACQUISITION.md).
