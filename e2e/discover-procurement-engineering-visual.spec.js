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

async function assertNoHorizontalOverflow(page) {
  const result = await page.locator("main.yzu-main").evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(result.scroll).toBeLessThanOrEqual(result.client + 2);
}

test("compiled procurement engineering stays visually subordinate to route review", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mkdir(OUT, { recursive: true });
  await mockV2Api(page, {
    discoverBody: { sections: [], total: 0 },
    discoverSourcesBody: {
      results: [{
        kind: "artifact",
        source_id: "example_public",
        candidate_key: "source:example_public",
        title: "Example public research files",
        description: "Public CSV files from a source that explicitly advertises acquisition availability.",
        url: "https://example.com/data.csv",
        access_mode: "public_http",
        acquisition_available: true,
        query_relevance: 2,
      }],
      total: 1,
    },
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openDiscover(page);
  await search(page, "example public research files");
  await page.getByTestId("discover-ranked-results").getByRole("button", { name: "Review acquisition route" }).click();

  const dialog = page.getByRole("dialog", { name: "Review acquisition" });
  const workspace = page.getByTestId("discover-intent-workspace");
  const engineering = workspace.getByTestId("discover-procurement-engineering");
  await expect(dialog).toBeVisible();
  await expect(engineering).toBeVisible();
  await expect(engineering).toContainText("Compiled · HTTP acquisition");
  await expect(engineering).toContainText("http · runtime placement · baseline sizing");
  await expect(engineering).toContainText("preflight recommended · single claim");
  await expect(engineering).not.toContainText(/worker-[0-9]|assigned worker|contract hash/i);

  const engineeringBox = await engineering.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(engineeringBox && dialogBox).toBeTruthy();
  expect(engineeringBox.height, "engineering strip should remain compact").toBeLessThan(100);
  expect(engineeringBox.height / dialogBox.height, "engineering strip should remain subordinate to acquisition review").toBeLessThan(0.16);

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/discover-engineered-acquisition-1440x900.png`, fullPage: false });
});
