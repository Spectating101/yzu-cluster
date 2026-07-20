import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell, MOCK_HEALTH } from "./fixtures/v2MockApi.js";

async function openTab(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

test.describe("Research Drive interaction guidance", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("readiness states explain themselves on hover and keyboard focus", async ({ page }) => {
    const help = page.getByRole("button", { name: /^Explain / }).first();
    await expect(help).toBeVisible();

    await help.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/Registered|Available|Research Drive/);

    await page.mouse.move(0, 0);
    await help.focus();
    await expect(tooltip).toBeVisible();
  });

  test("context help also opens by tap-sized click on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const help = page.getByRole("button", { name: /^Explain / }).first();
    await help.click();
    await expect(page.getByRole("tooltip")).toBeVisible();
  });

  test("Settings accepts an active runtime identity when the boolean signal is omitted", async ({ page }) => {
    const health = {
      ...MOCK_HEALTH,
      desk: {
        ...MOCK_HEALTH.desk,
        composer_configured: undefined,
        composer_model: "composer-2.5",
      },
    };
    await page.route("**/health*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await openTab(page, "Settings");

    const summary = page.getByRole("region", { name: "Research desk status" });
    const assistant = summary.locator(".rd-v2-settings-summary-card").filter({ hasText: "Research assistant" });
    await expect(assistant).toContainText("Ready");
    await expect(assistant).toContainText("composer-2.5");
    await expect(assistant).not.toContainText("Needs setup");
  });

  test("motion is present by default and suppressed for reduced-motion users", async ({ page }) => {
    const normalAnimation = await page.locator(".rd-v2-page").evaluate((node) => getComputedStyle(node).animationName);
    expect(normalAnimation).toContain("rd-page-enter");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const reducedAnimation = await page.locator(".rd-v2-page").evaluate((node) => getComputedStyle(node).animationName);
    expect(reducedAnimation).toBe("none");
  });
});
