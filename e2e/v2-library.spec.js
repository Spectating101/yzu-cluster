import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Library directory and Asset Workspace", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Lab root remains a dense folder-first directory", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    await expect(page.locator(".rd-v2-library-pathbar")).toContainText("Lab root");
    await expect(page.locator(".rd-v2-library-pathbar")).toContainText(/2\s*folders/i);
    await expect(page.locator('.rd-v2-catalog button.row[data-kind="folder"]', { hasText: "Research panels" })).toBeVisible();
    await expect(page.getByTestId("asset-workspace")).toHaveCount(0);
    await expect(page.locator(".rd-v2-rail-selection")).toHaveText("Lab root");
  });

  test("selecting a dataset opens main-canvas Asset Workspace with observed/unknown facts", async ({ page }) => {
    await page.locator('.rd-v2-catalog button.row[data-kind="folder"]', { hasText: "Research panels" }).click();
    await page.locator('.rd-v2-catalog button.row[data-kind="folder"]', { hasText: "gdelt" }).click();
    await page.locator('.rd-v2-catalog button.row[data-kind="dataset"]').click();

    const workspace = page.getByTestId("asset-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole("tablist", { name: "Asset sections" })).toContainText("Overview");
    await expect(workspace.getByRole("tablist")).toContainText("Fields");
    await expect(workspace.getByRole("tablist")).toContainText("Quality");
    await expect(workspace.getByRole("tablist")).toContainText("Provenance");
    await expect(page.getByTestId("asset-overview-observed")).toContainText("Observed registry facts");
    await expect(page.getByTestId("asset-overview-unknown").or(page.getByTestId("asset-overview-observed"))).toBeVisible();

    await workspace.getByRole("button", { name: "Quality" }).click();
    await expect(page.getByTestId("asset-quality-unknown")).toContainText("Quality score");

    const rail = page.locator("aside.rd-v2-rail");
    const detail = rail.getByTestId("detail-panel");
    await expect(detail).toHaveAttribute("data-detail-mode", "decision");
    await expect(detail.getByTestId("rail-judgment")).toContainText(/Query-ready|holding/i);
    await expect(detail.getByTestId("rail-confirmed")).toHaveCount(0);
    await expect(detail).not.toContainText("Vault path");
    await expect(detail).not.toContainText("Schema & join keys");
    await expect(detail).not.toContainText("GDELT Gkg");
    await expect(rail.getByRole("button", { name: "Preview rows" })).toBeVisible();
    await expect(rail.getByRole("button", { name: /Ask about this/i })).toBeVisible();
  });

  test("Library dataset deep link opens Asset Workspace with decision Detail", async ({ page }) => {
    await page.goto(
      "/?tab=library&folder=research_panels/gdelt&dataset=gdelt_asia_daily_country_panel",
      { waitUntil: "domcontentloaded" },
    );
    await waitForShell(page);

    const workspace = page.getByTestId("asset-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Asia daily news-risk panel");
    await expect(page.getByTestId("asset-overview-observed")).toBeVisible();

    const detail = page.locator("aside.rd-v2-rail").getByTestId("detail-panel");
    await expect(detail).toHaveAttribute("data-detail-mode", "decision");
    await expect(detail.getByTestId("rail-confirmed")).toHaveCount(0);
    await expect(detail.getByTestId("rail-judgment")).toBeVisible();
    await expect(page).toHaveURL(/dataset=gdelt_asia_daily_country_panel/);
  });

  test("URL / DOI intake promises draft job after durable id", async ({ page }) => {
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    await page.getByRole("menuitem", { name: /Add URL \/ DOI/ }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("Draft intake");
    await expect(rail).toContainText(/Ask-assisted draft until durable job id/i);
    await expect(rail.getByRole("button", { name: "Queue draft intake" })).toBeDisabled();

    await rail.locator("#rd-v2-rail-url-input").fill("https://doi.org/10.1234/example");
    await rail.getByRole("button", { name: "Queue draft intake" }).click();
    await expect(page.locator(".rd-v2-rail-toggle button.on", { hasText: "Ask" })).toBeVisible();
    await expect(page.getByTestId("ask-messages")).toContainText("https://doi.org/10.1234/example");
  });

  test("local upload reflects staging availability from resources rollup", async ({ page }) => {
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    const uploadItem = page.getByRole("menuitem", { name: /Upload/ });
    await expect(uploadItem).toBeEnabled();
    await uploadItem.click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("Upload files");
    await expect(rail).toContainText("Controller staging reported");
  });

  test("local upload stays disabled when staging is not reported", async ({ page }) => {
    await page.route("**/library/desk/resources*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          hero: {},
          usage: { vault: { used_tb: 1, cap_tb: 5 } },
          activity: { events: [] },
        }),
      }),
    );
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator(".rd-v2-library-capability-note")).toContainText(/staging/i);
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    const uploadItem = page.getByRole("menuitem", { name: /Upload/ });
    await expect(uploadItem).toBeDisabled();
  });
});

test.describe("v2 Library navigation", () => {
  test("entering Library from sidebar lands on the branch rail", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.locator(".rd-v2-rail-selection")).toHaveText("Lab root");
    await expect(page.getByTestId("asset-workspace")).toHaveCount(0);
  });
});
