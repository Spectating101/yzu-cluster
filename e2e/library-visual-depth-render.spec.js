import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

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

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, {
    datasetsBody: LIBRARY_DATASETS,
    libraryNavBody: LIBRARY_NAV,
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(5);
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
  await settleVisualState(page);
}

async function backToRoot(page) {
  await page.getByRole("button", { name: "← All Library assets" }).click();
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await settleVisualState(page);
}

test("render Library depth states on desktop", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page);

  // Root location is already established by the page title. A one-item
  // breadcrumb would only repeat "Library" and weaken the action hierarchy.
  await expect(page.locator(".rd-v2-library-page .rd-v2-crumb")).toBeHidden();
  await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");

  await openAsset(page, "Stablecoin governance evidence review");
  const scholarly = page.getByTestId("library-asset-workspace");
  const scholarlyRail = page.locator("aside.rd-v2-rail");
  await expect(scholarly).toHaveAttribute("data-asset-kind", "scholarly_work");
  await expect(scholarly.getByLabel("Evidence claims")).toContainText("Registered");
  await expect(scholarly.getByLabel("Evidence claims")).toContainText("Unverified");
  await expect(scholarly.getByRole("button", { name: "Preview rows" })).toHaveCount(0);
  await expect(scholarly.getByRole("button", { name: "Open query" })).toHaveCount(0);
  await expect(scholarlyRail).toContainText("Scholarly work");
  await expect(scholarlyRail).not.toContainText("Library dataset");
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/09-scholarly-work-1440.png`, fullPage: false });

  await backToRoot(page);
  await openAsset(page, "Public blockchain query source");
  const connected = page.getByTestId("library-asset-workspace");
  await expect(connected.getByLabel("Evidence claims")).toContainText("Connected");
  await expect(connected.getByLabel("Evidence claims")).toContainText("Not checked");
  await expect(connected.getByRole("button", { name: "Open query" })).toHaveCount(0);
  // Connected sources may expose a declared response shape, but that structure
  // must remain visibly distinct from an observed/materialized row sample.
  await expect(connected.getByTestId("library-data-preview")).toContainText("Table structure");
  await expect(connected.getByTestId("library-data-preview").getByRole("columnheader", { name: "block_timestamp" })).toBeVisible();
  await expect(connected.getByTestId("library-data-preview")).toContainText("Declared structure only");
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/10-connected-source-1440.png`, fullPage: false });

  await backToRoot(page);
  await page.getByTestId("library-collection-filter").filter({ hasText: "Research panels" }).click();
  await expect(page.getByTestId("library-directory")).toBeVisible();
  await expect(page.locator(".rd-v2-library-pathbar")).toContainText("Research panels");
  await expect(page.locator(".rd-v2-library-page .rd-v2-crumb")).toBeVisible();
  await expect(page.locator(".rd-v2-library-page .rd-v2-crumb")).toContainText("Research panels");
  await expect(page.locator("aside.rd-v2-rail")).toContainText("In this collection");
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
  await expect(page.getByTestId("library-evidence-estate")).toContainText("No evidence matches the current Library view");
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

  await openAsset(page, "Stablecoin governance evidence review");
  await expect(page.getByTestId("library-asset-workspace")).toHaveAttribute("data-asset-kind", "scholarly_work");
  await expect(page.getByLabel("Evidence claims")).toContainText("Registered");
  await expect(page.getByLabel("Evidence claims")).toContainText("Unverified");
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/14-scholarly-work-mobile.png`, fullPage: false });

  await backToRoot(page);
  await openAsset(page, "Public blockchain query source");
  await expect(page.getByLabel("Evidence claims")).toContainText("Connected");
  await expect(page.getByLabel("Evidence claims")).toContainText("Not checked");
  await expect(page.locator("aside.rd-v2-rail")).toHaveClass(/rd-v2-rail-collapsed/);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/15-connected-source-mobile.png`, fullPage: false });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await page.getByRole("button", { name: "Open new library item menu" }).click();
  await page.getByRole("menuitem", { name: "Upload file..." }).click();
  await expect(page.locator("aside.rd-v2-rail")).not.toHaveClass(/rd-v2-rail-collapsed/);
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Upload files");
  await settleVisualState(page);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: `${OUT}/16-upload-intake-mobile.png`, fullPage: false });
});