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
  await mockV2Api(page, { datasetsBody: LIBRARY_DATASETS, libraryNavBody: LIBRARY_NAV });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: GDELT_PREVIEW_ROWS }) }),
  );
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

async function settleVisualState(page) {
  await page.waitForTimeout(180);
}

async function assertNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function openAsset(page, title) {
  const row = page.getByTestId("library-evidence-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId("library-asset-workspace")).toContainText(title);
}

test("render Library depth states on desktop", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page, { width: 1440, height: 900 });

  await openAsset(page, "Stablecoin governance evidence review");
  await expect(page.getByTestId("research-situation")).toContainText("Retained as a reusable scholarly work in this Library");
  await expect(page.getByTestId("research-situation")).not.toContainText("querying has not yet been proven");
  const scholarlyWorkspace = page.getByTestId("library-asset-workspace");
  await expect(scholarlyWorkspace).toContainText("Scholarly evidence");
  await expect(scholarlyWorkspace).toContainText("DOI");
  await expect(scholarlyWorkspace).toContainText("Journal of Digital Finance");
  await expect(scholarlyWorkspace).not.toContainText("AccessNot declared");
  await expect(scholarlyWorkspace).not.toContainText("Research use");
  await expect(scholarlyWorkspace).not.toContainText("Library state");
  const scholarlyRail = page.locator("aside.rd-v2-rail");
  await expect(scholarlyRail).toContainText("Can I use this?");
  await expect(scholarlyRail).toContainText("Source authority");
  await expect(scholarlyRail).not.toContainText("Coverage & grain");
  await expect(scholarlyRail).not.toContainText("Join keys");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/09-scholarly-work-1440.png`, fullPage: false });

  await page.getByRole("button", { name: "← All Library assets" }).click();
  await openAsset(page, "Public blockchain query source");
  const sourceWorkspace = page.getByTestId("library-asset-workspace");
  await expect(sourceWorkspace).toContainText("Connected source");
  await expect(sourceWorkspace).toContainText("Declared response shape");
  await expect(sourceWorkspace).not.toContainText("Observed table");
  const sourceRail = page.locator("aside.rd-v2-rail");
  await expect(sourceRail).toContainText("Can I use this?");
  await expect(sourceRail).toContainText("Source authority");
  await expect(sourceRail).toContainText("Ask about access");
  await expect(sourceRail).not.toContainText("Coverage & grain");
  await expect(sourceRail).not.toContainText("Join keys");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/10-connected-source-1440.png`, fullPage: false });

  await page.getByRole("button", { name: "← All Library assets" }).click();
  const collectionButton = page.getByRole("button", { name: "Research panels", exact: true }).first();
  await expect(collectionButton).toBeVisible();
  await collectionButton.click();
  await expect(page.getByTestId("library-evidence-estate")).toContainText("Estimate revision panel");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/11-collection-context-1440.png`, fullPage: false });

  await page.locator(".rd-v2-library-page .rd-v2-crumb").getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await page.getByRole("button", { name: "Open new library item menu" }).click();
  await page.getByRole("menuitem", { name: "Upload file..." }).click();
  const rail = page.locator("aside.rd-v2-rail");
  await expect(rail).toContainText("Upload files");
  await expect(rail).toContainText("Destination");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/12-upload-intake-1440.png`, fullPage: false });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("definitely-no-such-library-asset");
  const empty = page.getByTestId("library-evidence-empty");
  await expect(empty).toContainText("No held evidence matches");
  await expect(empty.getByRole("button", { name: "Ask Library" })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Search wider in Discover" })).toBeVisible();
  const filteredRail = page.locator("aside.rd-v2-rail");
  await expect(filteredRail).toContainText("In this view");
  await expect(filteredRail).not.toContainText("In this library");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/13-search-empty-1440.png`, fullPage: false });
});

test("render Library depth states on mobile", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page, { width: 390, height: 844 });
  await page.goto("/?tab=library&dataset=stablecoin_governance_work", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-asset-workspace")).toContainText("Stablecoin governance evidence review");
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/14-scholarly-work-mobile.png`, fullPage: false });

  await page.goto("/?tab=library&dataset=connected_bigquery_catalogue", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-asset-workspace")).toContainText("Public blockchain query source");
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/15-connected-source-mobile.png`, fullPage: false });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("button", { name: "Open new library item menu" }).click();
  await page.getByRole("menuitem", { name: "Upload file..." }).click();
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/16-upload-mobile.png`, fullPage: false });
});
