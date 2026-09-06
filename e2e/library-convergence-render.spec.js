import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

const GDELT_PREVIEW_ROWS = [
  { date: "2026-04-30", country_iso3: "TWN", article_count: 1842, news_risk: 0.82, market_return: -0.0041, source_count: 317, event_flag: 1, coverage_pct: 0.96 },
  { date: "2026-04-30", country_iso3: "JPN", article_count: 3921, news_risk: 0.44, market_return: 0.0038, source_count: 684, event_flag: 0, coverage_pct: 0.98 },
  { date: "2026-04-30", country_iso3: "KOR", article_count: 2274, news_risk: 0.61, market_return: -0.0013, source_count: 401, event_flag: 1, coverage_pct: 0.95 },
  { date: "2026-04-30", country_iso3: "SGP", article_count: 886, news_risk: 0.29, market_return: 0.0019, source_count: 176, event_flag: 0, coverage_pct: 0.93 },
  { date: "2026-04-30", country_iso3: "IDN", article_count: 1433, news_risk: 0.53, market_return: -0.0027, source_count: 248, event_flag: 0, coverage_pct: 0.91 },
  { date: "2026-04-30", country_iso3: "MYS", article_count: 1109, news_risk: 0.35, market_return: 0.0022, source_count: 209, event_flag: 0, coverage_pct: 0.94 },
];

const REFINITIV_PREVIEW_ROWS = [
  { ric: "2330.TW", date: "2026-04-30", analyst_count: 34, eps_mean: 12.61, eps_revision_30d: 0.084, target_price: 1280, currency: "TWD" },
  { ric: "2454.TW", date: "2026-04-30", analyst_count: 29, eps_mean: 21.44, eps_revision_30d: -0.019, target_price: 1725, currency: "TWD" },
  { ric: "2317.TW", date: "2026-04-30", analyst_count: 31, eps_mean: 11.08, eps_revision_30d: 0.026, target_price: 226, currency: "TWD" },
  { ric: "2308.TW", date: "2026-04-30", analyst_count: 22, eps_mean: 18.73, eps_revision_30d: 0.041, target_price: 472, currency: "TWD" },
  { ric: "2881.TW", date: "2026-04-30", analyst_count: 18, eps_mean: 6.92, eps_revision_30d: -0.007, target_price: 91, currency: "TWD" },
];

const LIBRARY_DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel for cross-country event studies.",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      source_system: "GDELT news graph",
      join_keys: ["date", "country_iso3"],
      columns: ["date", "country_iso3", "article_count", "news_risk", "market_return", "source_count", "event_flag", "coverage_pct"],
      coverage: "2018–2024 · 13 Asian economies",
      rows: 188422,
      updated_at: "2026-08-25T11:14:00Z",
      verification_status: "verified",
      verification: {
        status: "verified",
        summary: "Source identity and registered coverage were checked against the archived acquisition record.",
        checks: ["Source identity matched", "Coverage record attached"],
      },
      recommended_use: "Country-day news-risk studies, event windows, and market-attention controls.",
      limitations: "News intensity is an observational proxy and does not establish causal exposure.",
    },
    {
      dataset_id: "refinitiv_estimate_revision_panel_with_point_in_time_archive_lineage",
      name: "Estimate revision panel",
      description: "Point-in-time analyst estimate revision history with issuer and timestamp lineage.",
      grain: "ric_day",
      analysis_readiness: "instant",
      local_root: "research_panels/refinitiv",
      source: "London Stock Exchange Group / Refinitiv point-in-time archive",
      join_keys: ["ric", "date"],
      columns: ["ric", "date", "analyst_count", "eps_mean", "eps_revision_30d", "target_price", "currency"],
      coverage: "2017–2026",
      rows: 2540310,
      updated_at: "2026-08-24T18:30:00Z",
      verification_status: "matched",
      verification: {
        status: "matched",
        summary: "Registered source and archive manifest correspond; field-level completeness remains a downstream check.",
        checks: ["Archive manifest matched"],
      },
      recommended_use: "Point-in-time expectations, revision shocks, and earnings-information studies.",
    },
    {
      dataset_id: "mops_financial_statements",
      name: "MOPS financial statements",
      description: "Collected Taiwan listed-company financial statement records awaiting a verified local query path.",
      grain: "issuer_quarter",
      analysis_readiness: "metadata_search",
      domain: "procured",
      local_path: "data_lake/procured/mops_financials.csv",
      registered: true,
      source: "MOPS",
      join_keys: ["issuer_id", "fiscal_quarter"],
      columns: ["issuer_id", "fiscal_quarter", "revenue", "net_income", "total_assets", "equity"],
      coverage: "2015–2026",
      verification_status: "partial",
      verification: {
        status: "partial",
        summary: "Source identity is established, but the current local materialization has not been certified query-ready.",
        checks: ["Source identity established"],
        unknowns: ["Current local materialization not certified"],
      },
      recommended_use: "Issuer-quarter accounting controls after local preparation is completed.",
    },
    {
      dataset_id: "stablecoin_governance_work",
      name: "Stablecoin governance evidence review",
      description: "A scholarly evidence record retained alongside the lab's empirical datasets.",
      asset_kind: "scholarly_work",
      doi: "10.1234/stablecoin.governance.2026",
      source: "Journal of Digital Finance",
      publisher: "Research Press",
      analysis_readiness: "registered",
      registered: true,
      verification_status: "unverified",
      verification: {
        status: "unverified",
        summary: "The bibliographic record is retained, but no durable source-comparison claim has been established.",
      },
      tags: ["stablecoins", "governance", "trust"],
    },
    {
      dataset_id: "connected_bigquery_catalogue",
      name: "Public blockchain query source",
      description: "Connected query-time source; usable only through its declared remote access route.",
      analysis_readiness: "dry_run_before_execution",
      registered: true,
      registry_id: "connected_bigquery_catalogue",
      backend: "bigquery_public_dataset",
      collect_via: "BigQuery",
      source: "Google BigQuery public blockchain datasets",
      columns: ["block_timestamp", "tx_hash", "from_address", "to_address", "value", "token_address"],
      coverage: "Live remote source",
      verification_status: "not_checked",
    },
    {
      dataset_id: "tej_governance_catalog_reference",
      name: "TEJ corporate governance reference",
      description: "Known registry reference for a potentially useful governance dataset that has not been added to this Library.",
      source: "Taiwan Economic Journal",
      source_access_mode: "catalog_reference",
      registry_id: "tej_governance_catalog_reference",
      registered: true,
      analysis_readiness: "metadata_search",
      verification_status: "not_checked",
    },
  ],
};

const LIBRARY_NAV = {
  nav_mode: "professor_shelves",
  shelves: [
    { id: "panels", label: "Research panels", partition_ids: ["panels.market", "panels.fundamentals"] },
    { id: "evidence", label: "Research evidence", partition_ids: ["evidence.scholarly"] },
    { id: "connected", label: "Connected sources", partition_ids: ["connected.remote"] },
  ],
  partitions: [
    {
      partition_id: "panels.market",
      shelf_id: "panels",
      professor_label: "Market & attention panels",
      detail: { registry_dataset_ids: ["gdelt_asia_daily_country_panel", "refinitiv_estimate_revision_panel_with_point_in_time_archive_lineage"] },
    },
    {
      partition_id: "panels.fundamentals",
      shelf_id: "panels",
      professor_label: "Issuer fundamentals",
      detail: { registry_dataset_ids: ["mops_financial_statements"] },
    },
    {
      partition_id: "evidence.scholarly",
      shelf_id: "evidence",
      professor_label: "Scholarly evidence",
      detail: { registry_dataset_ids: ["stablecoin_governance_work"] },
    },
    {
      partition_id: "connected.remote",
      shelf_id: "connected",
      professor_label: "Remote query sources",
      detail: { registry_dataset_ids: ["connected_bigquery_catalogue"] },
    },
  ],
};

async function setup(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, {
    datasetsBody: LIBRARY_DATASETS,
    libraryNavBody: LIBRARY_NAV,
  });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) => {
    const id = decodeURIComponent(route.request().url().split("/query/")[1]?.split("?")[0] || "");
    const rows = id.includes("refinitiv") ? REFINITIV_PREVIEW_ROWS : GDELT_PREVIEW_ROWS;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows }) });
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(5);
}

async function assertNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function settleVisualState(page) {
  // Research Drive deliberately fades newly mounted page content for 110ms.
  // Screenshot acceptance must capture the stable state, not a transition frame.
  await page.waitForTimeout(180);
}

async function openAsset(page, title) {
  const row = page.getByTestId("library-evidence-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId("library-asset-workspace")).toContainText(title);
}

async function backToRoot(page) {
  await page.getByRole("button", { name: "Close asset inspector" }).click();
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

test("render current Library evidence and decision states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await setup(page, { width: 1440, height: 900 });
  await expect(page.getByTestId("library-auto-catalog")).toHaveCount(0);
  await expect(page.getByTestId("library-type-filter")).toHaveValue("all");
  await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
  await expect(page.getByTestId("library-sort-filter")).toHaveValue("name");
  const outside = page.getByTestId("library-available-evidence");
  await expect(outside).toContainText("1 known record");
  await expect(outside).toContainText("outside your Library");
  await expect(outside.getByRole("button", { name: "Review in Discover" })).toBeVisible();

  await page.getByTestId("library-type-filter").selectOption("literature");
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(1);
  await expect(page.getByTestId("library-evidence-row")).toContainText("Stablecoin governance evidence review");
  await expect(page.getByTestId("library-evidence-row")).not.toContainText("Asia daily news-risk panel");
  await page.getByTestId("library-type-filter").selectOption("all");
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(5);

  const gdeltRow = page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" });
  await expect(gdeltRow.getByTestId("library-evidence-verification")).toHaveText("Verified");
  await expect(gdeltRow.getByTestId("library-evidence-readiness")).toContainText("Query ready");
  const connectedRow = page.getByTestId("library-evidence-row").filter({ hasText: "Public blockchain query source" });
  await expect(connectedRow.getByTestId("library-evidence-readiness")).toContainText("Connected");

  const lastRootRow = page.getByTestId("library-evidence-row").last();
  const available = page.getByTestId("library-available-evidence");
  const rootGap = await Promise.all([lastRootRow.boundingBox(), available.boundingBox()]);
  expect(rootGap[0]).not.toBeNull();
  expect(rootGap[1]).not.toBeNull();
  expect(rootGap[1].y - (rootGap[0].y + rootGap[0].height)).toBeLessThan(28);

  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/01-root-1440.png`, fullPage: false });

  await page.getByTestId("library-state-filter").selectOption("not_ready");
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "MOPS financial statements" })).toBeVisible();
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" })).toHaveCount(0);
  await page.getByTestId("library-state-filter").selectOption("all");

  await openAsset(page, "Asia daily news-risk panel");
  await expect(page.getByLabel("Evidence claims")).toContainText("Query ready");
  await expect(page.getByLabel("Evidence claims")).toContainText("Verified");
  const dataPreview = page.getByTestId("library-data-preview");
  const assetFacts = page.getByTestId("library-asset-facts");
  await expect(dataPreview).toBeVisible();
  await expect(dataPreview).toContainText("Observed sample");
  await expect(dataPreview.getByRole("columnheader", { name: "news_risk" })).toBeVisible();
  await expect(dataPreview.locator("tbody tr")).toHaveCount(GDELT_PREVIEW_ROWS.length);
  await expect(page.getByTestId("library-observation-receipt")).toContainText("6 rows");
  await expect(dataPreview).toContainText("Coverage: 2018–2024 · 13 Asian economies");
  await expect(assetFacts.getByText("Research details", { exact: true })).toBeVisible();
  expect(await assetFacts.evaluate((element) => element.open)).toBe(false);
  const selectedOrder = await Promise.all([dataPreview.boundingBox(), assetFacts.boundingBox()]);
  expect(selectedOrder[0]).not.toBeNull();
  expect(selectedOrder[1]).not.toBeNull();
  expect(selectedOrder[0].y).toBeLessThan(selectedOrder[1].y);
  expect(selectedOrder[0].y).toBeLessThan(500);
  const rail = page.locator("aside.rd-v2-rail");
  await expect(rail).toContainText("Can I use this?");
  await expect(rail).toContainText("Verified");
  await expect(rail).not.toContainText("Coverage & grain");
  await expect(rail).not.toContainText("Join keys");
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/02-query-ready-1440.png`, fullPage: false });

  await page.getByRole("button", { name: "Source record" }).click();
  await expect(page.getByRole("dialog", { name: "Source and provenance" })).toBeVisible();
  await expect(page.getByTestId("library-source-verification")).toContainText("Verified");
  await expect(page.getByTestId("library-source-readiness")).toContainText("Query ready");
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/03-source-record-1440.png`, fullPage: false });
  await page.getByRole("button", { name: "Close inspection" }).click();

  await backToRoot(page);
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("MOPS");
  await openAsset(page, "MOPS financial statements");
  await expect(page.getByLabel("Evidence claims")).toContainText("Metadata only");
  await expect(page.getByLabel("Evidence claims")).toContainText("Partial");
  await expect(page.getByTestId("library-data-preview")).toContainText("Table structure");
  await expect(page.getByTestId("library-data-preview")).toContainText("issuer_id");
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Partial");
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/04-not-query-ready-1440.png`, fullPage: false });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/05-root-1920.png`, fullPage: false });
  await openAsset(page, "Estimate revision panel");
  await expect(page.getByTestId("library-data-preview")).toContainText("Observed sample");
  await expect(page.getByTestId("library-data-preview").getByRole("columnheader", { name: "eps_revision_30d" })).toBeVisible();
  await expect(page.getByTestId("library-asset-facts").getByText("Research details", { exact: true })).toBeVisible();
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/06-query-ready-1920.png`, fullPage: false });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/07-root-mobile.png`, fullPage: false });

  // Mobile is a visual smoke state, not the interaction acceptance bar. The
  // desktop workflow above already proves row selection. Use the canonical
  // deep link here so a long mobile root never turns screenshot capture into a
  // scroll/pointer-interception test for secondary catalogue sections.
  await page.goto("/?tab=library&dataset=gdelt_asia_daily_country_panel", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-asset-workspace")).toContainText("Asia daily news-risk panel");
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await expect(page.locator(".rd-v2-rail-mobile-grip")).toHaveText("Show research context");
  await assertNoPageOverflow(page);
  await settleVisualState(page);
  await page.screenshot({ path: `${OUT}/08-query-ready-mobile.png`, fullPage: false });
});