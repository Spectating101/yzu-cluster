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
const row = (id, name, extra = {}) => ({ dataset_id: id, name, grain: "day", analysis_readiness: "instant", local_root: `lake/${id}`, source_system: "Public source", ...extra });
const datasets = {
  datasets: [
    row("tickers", "SEC company ticker list", {
      featured_rank: 1,
      source_system: "SEC EDGAR",
      sources: [
        { dataset_id: "tickers", name: "SEC company ticker list", source_system: "SEC EDGAR", held: true },
        { dataset_id: "tickers_mirror", name: "Ticker list (vendor copy)", source_system: "Vendor mirror", held: false },
      ],
    }),
    row("fred", "Treasury yields", { featured_rank: 2, source_system: "FRED" }),
  ],
};

async function open(page) {
  await mockV2Api(page, { datasetsBody: datasets });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, guest));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("a dataset from several sources says so in the list and lists them in its view", async ({ page }) => {
  await open(page);
  const rows = page.getByTestId("library-evidence-row");
  await expect(rows.first()).toContainText("SEC EDGAR + Vendor mirror");
  await expect(rows.nth(1)).toContainText("FRED");
  await expect(rows.nth(1)).not.toContainText("+");
  await rows.first().click();
  const sources = page.getByTestId("library-sources");
  await expect(sources).toContainText("Available from 2 sources");
  await expect(sources.locator("li")).toHaveCount(2);
  await expect(sources).toContainText("In the Library");
  await expect(sources).toContainText("Available to collect");
});

test("a dataset with one source shows no sources block", async ({ page }) => {
  await open(page);
  await page.getByTestId("library-evidence-row").nth(1).click();
  await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
  await expect(page.getByTestId("library-sources")).toHaveCount(0);
});
