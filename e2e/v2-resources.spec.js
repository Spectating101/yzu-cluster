import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import { MOCK_RESOURCES_ROLLUP } from "./fixtures/mockResourcesRollup.js";

function capabilityRegion(page) {
  return page.getByRole("region", { name: "Capacity and access" });
}

test.describe("RC3 Resources", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Capabilities separates source access, execution, and evidence-estate capacity", async ({ page }) => {
    await expect(page.locator("main").getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capabilities", exact: true })).toHaveClass(/on/);
    const region = capabilityRegion(page);
    await expect(region).toContainText("Source access");
    await expect(region).toContainText("Execution");
    await expect(region).toContainText("Evidence estate");
    await expect(region.locator(".rd-rc3-capability-row").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review queue" })).toHaveCount(0);
  });

  test("a capability row remains inspectable through the persistent rail", async ({ page }) => {
    const row = capabilityRegion(page).locator(".rd-rc3-capability-row").first();
    const label = (await row.locator("strong").innerText()).trim();
    await row.click();

    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(label);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Resources");
  });

  test("right rail starts with global lab capability context", async ({ page }) => {
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("Resources");
    await expect(rail).toContainText("Lab capacity");
    await expect(rail.getByRole("button", { name: "Open activity" })).toBeVisible();
  });

  test("Usage shows metered summary and attributable activity without owning approvals", async ({ page }) => {
    const main = page.locator("main");
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await expect(page.getByRole("button", { name: "Usage", exact: true })).toHaveClass(/on/);
    await expect(main.getByRole("region", { name: "Usage report" })).toContainText("Remote tables");
    await expect(main.locator(".rd-rc3-usage-log")).toContainText("What research work consumed the desk");
    await expect(main.locator(".rd-rc3-usage-log button").first()).toBeVisible();
    await expect(main.getByRole("heading", { name: "Review queue" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
  });

  test("Usage can be narrowed to discovery activity", async ({ page }) => {
    const main = page.locator("main");
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await main.getByRole("button", { name: "Discovery", exact: true }).click();
    await expect(main.getByRole("button", { name: "Discovery", exact: true })).toHaveClass(/on/);
    await expect(main.locator(".rd-rc3-usage-log")).toBeVisible();
    await expect(main.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
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

test("RC3 Resources loading state does not flash capability summaries", async ({ page }) => {
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
  await expect(main.locator(".rd-rc3-capability-hero")).toHaveCount(0);

  releaseResources();
  await waitForShell(page);
  await expect(capabilityRegion(page)).toBeVisible();
});
