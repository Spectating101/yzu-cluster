import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function openLibrarySearch(page, query) {
  await mockV2Api(page);
  await page.route("**/api/library/packages/prepare", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const request = route.request().postDataJSON();
    const ids = request.dataset_ids || [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        package_id: "pkg-us-fire-polling",
        status: "ready",
        research_need: request.research_need,
        included: ids.slice(0, 1).map((dataset_id) => ({ dataset_id })),
        metadata_only: ids.slice(1, 2).map((dataset_id) => ({ dataset_id, reason: "no_exportable_local_file" })),
        excluded: [],
        data_file_count: ids.length ? 1 : 0,
        data_bytes: ids.length ? 184_000_000 : 0,
        sufficiency_claim: false,
        archive: { name: "research-drive-package-pkg-us-fire-polling.zip", bytes: 42_000_000 },
        download_path: "/library/packages/pkg-us-fire-polling/download",
      }),
    });
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("textbox", { name: "Search library holdings" }).fill(query);
}

test.describe("Library research packages", () => {
  test("matched held evidence can be reviewed, prepared, and downloaded without claiming sufficiency", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let prepareCount = 0;
    let preparedBody = null;

    await mockV2Api(page);
    await page.route("**/api/library/packages/prepare", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      prepareCount += 1;
      preparedBody = route.request().postDataJSON();
      const ids = preparedBody.dataset_ids || [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          package_id: "pkg-us-fire-polling",
          status: "ready",
          research_need: preparedBody.research_need,
          included: ids.slice(0, 1).map((dataset_id) => ({ dataset_id })),
          metadata_only: ids.slice(1, 2).map((dataset_id) => ({ dataset_id, reason: "no_exportable_local_file" })),
          excluded: [],
          data_file_count: 1,
          data_bytes: 184_000_000,
          sufficiency_claim: false,
          archive: { name: "research-drive-package-pkg-us-fire-polling.zip", bytes: 42_000_000 },
          download_path: "/library/packages/pkg-us-fire-polling/download",
        }),
      });
    });

    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");

    const context = page.getByTestId("library-package-context");
    await expect(context).toBeVisible();
    await expect(context).toContainText("Held evidence for this request");
    await expect(context.getByRole("button", { name: "Ask Library" })).toBeVisible();
    const open = page.getByTestId("library-package-open");
    await expect(open).toBeVisible();
    expect(prepareCount).toBe(0);

    await open.click();
    const panel = page.getByTestId("library-package-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Prepare research package");
    await expect(page.getByTestId("library-package-research-need")).toContainText("Asia");
    await expect(panel.getByRole("checkbox").first()).toBeChecked();
    expect(prepareCount).toBe(0);

    await page.getByTestId("library-package-prepare").click();
    await expect(page.getByTestId("library-package-ready")).toBeVisible();
    expect(prepareCount).toBe(1);
    expect(preparedBody.research_need).toBe("Asia");
    expect(preparedBody.dataset_ids.length).toBeGreaterThan(0);

    const ready = page.getByTestId("library-package-ready");
    await expect(ready).toContainText("included as data");
    await expect(ready).toContainText("metadata/access only");
    await expect(ready).toContainText("does not by itself establish analytical sufficiency");
    const download = page.getByTestId("library-package-download");
    await expect(download).toHaveAttribute("href", "/api/library/packages/pkg-us-fire-polling/download");
    await expect(download).toHaveAttribute("download", "");
  });

  test("no held match never offers a fake package action", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLibrarySearch(page, "definitely-not-held-zzzz");
    await expect(page.getByTestId("library-evidence-empty")).toContainText("No held evidence matches");
    await expect(page.getByTestId("library-package-open")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search wider in Discover" })).toBeVisible();
  });

  test("package review stays contained on phone geometry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLibrarySearch(page, "Asia");
    await page.getByTestId("library-package-open").click();
    const panel = page.getByTestId("library-package-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Prepare package" })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      panelRight: document.querySelector('[data-testid="library-package-panel"]')?.getBoundingClientRect().right || 0,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.panelRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  });
});
