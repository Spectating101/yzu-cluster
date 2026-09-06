import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const SCALE_DATASETS = {
  datasets: Array.from({ length: 120 }, (_, index) => ({
    dataset_id: `scale_asset_${String(index + 1).padStart(3, "0")}`,
    name: `Scale asset ${String(index + 1).padStart(3, "0")}`,
    grain: "day",
    analysis_readiness: "instant",
    local_root: `research_panels/scale/${String(index + 1).padStart(3, "0")}`,
    source: "Scale test authority",
    coverage: "2020–2026",
    join_keys: ["date"],
  })),
};

test.describe("Library pagination continuity", () => {
  test("live refresh preserves expanded evidence depth", async ({ page }) => {
    await mockV2Api(page, { datasetsBody: SCALE_DATASETS });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const pagination = page.getByLabel("Library evidence pagination");
    await expect(pagination).toContainText("Showing 50 of 120 assets");
    await pagination.getByRole("button", { name: "Load 50 more" }).click();
    await expect(pagination).toContainText("Showing 100 of 120 assets");
    await expect(page.getByTestId("library-evidence-row")).toHaveCount(100);

    const refreshed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/datasets") && response.request().method() === "GET";
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await refreshed;

    await expect(pagination).toContainText("Showing 100 of 120 assets");
    await expect(page.getByTestId("library-evidence-row")).toHaveCount(100);
  });
});
