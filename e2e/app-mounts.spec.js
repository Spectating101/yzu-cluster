import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// The release check that missed a blank-page deploy was "every removed string is
// gone from the built bundle". Vite compiles an undefined identifier inside JSX
// without complaint, so the build passed, the strings checked out, and nothing
// mounted. Only loading the page in a browser can see that. One assertion per
// destination, so a crash names the page it came from.
const TABS = ["home", "library", "browse", "discover", "synthesis", "resources", "history", "profile", "settings"];

for (const tab of TABS) {
  test(`${tab} mounts with no uncaught error`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error.message)));
    await mockV2Api(page);
    await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-shell")).toBeVisible();
    expect(errors, `uncaught error while mounting ${tab}: ${errors[0] || ""}`).toEqual([]);
  });
}

test("a deep link to a removed destination still mounts the shell", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message)));
  await mockV2Api(page);
  await page.goto("/?tab=cluster", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  expect(errors).toEqual([]);
});
