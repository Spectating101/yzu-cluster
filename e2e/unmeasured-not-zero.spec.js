import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// Seen on the live desk: unauthenticated, Library reported "0 datasets ·
// 0 shelves · 0 query-ready" as though it had measured them. It had not — the
// request 401'd. App captured the failure in loadError and no component ever
// read it. Reporting an unmeasured quantity as a measurement is the one thing
// this product exists not to do.
test("a Library that could not load says so instead of reporting zero", async ({ page }) => {
  await mockV2Api(page);
  await page.unroute("**/datasets**").catch(() => {});
  await page.route("**/datasets**", (route) => route.fulfill({
    status: 401, contentType: "application/json",
    body: JSON.stringify({ error: "Unauthorized",
      message: "Desk access token required (set Authorization: Bearer or X-Desk-Token)" }),
  }));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const err = page.getByTestId("desk-error").first();
  await expect(err).toBeVisible();
  await expect(err).toContainText("This desk needs a session");
  await expect(err.locator("p")).not.toContainText("Bearer");
});
