import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell, MOCK_HEALTH } from "./fixtures/v2MockApi.js";

async function openSettingsFromAccount(page) {
  await page.getByTestId("header-account-menu").click();
  await page.getByRole("menuitem", { name: /Workspace preferences/ }).click();
  await waitForShell(page);
}

test.describe("Research Drive interaction guidance", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("catalog status remains valid non-interactive markup and Detail owns guidance", async ({ page }) => {
    const row = page.locator(".rd-v2-home-recent button.row").first();
    await expect(row).toBeVisible();
    await expect(row.locator("button")).toHaveCount(0);
    await expect(row.locator(".rd-v2-status-pill")).toBeVisible();
    await row.click();

    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.getByRole("tab", { name: "Detail" })).toHaveAttribute("aria-selected", "true");
    await expect(rail).toContainText(/Query ready|Registered|Connected/);
    await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();
  });

  test("account guidance is keyboard reachable and remains inside the mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const trigger = page.getByTestId("header-account-menu");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
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
    await page.unroute("**/health*");
    await page.route("**/health*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await openSettingsFromAccount(page);

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
