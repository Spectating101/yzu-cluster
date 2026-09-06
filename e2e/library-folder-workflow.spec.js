import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-folder-workflow";

const DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel.",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      join_keys: ["date", "country_iso3"],
      columns: ["date", "country_iso3", "article_count", "news_risk", "market_return"],
      coverage: "2018–2026 · 13 Asian economies",
      rows: 188422,
      verification_status: "verified",
      refresh_policy: "daily",
      data_as_of: "2026-09-03",
      last_refreshed_at: "2026-09-03T15:15:00Z",
      next_refresh_at: "2026-09-04T15:15:00Z",
      stale: false,
      holdings: [
        {
          provider: "YZUC Research Cluster",
          custodian: "Research Drive",
          role: "query_ready_replica",
          access: "available",
          state: "current",
          active: true,
          query_ready: true,
          location: "Research panels / GDELT",
        },
        {
          provider: "Google Drive",
          custodian: "Christopher",
          role: "research_replica",
          access: "available",
          state: "current",
          location: "Research / Asia markets / gdelt_asia_daily.csv",
        },
      ],
    },
    {
      dataset_id: "refinitiv_estimate_revision_panel",
      name: "Estimate revision panel",
      description: "Point-in-time analyst estimate revisions.",
      grain: "ric_day",
      analysis_readiness: "instant",
      local_root: "research_panels/refinitiv",
      source: "Refinitiv",
      coverage: "2017–2026",
      verification_status: "matched",
    },
    {
      dataset_id: "mops_financial_statements",
      name: "MOPS financial statements",
      description: "Taiwan issuer-quarter accounting evidence.",
      grain: "issuer_quarter",
      analysis_readiness: "metadata_search",
      registered: true,
      domain: "procured",
      local_path: "data_lake/procured/mops/financials.csv",
      source: "MOPS",
      coverage: "2015–2026",
      verification_status: "partial",
    },
    {
      dataset_id: "refinitiv_entity_market_spine",
      name: "Entity market spine",
      description: "Canonical market identifiers and RIC mapping.",
      grain: "ric_snapshot",
      analysis_readiness: "instant",
      local_path: "data_lake/entity_mapping/entity_market_spine.parquet",
      source: "Refinitiv",
      verification_status: "verified",
    },
    {
      dataset_id: "stablecoin_governance_work",
      name: "Stablecoin governance evidence review",
      description: "Scholarly evidence retained in Library without a recorded physical path.",
      asset_kind: "scholarly_work",
      doi: "10.1234/stablecoin.governance.2026",
      source: "Journal of Digital Finance",
      analysis_readiness: "registered",
      registered: true,
      verification_status: "unverified",
    },
    {
      dataset_id: "connected_bigquery_catalogue",
      name: "Public blockchain query source",
      description: "Connected query-time source without a local physical path.",
      analysis_readiness: "dry_run_before_execution",
      registered: true,
      backend: "bigquery_public_dataset",
      collect_via: "BigQuery",
      source: "Google BigQuery public blockchain datasets",
      verification_status: "not_checked",
    },
  ],
};

const NAV = {
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
      detail: { registry_dataset_ids: ["gdelt_asia_daily_country_panel", "refinitiv_estimate_revision_panel"] },
    },
    {
      partition_id: "panels.fundamentals",
      shelf_id: "panels",
      professor_label: "Issuer fundamentals",
      detail: { registry_dataset_ids: ["mops_financial_statements", "refinitiv_entity_market_spine"] },
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

const ROWS = [
  { date: "2026-09-03", country_iso3: "TWN", article_count: 1842, news_risk: 0.82, market_return: -0.0041 },
  { date: "2026-09-03", country_iso3: "JPN", article_count: 3921, news_risk: 0.44, market_return: 0.0038 },
  { date: "2026-09-03", country_iso3: "KOR", article_count: 2274, news_risk: 0.61, market_return: -0.0013 },
  { date: "2026-09-03", country_iso3: "SGP", article_count: 886, news_risk: 0.29, market_return: 0.0019 },
];

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, { datasetsBody: DATASETS, libraryNavBody: NAV });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ rows: ROWS }),
  }));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

function folderRow(page, title) {
  return page.locator('.rd-v2-catalog .row[data-kind="folder"]', { hasText: title });
}

function datasetRow(page, title) {
  return page.locator('.rd-v2-catalog .row[data-kind="dataset"]', { hasText: title });
}

async function noOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
}

test("Library physical folder workflow remains distinct from Research Collections", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page);

  // 1. Library root owns research retrieval/context, with Folders as an explicit alternate lens.
  await expect(page.getByText("Research collections", { exact: true })).toBeVisible();
  await expect(page.getByTestId("library-collection-filter").filter({ hasText: "Research panels" })).toBeVisible();
  await expect(page.getByTestId("library-collection-filter").filter({ hasText: "Research evidence" })).toBeVisible();
  await expect(page.getByTestId("library-folders-root")).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-library-root-1440.png`, fullPage: false });

  // 2. Browse folders must switch to real recorded paths, not professor taxonomy.
  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Library");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Folders");
  await expect(folderRow(page, "Research panels")).toBeVisible();
  await expect(folderRow(page, "Acquired data")).toBeVisible();
  await expect(folderRow(page, "Reference data")).toBeVisible();
  await expect(page.getByTestId("library-directory")).not.toContainText("Market & attention panels");
  await expect(page.getByTestId("library-directory")).not.toContainText("Scholarly evidence");
  await expect(page.getByTestId("library-directory")).not.toContainText("Stablecoin governance evidence review");
  await expect(page.getByTestId("library-directory")).not.toContainText("Public blockchain query source");
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Folder storage");
  await expect(page.locator("aside.rd-v2-rail")).toContainText("recorded local paths");
  await page.screenshot({ path: `${OUT}/02-folders-root-1440.png`, fullPage: false });

  // 3. Physical hierarchy follows local_root: Research panels → gdelt.
  await folderRow(page, "Research panels").click();
  await expect(folderRow(page, "gdelt")).toBeVisible();
  await expect(folderRow(page, "refinitiv")).toBeVisible();
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Folder");
  await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Research collection inside Folders");
  await page.screenshot({ path: `${OUT}/03-research-panels-folder-1440.png`, fullPage: false });

  await folderRow(page, "gdelt").click();
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb).toContainText("Library");
  await expect(breadcrumb).toContainText("Folders");
  await expect(breadcrumb).toContainText("Research panels");
  await expect(breadcrumb).toContainText("gdelt");
  await expect(datasetRow(page, "Asia daily news-risk panel")).toBeVisible();
  await page.screenshot({ path: `${OUT}/04-gdelt-folder-1440.png`, fullPage: false });

  // 4. Selecting from a physical directory converges on the same canonical dossier.
  await datasetRow(page, "Asia daily news-risk panel").click();
  const workspace = page.getByTestId("library-asset-workspace");
  const rail = page.locator("aside.rd-v2-rail");
  await expect(workspace).toContainText("Asia daily news-risk panel");
  await expect(workspace).toContainText("Observed sample");
  await expect(rail.getByTestId("library-decision-basis")).toContainText("Freshness");
  await expect(rail.getByTestId("library-decision-basis")).toContainText("Through Sep 3 · Daily");
  await expect(rail.getByTestId("library-rail-holdings")).toContainText("YZUC Research Cluster");
  await page.screenshot({ path: `${OUT}/05-folder-selected-dossier-1440.png`, fullPage: false });

  // 5. Close the dossier and use breadcrumbs as actual directory navigation.
  await page.getByRole("button", { name: "Close asset inspector" }).click();
  await breadcrumb.getByRole("button", { name: "Research panels" }).click();
  await expect(folderRow(page, "gdelt")).toBeVisible();
  await expect(folderRow(page, "refinitiv")).toBeVisible();
  await page.screenshot({ path: `${OUT}/06-breadcrumb-back-1440.png`, fullPage: false });

  // 6. Folder-local semantic search can cut through nested paths without redefining identity.
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia daily");
  await expect(page.getByTestId("library-directory")).toContainText("Asia daily news-risk panel");
  await expect(folderRow(page, "gdelt")).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/07-folder-search-1440.png`, fullPage: false });
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("");
  await expect(folderRow(page, "gdelt")).toBeVisible();

  // 7. Intake inherits the actual physical destination.
  await folderRow(page, "gdelt").click();
  await page.getByRole("button", { name: "Open new library item menu" }).click();
  await page.getByRole("menuitem", { name: "Upload file..." }).click();
  await expect(rail).toContainText("Upload files");
  await expect(rail).toContainText("Library / Folders / Research panels / gdelt");
  await page.screenshot({ path: `${OUT}/08-folder-intake-1440.png`, fullPage: false });

  // 8. A second branch proves this is path-derived, not a one-off GDELT fixture.
  await page.goto("/?tab=library&folder=__folders__", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await folderRow(page, "Acquired data").click();
  await expect(folderRow(page, "mops")).toBeVisible();
  await folderRow(page, "mops").click();
  await expect(datasetRow(page, "MOPS financial statements")).toBeVisible();
  await page.screenshot({ path: `${OUT}/09-acquired-data-branch-1440.png`, fullPage: false });

  await noOverflow(page);
});

test("physical folders remain usable on mobile", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page, { width: 390, height: 844 });
  await page.getByTestId("library-folders-root").click();
  await expect(folderRow(page, "Research panels")).toBeVisible();
  await page.screenshot({ path: `${OUT}/10-folders-root-mobile.png`, fullPage: false });

  await folderRow(page, "Research panels").click();
  await folderRow(page, "gdelt").click();
  await expect(datasetRow(page, "Asia daily news-risk panel")).toBeVisible();
  await datasetRow(page, "Asia daily news-risk panel").click();
  await expect(page.getByTestId("library-asset-workspace")).toContainText("Asia daily news-risk panel");
  await noOverflow(page);
  await page.screenshot({ path: `${OUT}/11-folder-selected-mobile.png`, fullPage: false });
});
