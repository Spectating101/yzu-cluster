import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

const DATASET = {
  dataset_id: "refinitiv_estimate_revision_panel_with_point_in_time_archive_lineage",
  registry_id: "refinitiv_estimate_revision_panel_with_point_in_time_archive_lineage",
  registered: true,
  name: "Estimate revision panel",
  description: "Point-in-time analyst estimate revision history with issuer and timestamp lineage.",
  grain: "ric_day",
  analysis_readiness: "instant",
  local_root: "research_panels/refinitiv",
  source: "London Stock Exchange Group / Refinitiv point-in-time archive",
  source_system: "Refinitiv point-in-time archive",
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
};

const PREVIEW_ROWS = [
  { ric: "2330.TW", date: "2026-04-30", analyst_count: 34, eps_mean: 12.61, eps_revision_30d: 0.084, target_price: 1280, currency: "TWD" },
  { ric: "2454.TW", date: "2026-04-30", analyst_count: 29, eps_mean: 21.44, eps_revision_30d: -0.019, target_price: 1725, currency: "TWD" },
  { ric: "2317.TW", date: "2026-04-30", analyst_count: 31, eps_mean: 11.08, eps_revision_30d: 0.026, target_price: 226, currency: "TWD" },
  { ric: "2308.TW", date: "2026-04-30", analyst_count: 22, eps_mean: 18.73, eps_revision_30d: 0.041, target_price: 472, currency: "TWD" },
  { ric: "2881.TW", date: "2026-04-30", analyst_count: 18, eps_mean: 6.92, eps_revision_30d: -0.007, target_price: 91, currency: "TWD" },
  { ric: "2882.TW", date: "2026-04-30", analyst_count: 16, eps_mean: 5.87, eps_revision_30d: 0.012, target_price: 73, currency: "TWD" },
  { ric: "2303.TW", date: "2026-04-30", analyst_count: 27, eps_mean: 4.11, eps_revision_30d: 0.031, target_price: 58, currency: "TWD" },
  { ric: "3711.TW", date: "2026-04-30", analyst_count: 21, eps_mean: 9.42, eps_revision_30d: -0.004, target_price: 152, currency: "TWD" },
  { ric: "2891.TW", date: "2026-04-30", analyst_count: 14, eps_mean: 3.62, eps_revision_30d: 0.018, target_price: 46, currency: "TWD" },
  { ric: "2382.TW", date: "2026-04-30", analyst_count: 19, eps_mean: 10.08, eps_revision_30d: 0.057, target_price: 319, currency: "TWD" },
  { ric: "3231.TW", date: "2026-04-30", analyst_count: 13, eps_mean: 8.26, eps_revision_30d: 0.022, target_price: 211, currency: "TWD" },
  { ric: "6669.TW", date: "2026-04-30", analyst_count: 12, eps_mean: 31.04, eps_revision_30d: 0.063, target_price: 2480, currency: "TWD" },
];

const NAV = {
  nav_mode: "professor_shelves",
  shelves: [{ id: "panels", label: "Research panels", partition_ids: ["panels.market"] }],
  partitions: [{
    partition_id: "panels.market",
    shelf_id: "panels",
    professor_label: "Market & attention panels",
    detail: { registry_dataset_ids: [DATASET.dataset_id] },
  }],
};

test("selected query-ready asset opens a complete full preview at 1920", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockV2Api(page, { datasetsBody: { datasets: [DATASET] }, libraryNavBody: NAV });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ rows: PREVIEW_ROWS }),
  }));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const asset = page.getByTestId("library-evidence-row").filter({ hasText: "Estimate revision panel" });
  await expect(asset).toBeVisible();
  await asset.click();
  await expect(page.getByTestId("library-asset-workspace")).toContainText("Estimate revision panel");
  await expect(page.getByRole("button", { name: "Full preview" })).toBeVisible();
  await page.getByRole("button", { name: "Full preview" }).click();

  const preview = page.getByRole("dialog", { name: "Estimate revision panel preview" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("columnheader", { name: "eps_revision_30d" })).toBeVisible();
  await expect(preview.locator("tbody tr")).toHaveCount(12);
  await expect(page.getByTestId("library-preview-open-state")).toContainText("Preview open in centre");
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${OUT}/28-selected-full-preview-1920.png`, fullPage: false });
});
