import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("keyboard access and load recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the first Tab offers Skip to main content, which moves focus into the page", async ({ page }) => {
    await mockV2Api(page);
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.locator("body").focus();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect.poll(async () => (await skip.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#rd-main")).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("main#rd-main")))).toBe(true);
  });

  test("Tab inside the dataset inspector never lands on the Library behind its backdrop", async ({ page }) => {
    await mockV2Api(page);
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const row = page.getByTestId("library-evidence-row").first();
    await row.click();
    await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      const behind = await page.evaluate(() => Boolean(document.activeElement?.closest(".rd-v2-library-page")));
      expect(behind, `Tab ${i + 1} reached the Library behind the inspector`).toBe(false);
    }
    await page.getByRole("button", { name: "Close data inspector" }).click();
    await expect(page.getByTestId("library-asset-workspace")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector(".rd-v2-library-page")?.inert)).toBe(false);
  });

  test("a failed Library load says so with Try again, and retrying recovers", async ({ page }) => {
    await mockV2Api(page);
    let failing = true;
    await page.route("**/api/datasets", async (route) => {
      if (failing) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
      return route.fallback();
    });
    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const error = page.getByTestId("desk-error");
    await expect(error).toContainText("That did not load");
    failing = false;
    await error.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("desk-error")).toHaveCount(0);
  });
});
