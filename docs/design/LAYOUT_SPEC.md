# Research Drive v2 — adaptive layout spec

**Viewport matrix:** 1440×900 remains the stable design ruler; the measured workstation Chrome content viewport is 1920×961 at 100% zoom. Production sizing is adaptive, so neither is permission to skip the 1280, tablet, and mobile checks.
**Navigation amendment (2026-08-20):** Cluster is not a faculty destination. References to the backend worker cluster do not authorize a Cluster page; [`UI_PRODUCT_AUTHORITY.md`](../UI_PRODUCT_AUTHORITY.md) owns the seven current destinations.
**Canon:** [`RESEARCH_DRIVE_UI_CANON.md`](../RESEARCH_DRIVE_UI_CANON.md)  
**Frozen wireframes:** [`WIREFRAME_V2_FROZEN.md`](WIREFRAME_V2_FROZEN.md)  
**Visual tokens:** [`TOKENS.md`](TOKENS.md)  
**Interactive ruler:** open [`references/layout-ruler.html`](references/layout-ruler.html) at **100% zoom** (browser width ≥ 1440px).

Legacy `src/styles.css` uses 240px sidebar / 332–430px rail / 64px header. V2 now uses a bounded proportion contract instead of a single hardcoded split.

---

## Shell grid (all pages)

The right rail remains the anchor. The sidebar and rail use bounded `clamp()` tokens, while the main work surface receives the remaining width and must not overflow.

| Zone | CSS variable | Size | Position |
|------|--------------|------|----------|
| **A** Header | `--rd-header` | **64px high** | `grid-row: 1; grid-column: 1 / -1` |
| **B** Sidebar | `--rd-sidebar` | `clamp(216px, 16.5vw, 252px)` desktop | col 1, row 2 |
| **C** Main | flex remainder | no horizontal overflow | col 2, row 2 |
| **D** Rail | `--rd-rail` | `clamp(380px, 29vw, 470px)` desktop | col 3, row 2 |

At the 1440×900 reference viewport, the current CSS resolves to roughly:

```text
1440 total width
├─ 238  sidebar (B)
├─ 784  main (C)
└─ 418  rail (D)

900 total height
├─ 64   header (A)
└─ 836  body row
```

At the measured 1920×961 Chrome content viewport the same rules resolve to:

```text
1920 total width
├─ 252  sidebar (B)
├─ 1198 main (C)
└─ 470  rail (D)

961 total height
├─ 64   header (A)
└─ 897  body row
```

```css
.rd-shell {
  display: grid;
  width: 100%;
  height: 100vh;
  grid-template-columns: var(--rd-sidebar) minmax(0, 1fr) var(--rd-rail);
  grid-template-rows: var(--rd-header) minmax(0, 1fr);
}
```

---

## Zone A — Header (64px at full desktop)

| Element | x | y | w | h | Notes |
|---------|---|---|---|---|-------|
| Brand block | 18 | 0 | 200 | 64 | logo + title |
| Research context | sidebar edge | 0 | adaptive | 64 | active research and page identity |
| Desk state / account | right edge | 0 | content-adaptive | 64 | live truth, pending work, principal |

Header grid: `sidebar token | active research + page | desk truth + counts | avatar`.

Padding: **0 18px** horizontal.

---

## Zone B — Sidebar

| Element | Size | Notes |
|---------|------|-------|
| Nav item | fills sidebar minus side padding × **36** | radius 18px, padding 0 13px |
| Nav gap | **2px** | between items |
| Side padding | **12px** | left/right |
| Section label | 10px caps, margin-top **18px** |

Seven destinations in total, with Settings last. No Ask or Cluster item.

---

## Zone C — Main (adaptive remainder)

### Shared anatomy

| Block | y offset from body top | h | x pad |
|-------|------------------------|---|-------|
| **PageHeader** | 0 | **72** | 28 |
| **Toolbar** (chips) | 72 | **44** | 28 |
| **Content** | 116 | **728** | 28 |
| Bottom breathing | — | 28px pad bottom | |

PageHeader: title **28px** / 600, subtitle **14px** muted, actions right **32px** buttons.

### Library — column widths (adaptive table inside Zone C)

**Navigation (frozen):** Drive grammar — breadcrumb + folders in list + drill-down. See [`WIREFRAME_V2_FROZEN.md`](WIREFRAME_V2_FROZEN.md). No partition chip row; no Location column duplicating breadcrumb.

Toolbar: `≡ list` · sort `Name ▾` · `Last modified ▾` · `Filter ▾` (readiness: Query-ready, Connected, …).

| Column | width | align |
|--------|-------|-------|
| Name | **minmax(220px, 1.6fr)** | left |
| Ready | **100px** | left |
| Coverage | **140px** | left |
| Source | **100px** | left |
| Updated | **88px** | left |
| Row height | **52px** | icon 32×36 + 2-line name |

Table card: border-radius **18px**, border 1px `#edf1f6`.

### Home — vertical stack

| Section | y | h |
|---------|---|-----|
| PageHeader | 0 | 72 |
| Command band | 72 | content-adaptive |
| Attention rows | after command | compact statement rows |
| Recent section head | after attention | **32** |
| Recent Drive list | after head | 2–5 rows |
| Running strips | after recent | compact status rows |
| Remaining | — | flex whitespace |

## Zone D — Rail

| Block | h | Notes |
|-------|---|-------|
| **RailToggle** | **44** | Detail \| Ask segments |
| **Pane** | **800** | scroll |
| Detail actions | 40 | bottom sticky optional |

Toggle: full width minus **24px** pad (12 each side).

Detail field labels: 10px uppercase mono, 6px letter-spacing.  
Body text: 13px. Title: 17–18px.

---

## Preview modal (overlay — not a sidebar tab)

Triggered from Detail **Preview rows**. Current tab dims behind a centered panel (~720×560) or right drawer (~480px).

| Tab | Content |
|-----|---------|
| Preview | `GET /query/{id}?limit=10` table |
| Schema | grain + columns from registry + observed types |
| Query | SQL editor + Run (expand modal for wide results) |

Shell unchanged: sidebar, header, rail stay. Esc closes. No `view=analyze` route.

---

## Breakpoints (later)

| Width | Behavior |
|-------|----------|
| ≥1181 | Desktop clamps: sidebar 224–280, rail 360–480 |
| 761–1180 | Narrow desktop clamps: sidebar 204–232, rail 320–360 |
| <761 | Sidebar becomes horizontal sticky; rail stacks below main |

Ruler file is **1440 only** — measure at 100% zoom, but do not freeze production code to those exact widths.

---

## Page summary

| Page | C width usage | Table in C? |
|------|---------------|-------------|
| Library | Drive list with folders + datasets | Yes, primary |
| Home | Command band + attention rows + recent Drive list | Partial |
| Discover | Source/status search results and durable History | Yes |
| Resources | Section blocks | No |
| Profile | Sections | No |
| Settings | Forms | No |
| Preview modal | Overlay on Library | Preview table in modal |
