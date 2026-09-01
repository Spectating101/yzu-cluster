import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-reconvergence";

function resultFixture() {
  return {
    discoverBody: {
      sections: [{
        id: "library",
        rows: [{
          kind: "registry_dataset",
          dataset_id: "stablecoin_local",
          candidate_key: "dataset:stablecoin_local",
          title: "Stablecoin transfer event sample",
          description: "Held event-level evidence for historical stablecoin transfer activity.",
          local_ready: true,
          query_ready: true,
          collect_via: "local_open",
        }],
      }],
      total: 1,
    },
    discoverSourcesBody: {
      results: [
        {
          kind: "source",
          source_id: "datacite_live",
          candidate_key: "source:datacite:live",
          title: "DataCite live catalogue",
          description: "Searchable scholarly and research-data catalogue with DOI-level records.",
          provider: "DataCite",
          access_mode: "procurement_catalog",
          collect_via: "datacite",
          query_relevance: 2,
        },
        {
          kind: "source",
          source_id: "mops_governance",
          candidate_key: "source:mops:governance",
          title: "MOPS governance disclosures",
          description: "Official issuer disclosures for governance and board variables.",
          provider: "MOPS",
          access_mode: "procurement_catalog",
          collect_via: "http_manifest",
          query_relevance: 2,
        },
        {
          kind: "source",
          source_id: "twse_reference",
          candidate_key: "source:twse:reference",
          title: "TWSE market reference",
          description: "Official market reference context for Taiwan-listed issuers.",
          provider: "TWSE",
          access_mode: "catalog_reference",
          status: "example_reference",
          collect_via: ["http_manifest"],
        },
        {
          kind: "source",
          source_id: "coingecko_reference",
          candidate_key: "source:coingecko:reference",
          title: "CoinGecko market-data reference",
          description: "Reference context for market history and exchange-volume endpoints.",
          provider: "CoinGecko",
          access_mode: "catalog_reference",
          status: "example_reference",
          collect_via: ["http_manifest"],
        },
      ],
      total: 4,
    },
  };
}

async function openDiscover(page) {
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
}

async function runSearch(page) {
  await page.getByLabel("Search or describe a research need").fill("stablecoin market evidence");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
  await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
}

async function assertNoOverflow(page) {
  const dims = await page.locator("main.yzu-main").evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(dims.scroll).toBeLessThanOrEqual(dims.client + 2);
}

test.describe("Discover reconvergence visual review", () => {
  test.beforeEach(async () => {
    await mkdir(OUT, { recursive: true });
  });

  for (const viewport of [
    { width: 1440, height: 900, name: "1440x900" },
    { width: 1920, height: 1080, name: "1920x1080" },
  ]) {
    test(`resting retrieval workspace ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);

      await expect(page.getByTestId("discover-query-composer")).toBeVisible();
      await expect(page.getByTestId("discover-coverage")).toBeVisible();
      await expect(page.locator(".rd-v2-discover-evidence-path")).toHaveCount(0);
      await expect(page.locator(".rd-v2-discover-composer-examples")).toBeHidden();
      await expect(page.getByText("Sources the desk already knows how to investigate")).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-resting-${viewport.name}.png`, fullPage: false });
    });

    test(`active evidence landscape ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page);
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-results-${viewport.name}.png`, fullPage: false });
    });

    test(`selected evidence evaluation ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page);

      const best = page.getByTestId("discover-ranked-results");
      await best.getByRole("button", { name: /DataCite live catalogue/i }).first().click();
      await expect(page.locator(".rd-v2-discover-candidate.selected")).toBeVisible();
      await expect(page.locator("aside.rd-v2-rail").getByRole("region", { name: "Can I use this" })).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-selected-${viewport.name}.png`, fullPage: false });
    });
  }
});
