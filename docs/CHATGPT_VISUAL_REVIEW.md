# ChatGPT visual review workflow

Use this when you want **pixel-level** critique of Research Drive v2 — not just source review.

## Two layers

| Layer | Tool | What it judges |
|-------|------|----------------|
| **Implementation** | GitHub connector on `Spectating101/yzu-cluster` | Structure, copy, component wiring, canon alignment |
| **Experience** | Screenshot zip upload | Hierarchy, spacing, CTA dominance, mobile, “premium vs repo page” |

GitHub alone cannot answer whether the hero hooks or the rail feels cramped.

## Generate screenshots

**Prerequisite:** desk UI reachable (usually `http://127.0.0.1:5178`).

From this repo (or Sharpe-Renaissance after sync):

```bash
bash scripts/capture_desk_screenshots.sh
```

Outputs:

- `docs/screenshots-review/*.png` — desktop (1440×900), tablet (900×1200), mobile (390×1200)
- `docs/screenshots-review/manifest.json` — URLs, routes, git head, timestamp
- `research-drive-screenshots.zip` — **upload this to ChatGPT**

### Routes captured

| Slug | Purpose |
|------|---------|
| `home` | Attention / continue surface |
| `library` | Vault catalog root |
| `library-connections-queue` | Apps & connections → `collection_queue_status` |
| `discover` | External acquisition funnel |
| `resources` | Spend / capacity ledger |

## New ChatGPT chat prompt (paste)

```text
Review Research Drive v2 (YZU procurement desk) — visual + product critique.

Repo (code): Spectating101/yzu-cluster
Product: lab research data desk — Library, Discover, Resources, Detail|Ask rail.
Not SolarPunk, not trading alpha.

Attached: research-drive-screenshots.zip (desktop/tablet/mobile, multiple routes).

Judge:
1. Above-the-fold hook on Home and Library
2. Rail readability and CTA placement (Detail | Ask)
3. Discover empty vs results state
4. Resources ledger density (Grafana-style, not marketing cards)
5. Mobile breakage
6. Does it feel like a serious faculty desk vs a student repo?

Reference docs in repo: docs/RESEARCH_DRIVE_UI_CANON.md
```

## Static GitHub Pages vs full desk

| URL | API | Chat |
|-----|-----|------|
| https://spectating101.github.io/yzu-cluster/ | Demo seed only | No |
| Local `:5178` + `:8765` | Live registry | Yes |

Capture screenshots against **local full desk** when reviewing live data density; use Pages for cold-share static shell only.

## Refresh after Codex UI passes

```bash
# In Sharpe-Renaissance monorepo
bash scripts/sync_yzu_cluster_github.sh
cd ../yzu-cluster
git add -A && git commit -m "sync: Research Drive UI from monorepo"
git push origin main
bash scripts/capture_desk_screenshots.sh   # with desk running
```

Re-upload zip to ChatGPT.
