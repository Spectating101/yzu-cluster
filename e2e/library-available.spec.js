import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const guest = {
  version: 2,
  authenticated: true,
  principal: { id: "guest-fixture", role: "public_guest", display_name: "Guest", email: null },
  permissions: { view_research_data: true, download_research_data: true, use_ask: false, manage_research_profile: false, view_operations: false, submit_collection: false, view_faculty_profile: false },
  session: { member_sign_in_available: true },
};
const datasets = {
  datasets: [
    { dataset_id: "ff", name: "Fama-French factors", grain: "day", analysis_readiness: "instant", local_root: "lake/ff", source_system: "Ken French", featured_rank: 1 },
    {
      dataset_id: "usgs", name: "USGS earthquake catalogue", grain: "event", analysis_readiness: "registered", source_access_mode: "catalog_only",
      source_system: "U.S. Geological Survey", library_available: true,
      description: "Worldwide earthquake events with time, location and magnitude.",
    },
  ],
};

test("a dataset we can collect but have not downloaded is listed honestly and points to Discover", async ({ page }) => {
  await mockV2Api(page, { datasetsBody: datasets });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, guest));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-lens-all").click();
  const row = page.getByTestId("library-evidence-row").filter({ hasText: "USGS earthquake catalogue" });
  await expect(row).toContainText("Available to collect");
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "Fama-French" })).toContainText("Ready to query");
  await row.click();
  const workspace = page.getByTestId("library-asset-workspace");
  await expect(workspace).toBeVisible();
  await workspace.getByTestId("library-find-in-discover").click();
  await expect(page).toHaveURL(/tab=discover/);
});
