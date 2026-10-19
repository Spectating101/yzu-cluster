import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const WITHDRAWN = ["WHAT EVIDENCE ARE YOU LOOKING FOR", "BEST FIT", "OTHER MATCHES"];

const SURFACES = [
  ["discover", "/?tab=browse"],
  ["library", "/?tab=library"],
  ["home", "/?tab=home"],
  ["resources", "/?tab=resources"],
  ["synthesis", "/?tab=synthesis"],
];

test.describe("frozen composition guard", () => {
  for (const [name, url] of SURFACES) {
    test(`${name} does not render withdrawn July vocabulary`, async ({ page }) => {
      await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      const body = (await page.locator("body").innerText()).toUpperCase();
      for (const term of WITHDRAWN) {
        expect(body, `${name} renders withdrawn composition label "${term}"`).not.toContain(term);
      }
    });
  }

  test("discover results render withdrawn vocabulary nowhere after a search", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByLabel("Search or describe a research need").fill("mops");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(page.getByTestId("discover-result-summary")).toBeVisible();
    const body = (await page.locator("body").innerText()).toUpperCase();
    for (const term of WITHDRAWN) {
      expect(body, `discover results render withdrawn label "${term}"`).not.toContain(term);
    }
    await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-best-fit")).toHaveCount(0);
    await expect(page.locator(".rd-v2-discover-other-matches")).toHaveCount(0);
  });

  test("selection changes the Detail rail without replacing the ranked centre", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByLabel("Search or describe a research need").fill("mops");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    const ranked = page.getByTestId("discover-ranked-results");
    const candidate = ranked.locator("button.rd-v2-discover-candidate").first();
    await candidate.click();
    await expect(ranked).toBeVisible();
    await expect(candidate).toHaveClass(/selected/);
    await expect(page.locator("aside.rd-v2-rail")).toContainText("MOPS financial statements");
  });
});
