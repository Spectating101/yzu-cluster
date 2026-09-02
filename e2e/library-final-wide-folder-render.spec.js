import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

const datasetsBody = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel for cross-country event studies.",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      coverage: "2018–2024 · 13 Asian economies",
      verification_status: "verified",
    },
    {
      dataset_id: "refinitiv_estimate_revision_panel_with_point_in_time_archive_lineage",
      name: "Estimate revision panel",
      description: "Point-in-time analyst estimate revision history with issuer and timestamp lineage.",
      grain: "ric_day",
      analysis_readiness: "instant",
      local_root: "research_panels/refinitiv",
      source: "London Stock Exchange Group / Refinitiv point-in-time archive",
      coverage: "2017–2026",
      verification_status: "matched",
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
    },
    {
      dataset_id: "stablecoin_governance_work",
      name: "Stablecoin governance evidence review",
      description: "A scholarly evidence record retained alongside the lab's empirical datasets.",
      asset_kind: "scholarly_work",
      source: "Journal of Digital Finance",
      analysis_readiness: "registered",
      registered: true,
      verification_status: "unverified",
    },
    {
      dataset_id: "connected_bigquery_catalogue",
      name: "Public blockchain query source",
      description: "Connected query-time source; usable only through its declared remote access route.",
      analysis_readiness: "dry_run_before_execution",
      registered: true,
      backend: "bigquery_public_dataset",
      collect_via: "BigQuery",
      source: "Google BigQuery public blockchain datasets",
      verification_status: "not_checked",
    },
  ],
};

const libraryNavBody = {
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

test("capture wide collection workspace", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockV2Api(page, { datasetsBody, libraryNavBody });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await page.getByTestId("library-collection-filter").filter({ hasText: "Research panels" }).click();
  await expect(page.getByTestId("library-directory")).toBeVisible();
  await expect(page.locator(".rd-v2-library-pathbar")).toContainText("Research panels");
  await expect(page.locator("aside.rd-v2-rail")).toContainText("In this collection");
  await page.waitForTimeout(220);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.screenshot({ path: `${OUT}/23-collection-context-1920.png`, fullPage: false });
});