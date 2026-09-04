import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel for cross-country event studies.",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      join_keys: ["date", "country_iso3"],
      coverage: "2018–2026 · 13 Asian economies",
      rows: 188422,
      verification_status: "verified",
      refresh_policy: "daily",
      data_as_of: "2026-09-03",
      last_refreshed_at: "2026-09-03T15:15:00Z",
      next_refresh_at: "2026-09-04T15:15:00Z",
      stale: false,
      updated_at: "2026-09-03T15:20:00Z",
      holdings: [
        {
          provider: "YZUC Research Cluster",
          custodian: "Research Drive",
          role: "query_ready_replica",
          access: "available",
          state: "current",
          active: true,
          query_ready: true,
          location: "Research panels / News & attention / GDELT",
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
      dataset_id: "weekly_attention_panel",
      name: "Weekly attention panel",
      description: "Weekly investor-attention panel whose scheduled refresh is overdue.",
      grain: "country_week",
      analysis_readiness: "instant",
      local_root: "research_panels/attention_weekly",
      source: "Wikipedia Pageviews",
      join_keys: ["week", "country_iso3"],
      coverage: "2020–2026",
      verification_status: "matched",
      refresh_policy: "weekly",
      data_as_of: "2026-08-20",
      last_refreshed_at: "2026-08-20T08:00:00Z",
      next_refresh_at: "2026-08-27T08:00:00Z",
      stale: true,
      updated_at: "2026-08-20T08:02:00Z",
    },
    {
      dataset_id: "mops_financial_statements",
      name: "MOPS financial statements",
      description: "Registered issuer-quarter accounting evidence with no explicit refresh contract yet.",
      grain: "issuer_quarter",
      analysis_readiness: "metadata_search",
      local_path: "data_lake/procured/mops_financials.csv",
      registered: true,
      source: "MOPS",
      coverage: "2015–2026",
      verification_status: "partial",
      updated_at: "2026-09-03T10:00:00Z",
    },
  ],
};

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, { datasetsBody: DATASETS });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(3);
}

async function selectAsset(page, title) {
  await page.getByTestId("library-evidence-row").filter({ hasText: title }).click();
  await expect(page.getByTestId("library-asset-workspace")).toContainText(title);
}

test("Library keeps pipeline freshness in the selected dossier rather than the root estate", async ({ page }) => {
  await mkdir("artifacts/library-freshness", { recursive: true });
  await setup(page);

  await expect(page.getByRole("columnheader", { name: "Freshness" })).toHaveCount(0);
  await expect(page.getByTestId("library-evidence-freshness")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/library-freshness/01-root-without-freshness-1440.png", fullPage: false });

  await selectAsset(page, "Asia daily news-risk panel");
  const rail = page.locator("aside.rd-v2-rail");
  const basis = rail.getByTestId("library-decision-basis");
  await expect(basis).toContainText("Freshness");
  await expect(basis).toContainText("Through Sep 3 · Daily");
  await expect(rail.getByTestId("library-rail-holdings")).toBeVisible();
  await page.screenshot({ path: "artifacts/library-freshness/02-selected-freshness-1440.png", fullPage: false });

  await rail.locator("details.rd-v2-library-inspector-tech summary").click();
  const tech = rail.locator(".rd-v2-library-inspector-tech-body");
  await expect(tech).toContainText("Data as of");
  await expect(tech).toContainText("Sep 3, 2026");
  await expect(tech).toContainText("Last data refresh");
  await expect(tech).toContainText("2026-09-03T15:15:00Z");
  await expect(tech).toContainText("Refresh cadence");
  await expect(tech).toContainText("Daily");
  await expect(tech).toContainText("Next expected refresh");
  await expect(tech).toContainText("2026-09-04T15:15:00Z");
  await expect(tech).toContainText("Record updated");
  await page.screenshot({ path: "artifacts/library-freshness/03-selected-freshness-details-1440.png", fullPage: false });

  await page.getByRole("button", { name: "Close asset inspector" }).click();
  await selectAsset(page, "Weekly attention panel");
  await expect(page.getByTestId("library-stale-warning")).toContainText("stale");
  await expect(page.locator("aside.rd-v2-rail").getByTestId("library-decision-basis")).toContainText("Stale · Weekly");
  await expect(page.locator("aside.rd-v2-rail").getByTestId("library-decision-basis")).toContainText("Refresh the evidence pipeline");
  await page.screenshot({ path: "artifacts/library-freshness/04-stale-pipeline-1440.png", fullPage: false });
});

test("removing root freshness keeps the mobile estate compact", async ({ page }) => {
  await setup(page, { width: 390, height: 844 });
  await expect(page.getByRole("columnheader", { name: "Freshness" })).toHaveCount(0);
  await expect(page.getByTestId("library-evidence-freshness")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "artifacts/library-freshness/05-root-without-freshness-mobile.png", fullPage: false });
});
