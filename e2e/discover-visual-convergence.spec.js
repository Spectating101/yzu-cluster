import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_ASSESSMENT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

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
    const path = coverage.locator(".rd-v2-discover-evidence-path");
    const stages = path.locator("li");
    await expect(stages).toHaveCount(4);
    await expect(stages.nth(0)).toContainText("Evidence need");
    await expect(stages.nth(0)).toContainText("reviewable evidence contract");
    await expect(stages.nth(1)).toContainText("Library position");
    await expect(stages.nth(1)).toContainText("before new acquisition");
    await expect(stages.nth(2)).toContainText("Sourcing strategy");
    await expect(stages.nth(2)).toContainText("unresolved evidence gaps");
    await expect(stages.nth(3)).toContainText("Reviewed acquisition");
    await expect(stages.nth(3)).toContainText("approval before collection");
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
    await expect(summary).toContainText("1 offering with a declared route");
    await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
    await expect(page.getByTestId("discover-context-results")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review acquisition route", exact: true })).toHaveCount(1);
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


  test("research question promotes evidence position, sourcing strategy, and capacity above search results", async ({ page }) => {
    await mockV2Api(page, { ...resultFixture(), assessmentBody: MOCK_DISCOVER_ASSESSMENT });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);
    await search(page, "Do we hold issuer-quarter governance data for Taiwan?");

    const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Partially covered");
    await expect(workspace).toContainText("Library support");
    await expect(workspace).toContainText("One precise gap");
    await expect(workspace).toContainText("MOPS governance disclosures");
    await expect(workspace).toContainText("Execution capacity");
    await expect(workspace).toContainText(/Collector fleet|BigQuery|GDrive vault/);
    await expect(workspace).toContainText("No worker or quota is assigned here");

    const capacityCards = workspace.locator(".rd-v2-evidence-capacity-grid > div");
    const capacityCardBoxes = await capacityCards.evaluateAll((nodes) => nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    })));
    expect(capacityCardBoxes.length).toBeGreaterThan(0);
    expect(Math.min(...capacityCardBoxes.map((box) => box.width))).toBeGreaterThanOrEqual(220);
    expect(capacityCardBoxes.filter((box) => box.scrollWidth > box.clientWidth + 2)).toEqual([]);

    const workspaceBox = await workspace.boundingBox();
    const resultsBox = await page.getByTestId("discover-ranked-results").boundingBox();
    expect(workspaceBox && resultsBox).toBeTruthy();
    expect(workspaceBox.y).toBeLessThan(resultsBox.y);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-investigation-1440x900.png`, fullPage: false });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-investigation-1920x1080.png`, fullPage: false });
  });

  test("selected offering turns the rail into a bounded decision surface", async ({ page }) => {
    await mockV2Api(page, resultFixture());
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);
    await search(page, "stablecoin market evidence");

    const visibleOffering = page
      .getByTestId("discover-ranked-results")
      .locator("button.rd-v2-discover-candidate")
      .first();
    await expect(visibleOffering).toBeVisible();
    await visibleOffering.click();
    const evaluation = page.getByTestId("discover-eval-surface");
    await expect(evaluation).toBeVisible();
    await expect(evaluation).toContainText("DataCite live catalogue");
    await expect(evaluation).toContainText("Can I use this?");
    await expect(evaluation).toContainText("Still unknown");
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-selected-1440x900.png`, fullPage: false });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-selected-1920x1080.png`, fullPage: false });
  });

  test("acquisition review remains a deliberate overlay over preserved results", async ({ page }) => {
    await mockV2Api(page, resultFixture());
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);
    await search(page, "stablecoin market evidence");

    await page.getByRole("button", { name: "Review acquisition route", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Review acquisition" });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("discover-intent-workspace")).toContainText("Acquisition review");
    await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-acquisition-1440x900.png`, fullPage: false });
  });

  test("History reads as a research lifecycle ledger, not an operations queue", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscover(page);

    await page.getByRole("tab", { name: /History/ }).click();
    const history = page.getByTestId("discover-history");
    await expect(history).toBeVisible();
    await expect(history).toContainText("Research requests and outcomes");
    await expect(history).toContainText(/Needs you|pending approval/i);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-history-1440x900.png`, fullPage: false });
  });
});
