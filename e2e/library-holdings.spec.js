import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-holdings";

const DATASET = {
  dataset_id: "gdelt_federated_holding_panel",
  name: "Asia daily news-risk panel",
  description: "Country-day news intensity and market-risk research panel aggregated into one logical Library object across several research storage systems.",
  grain: "country_day",
  analysis_readiness: "instant",
  source: "GDELT GKG",
  join_keys: ["date", "country_iso3"],
  columns: ["date", "country_iso3", "article_count", "news_risk", "market_return"],
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
  holdings: [
    {
      holding_id: "yzuc-query-replica",
      provider: "YZUC Research Cluster",
      custodian: "Research Drive",
      role: "Query-ready replica",
      access: "available",
      state: "current",
      location: "Research panels / News & attention / GDELT",
      active: true,
      query_ready: true,
      version: "2026-08-25",
      content_sha256: "sha256:7b7d1fd9…c2a4",
    },
    {
      holding_id: "christopher-drive",
      provider: "Google Drive",
      custodian: "Christopher",
      role: "Research replica",
      access: "available",
      state: "current",
      location: "Research / Asia markets / gdelt_asia_daily.csv",
      version: "2026-08-25",
      content_sha256: "sha256:7b7d1fd9…c2a4",
    },
    {
      holding_id: "kong-dropbox",
      provider: "Dropbox",
      custodian: "Prof. Kong",
      role: "Original holding",
      access: "restricted",
      state: "current",
      location: "Finance Research / GDELT / Asia daily panel.csv",
      original: true,
      version: "2026-08-25",
      content_sha256: "sha256:7b7d1fd9…c2a4",
    },
  ],
};

const ROWS = [
  { date: "2026-04-30", country_iso3: "TWN", article_count: 1842, news_risk: 0.82, market_return: -0.0041 },
  { date: "2026-04-30", country_iso3: "JPN", article_count: 3921, news_risk: 0.44, market_return: 0.0038 },
  { date: "2026-04-30", country_iso3: "KOR", article_count: 2274, news_risk: 0.61, market_return: -0.0013 },
  { date: "2026-04-30", country_iso3: "SGP", article_count: 886, news_risk: 0.29, market_return: 0.0019 },
];

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, { datasetsBody: { datasets: [DATASET] } });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ rows: ROWS }),
  }));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("federated holdings stay separate from provenance and storage is searchable", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page);

  const row = page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" });
  await expect(row).toBeVisible();
  await row.click();

  const workspace = page.getByTestId("library-asset-workspace");
  const rail = page.locator("aside.rd-v2-rail");
  await expect(workspace).toBeVisible();
  await expect(rail.getByTestId("library-rail-holdings")).toContainText("3 locations · 2 available");
  await expect(rail.getByTestId("library-rail-holdings")).toContainText("YZUC Research Cluster");
  await expect(rail.getByTestId("library-rail-holdings")).toContainText("Google Drive · Dropbox");
  await expect(workspace.getByRole("button", { name: "Holdings" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-selected-holdings-1440.png`, fullPage: false });

  await workspace.getByRole("button", { name: "Holdings" }).click();
  const overlay = page.getByRole("dialog", { name: "Holdings" });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Where this research object is held now");
  await expect(overlay).toContainText("YZUC Research Cluster");
  await expect(overlay).toContainText("Research Drive");
  await expect(overlay).toContainText("Google Drive");
  await expect(overlay).toContainText("Christopher");
  await expect(overlay).toContainText("Dropbox");
  await expect(overlay).toContainText("Prof. Kong");
  await expect(overlay).toContainText("Original holding");
  await expect(overlay).toContainText("Restricted");
  await expect(overlay).not.toContainText("Source authority");
  await page.screenshot({ path: `${OUT}/02-holdings-overlay-1440.png`, fullPage: false });

  await overlay.getByRole("button", { name: "Close holdings" }).click();
  await workspace.getByRole("button", { name: "Source record" }).click();
  const source = page.getByRole("dialog", { name: "Source and provenance" });
  await expect(source).toContainText("GDELT GKG");
  await expect(source).not.toContainText("Prof. Kong");
  await expect(source).not.toContainText("Google Drive");
  await source.getByRole("button", { name: "Close inspection" }).click();

  await page.getByRole("button", { name: "Close asset inspector" }).click();
  const search = page.getByRole("textbox", { name: "Search library holdings" });
  await search.fill("Prof. Kong Dropbox");
  await expect(row).toBeVisible();
  await expect(row).toContainText("Matched");
  await expect(row.getByTestId("library-search-match")).toContainText(/holding/i);
  await page.screenshot({ path: `${OUT}/03-search-by-holding-1440.png`, fullPage: false });
});

test("holdings remain secondary to the selected dossier on mobile", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page, { width: 390, height: 844 });
  const row = page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" });
  await row.click();
  const workspace = page.getByTestId("library-asset-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Holdings" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/04-selected-holdings-mobile.png`, fullPage: false });
});
