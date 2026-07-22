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

  test("Capabilities shows source access, execution, and evidence-estate capacity", async ({ page }) => {
    await expect(page.locator("main").getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capabilities", exact: true })).toBeVisible();
    const region = capabilityRegion(page);
    await expect(region).toContainText("Source access");
    await expect(region).toContainText("Execution");
    await expect(region).toContainText("Evidence estate");
    await expect(region.locator('[data-kind="metered"]', { hasText: "BigQuery" })).toBeVisible();
    await expect(region.locator('[data-kind="source"]')).not.toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Review queue" })).toHaveCount(0);
  });

  test("capability row opens the matching rail resource", async ({ page }) => {
    const region = capabilityRegion(page);
    const row = region.locator('[data-kind="source"]').first();
    const label = (await row.locator("strong").innerText()).trim();
    await row.click();

    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(label);
  });

  test("selected account limit can be sent to context-bound Ask", async ({ page }) => {
    const region = capabilityRegion(page);
    await region.locator('[data-kind="metered"]', { hasText: "BigQuery" }).click();

    const rail = page.getByRole("complementary", { name: "Inspector" });
    await rail.getByRole("button", { name: "Ask about this →" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Resources");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("BigQuery");
  });

  test("right rail starts with global lab capability context", async ({ page }) => {
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("Resources");
    await expect(rail).toContainText("Lab capacity");
    await expect(rail.getByRole("button", { name: "Open activity" })).toBeVisible();
  });

  test("Usage shows metered summary and attributable research activity", async ({ page }) => {
    const main = page.locator("main");
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await expect(main.getByRole("region", { name: "Usage report" })).toContainText("Remote tables");
    await expect(main.locator(".rd-rc3-usage-log")).toContainText("What research work consumed the desk");
    await expect(main.getByText("get Taiwan gov panel")).toBeVisible();
    await expect(main.getByText("taiwan equity")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Review queue" })).toHaveCount(0);
  });

  test("Usage filters activity without taking lifecycle ownership", async ({ page }) => {
    const main = page.locator("main");
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await main.getByRole("button", { name: "Discovery", exact: true }).click();
    await expect(main.getByRole("button", { name: "Discovery", exact: true })).toHaveClass(/on/);
    await expect(main.getByText("taiwan equity")).toBeVisible();
    await expect(main.getByText("get Taiwan gov panel")).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
  });

  test("rail usage drill-down opens the Usage view with a filter", async ({ page }) => {
    await capabilityRegion(page).locator('[data-kind="metered"]', { hasText: "BigQuery" }).click();
    await page.locator("aside").getByRole("button", { name: "View activity →" }).click();
    await expect(page.getByRole("button", { name: "Usage", exact: true })).toHaveClass(/on/);
    await expect(page.getByText("get Taiwan gov panel")).toBeVisible();
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
