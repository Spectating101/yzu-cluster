import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const guest = {
  version: 2,
  authenticated: true,
  principal: { id: "guest-fixture", role: "public_guest", display_name: "Guest", email: null },
  permissions: { view_research_data: true, download_research_data: true, use_ask: false, manage_research_profile: false, view_operations: false, submit_collection: false, view_faculty_profile: false },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
};
const row = (id, name, extra = {}) => ({ dataset_id: id, name, grain: "day", analysis_readiness: "instant", local_root: `lake/${id}`, source_system: "Public source", ...extra });
const datasets = {
  datasets: [
    row("bls_unemployment", "County unemployment", { tags: ["labour"], source_id: "bls_laus_county" }),
    row("btc_prices", "Bitcoin daily prices", { tags: ["bitcoin"] }),
    row("ff_factors", "Fama-French daily factors", { featured_rank: 1, tags: ["asset pricing"] }),
    row("sg_cpi", "Singapore CPI", { tags: ["inflation"], one_line: "Monthly consumer prices for Singapore." }),
    row("us_cpi", "US consumer prices", { tags: ["inflation"] }),
    row("sec_filings", "SEC company filings", { featured_rank: 2, glance: { files: 515 } }),
  ],
};

async function open(page, tab) {
  await mockV2Api(page, { datasetsBody: datasets });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, guest));
  await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("a guest's Resources page shows everything the desk reaches, with a padlock on what needs an account or a licence", async ({ page }) => {
  await open(page, "resources");
  await expect(page.getByTestId("resources-reach-stats")).toContainText("sources we collect from");
  await expect(page.getByTestId("resources-reach-stats")).toContainText("104");
  const sources = page.getByTestId("resources-reach-sources");
  await expect(sources.locator("li", { hasText: "CRSP" })).toContainText("Yuan Ze members");
  await expect(sources.locator("li", { hasText: "SEC EDGAR" })).toContainText("In the Library");
  await expect(sources.locator("li", { hasText: "FRED" })).toContainText("Collected on request");
  const access = page.getByTestId("guest-resources-access");
  await expect(access.locator("li", { hasText: "Preview, query and download" })).toContainText("Open to you");
  await expect(access.locator("li", { hasText: "Ask, the research assistant" })).toContainText("With an account");
  await expect(access.locator("li", { hasText: "LSEG, CRSP and Compustat" })).toContainText("Yuan Ze members");
});

test("a guest can try a research focus and see which datasets a profile would put first", async ({ page }) => {
  await open(page, "profile");
  const box = page.getByTestId("guest-focus-try");
  await expect(box).toBeVisible();
  await expect(box.locator("li")).toHaveCount(0);
  await box.getByRole("searchbox").fill("inflation");
  await expect(box.locator("li")).toHaveCount(2);
  await expect(box.locator("li").first()).toContainText(/consumer prices|CPI/);
  await box.getByRole("searchbox").fill("zebra husbandry");
  await expect(box.getByRole("status")).toContainText("Nothing in the Library matches");
  await expect(box.locator("li")).toHaveCount(0);
});

test("a dataset made of many files shows its file count in the Library", async ({ page }) => {
  await open(page, "library");
  await page.getByTestId("library-lens-all").click();
  const cell = page.getByTestId("library-evidence-glance").filter({ hasText: "515 files" });
  await expect(cell).toHaveCount(1);
});

test("a wide window fills the welcome card with what the Library covers, a narrower one does not", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, "home");
  const covers = page.getByTestId("home-welcome-covers");
  await expect(covers).toBeVisible();
  await expect(covers.locator("li").first()).toContainText(/\d/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(covers).toBeHidden();
});
