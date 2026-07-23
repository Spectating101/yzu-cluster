import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import { MOCK_RESOURCES_ROLLUP } from "./fixtures/mockResourcesRollup.js";

test.describe("v2 Resources Capabilities and Usage", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Capabilities is the default centre and omits activity ledger ownership", async ({ page }) => {
    await expect(page.locator("main").getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capabilities", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usage", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Overview", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Activity", exact: true })).toHaveCount(0);

    const main = page.locator("main");
    await expect(main.getByRole("region", { name: "Key resources" })).toBeVisible();
    await expect(main.getByRole("region", { name: "Key resources" })).toContainText("Storage");
    await expect(main.getByRole("region", { name: "Key resources" })).toContainText("Accounts & limits");
    await expect(main.getByRole("region", { name: "Key resources" })).not.toContainText("Procurement jobs");
    await expect(main.getByRole("heading", { name: "Run log" })).toHaveCount(0);
    await expect(main.getByTestId("resources-activity-controls")).toHaveCount(0);
  });

  test("Resources primary mode is Capabilities on deep link and after Usage toggle", async ({ page }) => {
    const capabilities = page.getByRole("button", { name: "Capabilities", exact: true });
    const usage = page.getByRole("button", { name: "Usage", exact: true });
    await expect(capabilities).toHaveClass(/on/);
    await expect(page.locator("main").getByRole("region", { name: "Key resources" })).toContainText("Storage");

    await usage.click();
    await expect(usage).toHaveClass(/on/);
    await expect(page.locator("main").getByRole("region", { name: "Key resources" })).toContainText(
      /Storage usage|Metered usage/,
    );

    await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("button", { name: "Capabilities", exact: true })).toHaveClass(/on/);
    await expect(page.getByRole("button", { name: "Activity", exact: true })).toHaveCount(0);
    await expect(page.locator("main").getByRole("heading", { name: "Run log" })).toHaveCount(0);
  });

  test("job handoff routes approval recovery to Discover History", async ({ page }) => {
    const handoff = page.getByRole("region", { name: "Job handoff to Discover" });
    await expect(handoff).toBeVisible({ timeout: 15_000 });
    await expect(handoff).toContainText("Discover History");
    await expect(page.locator("main")).not.toContainText(/connector details stay in Activity/i);
    await handoff.getByRole("button", { name: "Open Discover History" }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /History/ })).toHaveAttribute("aria-selected", "true");
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(/MOPS financial statements/i);
  });

  test("Usage tab shows storage/metered facts without run log", async ({ page }) => {
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    const main = page.locator("main");
    await expect(main.getByRole("region", { name: "Key resources" })).toContainText(/Storage usage|Metered usage/);
    await expect(main.getByRole("heading", { name: "Run log" })).toHaveCount(0);
  });

  test("inventory row still opens the matching rail resource", async ({ page }) => {
    const inventory = page.getByRole("region", { name: "Key resources" });
    await inventory.locator('[data-kind="source"]', { hasText: "Source routes" }).click();

    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("Source routes");
    await expect(rail).toContainText("3 routes configured");
  });

  test("refresh chip refetches resources rollup", async ({ page }) => {
    let rollupCalls = 0;
    await page.route("**/library/desk/resources*", (route) => {
      rollupCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", hero: {}, spending: {}, activity: { events: [] } }),
      });
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(500);
    expect(rollupCalls).toBeGreaterThan(0);
  });
});

test("v2 Resources loading state does not flash account summary", async ({ page }) => {
  let releaseResources;
  const resourcesGate = new Promise((resolve) => {
    releaseResources = resolve;
  });
  await mockV2Api(page);
  await page.route("**/library/desk/resources*", async (route) => {
    await resourcesGate;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RESOURCES_ROLLUP),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });

  const main = page.locator("main");
  await expect(main).toContainText(/Refreshing|Loading resources/);
  await expect(main.getByText("Current status")).toHaveCount(0);
  await expect(main.getByText("Account summary")).toHaveCount(0);

  releaseResources();
  await waitForShell(page);
  await expect(main.getByRole("region", { name: "Key resources" })).toBeVisible();
});
