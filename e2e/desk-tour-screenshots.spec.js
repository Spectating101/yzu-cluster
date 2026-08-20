import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// The shipped fixture carries three datasets, which makes Library and Discover
// look emptier than the desk ever is. These rows are the real registry, so the
// tour shows current UI code against the identities it actually serves.
const REGISTRY = "/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance-runtime-integration/drive/config/research_query_registry.json";

const parsed = JSON.parse(readFileSync(REGISTRY, "utf8"));
const rows = Array.isArray(parsed) ? parsed : parsed.datasets || [];
const DATASETS = rows.map((r) => ({
  ...r,
  dataset_id: r.dataset_id,
  name: r.display_name || r.name || r.dataset_id,
  grain: r.grain,
  analysis_readiness: r.analysis_readiness,
  local_root: r.local_root,
  source_system: r.backend,
  source: r.backend,
  join_keys: r.join_keys || [],
  coverage: r.coverage_metadata?.range || r.coverage || "",
  description: r.description || "",
  materialization: r.materialization,
  keywords: r.keywords || [],
}));

// The Library tree is built from partition lanes served by /library/partitions,
// not from /datasets. Without them every holding falls into the "Other holdings"
// catch-all, which makes the shelf taxonomy look like it does not exist.
const PARTITION_CONFIG = "/home/phyrexian/Downloads/llm_automation/project_portfolio/Molina-Optiplex/Sharpe-Renaissance/drive/config/collection_partitions.json";
const partCfg = JSON.parse(readFileSync(PARTITION_CONFIG, "utf8"));
const idsFor = (pid) => rows
  .filter((r) => String(r.collection?.partition_id || r.partition_id || "") === pid)
  .map((r) => r.dataset_id);

const titleCase = (s) => String(s || "other").replace(/[-_.]/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());

const PARTITIONS = (partCfg.partitions || []).map((p, i) => ({
  partition_id: p.id,
  shelf_id: String(p.domain || "other"),
  shelf_label: titleCase(p.domain),
  professor_label: p.title || p.id,
  professor_blurb: p.description || "",
  professor_sort: 100 + i,
  professor_visible: true,
  registry_dataset_ids: idsFor(p.id),
}));

const SHELVES = [...new Set(PARTITIONS.map((l) => l.shelf_id))].map((id, i) => ({
  id, label: titleCase(id), sort: 100 + i,
  partition_ids: PARTITIONS.filter((l) => l.shelf_id === id).map((l) => l.partition_id),
}));

const outDir = "artifacts/desk-tour";
const WIDTHS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "wide", width: 1960, height: 1600 },
  { id: "mobile", width: 390, height: 844 },
];

const PAGES = [
  ["home", "Home"],
  ["library", "Library"],
  ["browse", "Library browse"],
  ["discover", "Discover"],
  ["synthesis", "Synthesis"],
  ["resources", "Resources"],
  ["history", "History"],
  ["profile", "Profile"],
  ["settings", "Settings"],
];

async function resetScroll(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(150);
}

// Discover reads /library/discover, not /datasets, and the shipped fixture stubs
// it empty for every query while the web route returns one fixed DataCite row
// about ocean temperature. Every Discover capture therefore said "your Library
// holds nothing relevant" next to an unrelated external result — both the mock,
// neither the product. The real handler runs gateway.discover_search(q).
const TEXT = (r) => [
  r.dataset_id, r.display_name, r.name, r.title, r.one_line,
  r.description, (r.keywords || []).join(" "), (r.tags || []).join(" "), r.domain,
].filter(Boolean).join(" ").toLowerCase();

const STOP = new Set(["the", "for", "and", "a", "of", "to", "in", "on", "what", "data", "dataset", "use", "i", "can", "my"]);

function searchRegistry(q, limit = 12) {
  const terms = String(q || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  if (!terms.length) return [];
  return rows
    .map((r) => {
      const text = TEXT(r);
      return { row: r, score: terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || String(a.row.dataset_id).localeCompare(String(b.row.dataset_id)))
    .slice(0, limit)
    .map((m) => ({
      ...m.row,
      candidate_key: `dataset:${m.row.dataset_id}`,
      title: m.row.display_name || m.row.name || m.row.dataset_id,
      coverage: m.row.coverage_metadata?.range || "",
    }));
}

async function richMocks(page) {
  await mockV2Api(page);
  // Registered last, so it wins over the fixture's own /datasets route.
  await page.route("**/library/discover?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") || "";
    const hits = searchRegistry(q);
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        query: q,
        sections: hits.length ? [{ id: "registry", title: "Registry", rows: hits }] : [],
        total: hits.length,
      }),
    });
  });
  // Topically bound to the query, so an external offering can never be an
  // unrelated row the reviewer has to discount.
  await page.route("**/library/discover/web*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")
      || new URL(route.request().url()).searchParams.get("query") || "";
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        query: q,
        sections: q ? [{ id: "web_discover", title: "Beyond the Library", rows: [{
          candidate_key: `web:datacite:${q.slice(0, 40)}`,
          title: `${q} — published dataset (DataCite)`,
          source: "DataCite", collect_via: "datacite_doi",
          url: "https://doi.org/10.5061/example",
          grain: "unstated", coverage: "2019–2025",
          description: "Published research dataset — inspect the DOI before deciding how to acquire.",
        }] }] : [],
        total: q ? 1 : 0,
      }),
    });
  });
  // "Search wider" is the deliberate escalation: semantic + live external
  // adapters, which plain Explore never touches. The shipped fixture answers it
  // from the same empty discoverBody as everything else, so the escalation was
  // indistinguishable from not escalating.
  await page.route("**/library/discover/sources?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") || "";
    const wider = q ? [
      { candidate_key: `web:datacite:${q.slice(0, 30)}`,
        title: `${q} — published dataset (DataCite)`, source: "DataCite",
        collect_via: "datacite_doi", url: "https://doi.org/10.5061/example",
        grain: "unstated", coverage: "2019–2025",
        description: "Published research dataset — inspect the DOI before deciding how to acquire." },
      { candidate_key: `web:hf:${q.slice(0, 30)}`,
        title: `${q} — community corpus (Hugging Face)`, source: "Hugging Face",
        collect_via: "huggingface_dataset", url: "https://huggingface.co/datasets/example",
        grain: "unstated", coverage: "2021–2026",
        description: "Community-maintained corpus; provenance is not institutional." },
    ] : [];
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ results: wider, total: wider.length }) });
  });
  await page.route("**/library/partitions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ partitions: PARTITIONS, shelves: SHELVES }) }));
  await page.route("**/datasets**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ datasets: DATASETS, total: DATASETS.length }) }));
}

test.describe("Desk tour", () => {
  for (const [tab, label] of PAGES) {
    for (const vp of WIDTHS) {
      test(`${label} at ${vp.id}`, async ({ page }) => {
        mkdirSync(outDir, { recursive: true });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await richMocks(page);
        await page.goto(`/?tab=${tab}`);
        await waitForShell(page);
        await page.waitForTimeout(700);
        await resetScroll(page);
        await page.screenshot({ path: `${outDir}/${tab}-${vp.id}.png` });

        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${label} overflows horizontally at ${vp.width}px`).toBeLessThanOrEqual(1);
      });
    }
  }

  test("Library shelf opened", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await richMocks(page);
    await page.goto("/?tab=library");
    await waitForShell(page);
    await page.waitForTimeout(700);
    const dir = page.getByTestId("library-directory");
    await dir.getByText("Derived", { exact: true }).first().click();
    await page.waitForTimeout(900);
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/library-shelf-desktop.png` });

    const inner = dir.getByText("Merged research panels (analysis-ready)", { exact: true }).first();
    if (await inner.count()) { await inner.click(); await page.waitForTimeout(900); }
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/library-folder-desktop.png` });

    const row = dir.locator("tr, li, [role=option]").filter({ hasText: /_/ }).first();
    if (await row.count()) { await row.click(); await page.waitForTimeout(700); }
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/library-dataset-desktop.png` });
  });

  test("Library with a dataset selected", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await richMocks(page);
    await page.goto("/?tab=browse");
    await waitForShell(page);
    await page.waitForTimeout(700);
    const row = page.getByTestId("browse-row").first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(600);
    }
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/browse-selected-desktop.png` });
  });

  test("Discover after a research question", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await richMocks(page);
    await page.goto("/?tab=discover");
    await waitForShell(page);
    const box = page.getByRole("textbox").first();
    if (await box.count()) {
      await box.fill("weekly attention signal for stablecoins");
      await box.press("Enter");
      await page.waitForTimeout(1400);
    }
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/discover-searched-desktop.png` });
  });

  test("Discover after searching wider", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await richMocks(page);
    await page.goto("/?tab=discover");
    await waitForShell(page);
    const box = page.getByRole("textbox").first();
    await box.fill("weekly attention signal for stablecoins");
    await box.press("Enter");
    await page.waitForTimeout(1400);
    const wider = page.getByRole("button", { name: /Search wider/ }).first();
    await wider.waitFor({ state: "visible", timeout: 10_000 });
    await wider.click();
    await page.waitForTimeout(1800);
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/discover-wider-desktop.png` });
  });

  test("Discover held matches expand to the real registry rows", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await richMocks(page);
    await page.goto("/?tab=discover");
    await waitForShell(page);
    const box = page.getByRole("textbox").first();
    await box.fill("stablecoin");
    await box.press("Enter");
    await page.waitForTimeout(1400);
    const held = page.locator("summary").filter({ hasText: "Library evidence" }).first();
    if (await held.count()) { await held.click(); await page.waitForTimeout(600); }
    await resetScroll(page);
    await page.screenshot({ path: `${outDir}/discover-held-desktop.png` });
  });
});
