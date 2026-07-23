import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import { MOCK_RESOURCES_ROLLUP } from "./fixtures/mockResourcesRollup.js";

test.describe("Resources operational summary", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Overview leads with operations status and Databank state", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Overview", exact: true })).toHaveClass(/on/);
    const status = main.getByRole("region", { name: "Operations status" });
    await expect(status).toContainText("Ask usage");
    await expect(status).toContainText("Collection workers");
    await expect(status).toContainText("Lab vault");
    await expect(status).toContainText("Desk connection");
    await expect(main.getByRole("region", { name: "Databank status" })).toBeVisible();
  });

  test("key resource rows remain inspectable through the persistent rail", async ({ page }) => {
    const main = page.locator("main");
    const row = main.locator(".rd-recovery-resource-row").first();
    const label = (await row.locator("strong").innerText()).trim();
    await row.click();
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(label);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Resources");
  });

  test("right rail separates actionable work from capacity observations", async ({ page }) => {
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("Resources");
    await expect(rail).toContainText("Lab capacity");
    await expect(rail).toContainText("1 action needs review");
    await expect(rail).toContainText("1 capacity observation");
    await expect(rail).not.toContainText("2 items need attention");
    await expect(rail.getByRole("button", { name: "Open activity" })).toBeVisible();
  });

  test("Activity shows metered summary and attributable work without owning approvals", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(main.getByRole("button", { name: "Activity", exact: true })).toHaveClass(/on/);
    await expect(main.getByRole("region", { name: "Usage report" })).toContainText("Remote tables");
    await expect(main.locator(".rd-rc3-usage-log")).toContainText("What research work consumed the desk");
    await expect(main.locator(".rd-rc3-usage-log button").first()).toBeVisible();
    await expect(main.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
  });

  test("Activity can be narrowed to discovery work", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Activity", exact: true }).click();
    await main.getByRole("button", { name: "Discovery", exact: true }).click();
    await expect(main.getByRole("button", { name: "Discovery", exact: true })).toHaveClass(/on/);
    await expect(main.locator(".rd-rc3-usage-log")).toBeVisible();
  });

  test("refresh refetches resources rollup", async ({ page }) => {
    let rollupCalls = 0;
    await page.route("**/library/desk/resources*", (route) => {
      rollupCalls += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", hero: {}, spending: {}, activity: { events: [] } }) });
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(500);
    expect(rollupCalls).toBeGreaterThan(0);
  });
});

test("Resources loading state does not flash operational summaries", async ({ page }) => {
  let releaseResources;
  const resourcesGate = new Promise((resolve) => { releaseResources = resolve; });
  await mockV2Api(page);
  await page.route("**/library/desk/resources*", async (route) => {
    await resourcesGate;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESOURCES_ROLLUP) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });

  const main = page.locator("main");
  await expect(main.getByRole("status")).toContainText("Loading resources");
  await expect(main.locator(".rd-recovery-resources-strip")).toHaveCount(0);

  releaseResources();
  await waitForShell(page);
  await expect(main.getByRole("region", { name: "Operations status" })).toBeVisible();
});
