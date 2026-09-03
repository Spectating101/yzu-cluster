import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-preview";

const KAGGLE_SOURCE = {
  kind: "source",
  source_id: "kaggle_stablecoin_snapshot",
  candidate_key: "source:kaggle_stablecoin_snapshot",
  title: "Stablecoin Market Daily Snapshot",
  description: "Daily USD-pegged stablecoin snapshot with market, peg-status, liquidity, and trading measures.",
  provider: "Kaggle",
  source: "Kaggle",
  url: "https://www.kaggle.com/datasets/example/stablecoin-market-daily-snapshot",
  access_mode: "public_download",
  collect_via: "http_manifest",
  coverage: "USD-pegged stablecoins · daily market and peg state",
  temporal_coverage: "2020–2026",
  geographic_coverage: "Global crypto markets",
  refresh_frequency: "published snapshot",
  grain: "stablecoin × day",
  recommended_use: "Compare peg stability, market capitalization, liquidity, and trading conditions across stablecoins.",
  format: "CSV",
  file_count: 1,
  column_count: 23,
  columns: ["date", "symbol", "price_usd", "peg_deviation", "market_cap_usd", "volume_24h_usd"],
  license: "CC BY-NC-SA 4.0",
  preview_supported: true,
  query_relevance: 5,
};

const PREVIEW_BODY = {
  status: "ready",
  provider: "Kaggle",
  sample_row_count: 5,
  schema: {
    columns: ["date", "symbol", "price_usd", "peg_deviation", "market_cap_usd", "volume_24h_usd"],
    format: "CSV",
    grain: "stablecoin × day",
    temporal_coverage: "2020–2026",
  },
  sample_rows: [
    { date: "2026-08-31", symbol: "USDC", price_usd: 0.9998, peg_deviation: -0.0002, market_cap_usd: 61200000000, volume_24h_usd: 8100000000 },
    { date: "2026-08-31", symbol: "USDT", price_usd: 1.0001, peg_deviation: 0.0001, market_cap_usd: 168300000000, volume_24h_usd: 51300000000 },
    { date: "2026-08-31", symbol: "DAI", price_usd: 0.9994, peg_deviation: -0.0006, market_cap_usd: 5300000000, volume_24h_usd: 412000000 },
    { date: "2026-08-30", symbol: "USDC", price_usd: 1.0000, peg_deviation: 0, market_cap_usd: 61100000000, volume_24h_usd: 7600000000 },
    { date: "2026-08-30", symbol: "USDT", price_usd: 0.9999, peg_deviation: -0.0001, market_cap_usd: 168100000000, volume_24h_usd: 49800000000 },
  ],
};

test.describe("Discover evidence preview visual review", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  test("external source evidence canvas 1920x1080", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: { sections: [], total: 0 },
      discoverSourcesBody: { results: [KAGGLE_SOURCE] },
    });
    await page.route("**/library/discover/sources/preview", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PREVIEW_BODY),
      });
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?tab=discover");
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();

    const composer = page.getByLabel("Search or describe a research need");
    await composer.fill("stablecoin de-peg market data");
    await composer.press("Enter");

    const row = page.getByTestId("discover-ranked-results").getByRole("button", { name: /Stablecoin Market Daily Snapshot/i });
    await expect(row).toBeVisible();
    await row.click();

    const inspect = page.getByRole("button", { name: /Inspect source/i }).first();
    await expect(inspect).toBeVisible();
    await inspect.click();

    const dialog = page.getByRole("dialog", { name: /Stablecoin Market Daily Snapshot preview/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/External data inspector/i);
    await expect(dialog).toContainText(/Observed sample available/i);

    await page.getByRole("button", { name: "Rows", exact: true }).click();
    await expect(page.getByTestId("discover-external-preview-rows")).toBeVisible();
    await expect(page.getByTestId("discover-external-preview-rows")).toContainText("USDC");

    await page.screenshot({ path: `${OUT}/discover-preview-1920x1080.png`, fullPage: false });
  });
});
