import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// One destination had two names: the nav said Discover, the tab id said browse,
// and a measurement labelled "browse" turned out to be the screen a screenshot
// labelled "discover". "discover" is canonical now; "browse" must keep working
// because roughly a hundred call sites emit it and saved links use it.
for (const spelling of ["discover", "browse"]) {
  test(`?tab=${spelling} lands on Discover`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    await mockV2Api(page);
    await page.goto(`/?tab=${spelling}`, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-page-head h1")).toContainText("Discover");
    await expect(page.getByTestId("discover-browse-mode")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("the sidebar marks Discover active for either spelling", async ({ page }) => {
  await mockV2Api(page);
  for (const spelling of ["discover", "browse"]) {
    await page.goto(`/?tab=${spelling}`, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const active = page.locator("aside.yzu-sidebar nav button.active").first();
    await expect(active).toContainText("Discover");
  }
});
