import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import fs from "node:fs";
import path from "node:path";

const OUT = "artifacts/discover-canonical";
fs.mkdirSync(OUT, { recursive: true });

const IDLE_SOURCES = {
  results: [
    {
      kind: "source",
      source_id: "datacite_live",
      candidate_key: "source:datacite_live",
      title: "DataCite research-data catalogue",
      description: "Search DOI-level metadata for published research datasets and repository records.",
      provider: "DataCite",
      source: "DataCite",
      access_mode: "live_connector",
      collect_via: "datacite",
      coverage: "Research datasets · DOI metadata",
      grain: "dataset / DOI record",
    },
    {
      kind: "source",
      source_id: "mops_governance",
      candidate_key: "source:mops_governance",
      title: "MOPS governance disclosures",
      description: "Official Taiwan issuer filings for board, ownership, and governance evidence.",
      provider: "TWSE / MOPS",
      source: "MOPS",
      access_mode: "live_connector",
      collect_via: "mops_tw",
      coverage: "Taiwan listed issuers · governance filings",
      grain: "issuer × filing / period",
    },
    {
      kind: "source",
      source_id: "coingecko_market",
      candidate_key: "source:coingecko_market",
      title: "CoinGecko market-history routes",
      description: "Historical crypto prices, market cap, volume, exchanges, and asset identifiers.",
      provider: "CoinGecko",
      source: "CoinGecko",
      access_mode: "live_connector",
      collect_via: "coingecko",
      coverage: "Crypto market history · exchanges · asset IDs",
      grain: "asset × timestamp / exchange",
    },
  ],
};

const HISTORY = {
  items: [
    {
      id: "intent-usdt-history",
      title: "Historical USDT transactions",
      kind: "intent",
      status: "pending_approval",
      summary: "BigQuery historical transaction request prepared",
      candidate_key: "source:twse_mops:mops_taiwan",
      job_id: "job-usdt-history",
      updated_at: "2026-07-18T15:30:00Z",
    },
    {
      id: "collect-stablecoin-attention",
      title: "Historical stablecoin attention",
      kind: "collection_run",
      status: "running",
      summary: "Latest verified range: 2022-06-30",
      updated_at: "2026-07-18T15:20:00Z",
    },
    {
      id: "failed-governance",
      title: "Taiwan governance source",
      kind: "collection_run",
      status: "failed",
      summary: "Provider endpoint rejected the configured route",
      updated_at: "2026-07-18T15:10:00Z",
    },
    {
      id: "registered-tickers",
      title: "SEC company tickers",
      kind: "collection_run",
      status: "query_ready",
      summary: "Registry confirmed; Library asset available",
      updated_at: "2026-07-18T15:00:00Z",
    },
    {
      id: "schedule-twse",
      title: "TWSE refresh",
      kind: "subscription",
      status: "scheduled",
      cadence: "Every Monday at 10:00",
      execution_mode: "non_executing",
      summary: "Request saved; automatic execution not claimed",
      updated_at: "2026-07-18T14:50:00Z",
    },
  ],
};

const JOBS = {
  jobs: [
    {
      id: "job-usdt-history",
      status: "pending_approval",
      candidate_key: "source:twse_mops:mops_taiwan",
      connector_id: "example_com_data",
      plan: { title: "Historical USDT transactions" },
      request: { candidate_key: "source:twse_mops:mops_taiwan" },
    },
  ],
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
}

test.describe("Discover canonical visual states", () => {
  test("initial Explore 1920x1080", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockV2Api(page, { discoverSourcesBody: IDLE_SOURCES });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("discover-empty")).toBeVisible();
    await expect(page.getByLabel("Search or describe a research need")).toBeVisible();
    await expect(page.getByTestId("discover-coverage")).toContainText("Asia daily news-risk panel");
    await expect(page.getByText("Sources the desk already knows how to investigate")).toBeVisible();
    await expect(
      page.locator(".rd-v2-discover-idle-held .rd-v2-discover-candidate", { hasText: "DataCite research-data catalogue" }),
    ).toBeVisible();
    await shot(page, "discover-initial-1920x1080.png");
  });

  test("initial Explore remains composed without curated routes", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockV2Api(page);
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("discover-coverage")).toContainText("Issuer weekly fundamentals");
    await expect(page.getByText(/No curated source routes yet/i)).toBeVisible();
    await shot(page, "discover-initial-no-routes-1920x1080.png");
  });

  test("History ledger 1920x1080", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockV2Api(page, { jobsBody: JOBS, historyBody: HISTORY });
    await page.goto("/?tab=browse&mode=history", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const history = page.getByTestId("discover-history");
    await expect(history).toBeVisible();
    await expect(history.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Historical USDT transactions");
    await shot(page, "discover-history-1920x1080.png");
  });
});
