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
  datasets: [{
    dataset_id: "fred_yields", name: "Treasury yields", grain: "day", analysis_readiness: "query_ready",
    local_root: "lake/fred_yields", source_system: "FRED", featured_rank: 1, revision_id: "rev 7",
    full_download: "/library/datasets/fred_yields/download?revision=rev%207",
    download_name: "us_treasury_yields_daily",
  }],
};

test("Use this dataset offers every download format and a snippet that opens the downloaded file", async ({ page }) => {
  await mockV2Api(page, { datasetsBody: datasets });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, guest));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-evidence-row").first().click();
  const menu = page.getByTestId("library-use-dataset");
  await menu.locator("summary").click();
  for (const format of ["csv", "xlsx", "dta", "parquet"]) {
    await expect(page.getByTestId(`library-download-${format}`)).toHaveAttribute("href", new RegExp(`/library/datasets/fred_yields/download\\?revision=rev%207&format=${format}$`));
  }
  await expect(page.getByTestId("library-use-dataset-code")).toHaveText('use "us_treasury_yields_daily.dta", clear');
  await page.getByRole("tab", { name: "Python" }).click();
  await expect(page.getByTestId("library-use-dataset-code")).toContainText('pd.read_csv("us_treasury_yields_daily.csv")');
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("library-workspace-download")).toBeVisible();
});
