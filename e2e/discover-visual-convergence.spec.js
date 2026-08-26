import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-convergence";

async function openDiscover(page) {
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
}

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

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
          source_id: "coingecko_reference",
          candidate_key: "source:coingecko:reference",
          title: "CoinGecko market-data reference",
          description: "Reference context for market history and exchange-volume endpoints.",
          access_mode: "catalog_reference",
          status: "example_reference",
          collect_via: ["http_manifest"],
        },
      ],
      total: 2,
    },
  };
}

async function assertNoHorizontalOverflow(page) {
  const result = await page.locator("main.yzu-main").evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(result.scroll).toBeLessThanOrEqual(result.client + 2);
}

test.describe("Discover visual convergence", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mkdir(OUT, { recursive: true });
  });

  test("idle evidence entrance is legible at desktop and workstation scale", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);

    const coverage = page.getByTestId("discover-coverage");
    await expect(coverage).toBeVisible();
    await expect(page.getByTestId("discover-query-composer")).toBeVisible();
    await expect(page.getByText("Library first", { exact: true })).toBeVisible();
    await expect(page.getByText("Reviewed acquisition", { exact: true })).toBeVisible();

    const path = coverage.locator(".rd-v2-discover-evidence-path");
    await page.screenshot({ path: `${OUT}/discover-idle-1440x900.png`, fullPage: false });
    const offenders = await path.locator("li").evaluateAll((nodes) =>
      nodes.map((node, index) => ({
        index,
        text: node.textContent?.replace(/\s+/g, " ").trim(),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      })).filter((item) => item.scrollWidth > item.clientWidth + 2),
    );
    expect(offenders, `evidence-path overflow: ${JSON.stringify(offenders)}`).toEqual([]);
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-idle-1920x1080.png`, fullPage: false });
  });

  test("mixed evidence state separates held evidence, offerings, and references", async ({ page }) => {
    await mockV2Api(page, resultFixture());
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);
    await search(page, "stablecoin market evidence");

    const summary = page.getByTestId("discover-result-summary");
    await expect(summary).toContainText(/Available\s*·\s*1/i);
    await expect(summary).toContainText(/Library evidence\s*·\s*1/i);
    await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
    await expect(page.getByTestId("discover-context-results")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to collection", exact: true })).toHaveCount(1);
    await assertNoHorizontalOverflow(page);

    const decisionBand = page.getByLabel("Discover next actions");
    await expect(decisionBand).toBeVisible();
    const bandBox = await decisionBand.boundingBox();
    const resultsBox = await page.getByTestId("discover-ranked-results").boundingBox();
    expect(bandBox && resultsBox).toBeTruthy();
    expect(bandBox.y).toBeLessThan(resultsBox.y);

    await page.screenshot({ path: `${OUT}/discover-results-1440x900.png`, fullPage: false });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-results-1920x1080.png`, fullPage: false });
  });
});
