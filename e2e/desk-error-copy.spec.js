import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// The live desk rendered the API's own 401 message as body copy, twice, telling
// a researcher to set an HTTP header on a page about research constructions.
test("an unauthenticated desk explains itself without naming a header", async ({ page }) => {
  await mockV2Api(page);
  for (const p of ["**/library/synthesis/profiles*", "**/library/synthesis/threads*"]) {
    await page.unroute(p).catch(() => {});
    await page.route(p, (route) => route.fulfill({
      status: 401, contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized",
        message: "Desk access token required (set Authorization: Bearer or X-Desk-Token)" }),
    }));
  }
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const err = page.getByTestId("desk-error").first();
  await expect(err).toBeVisible();
  await expect(err).toContainText("This desk needs a session");
  await expect(err.locator("p")).not.toContainText("Bearer");
  await expect(err.locator("p")).not.toContainText("X-Desk-Token");

  // the original stays reachable for whoever is debugging, just not as prose
  await expect(err.locator("details code")).toContainText("X-Desk-Token");
});
