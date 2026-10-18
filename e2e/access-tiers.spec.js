import { expect, test } from "@playwright/test";
import { MOCK_DATASETS, MOCK_DISCOVER_ASSESSMENT, MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const access = (role) => ({
  version: 2,
  authenticated: true,
  principal: { id: `${role}-fixture`, role, display_name: role, email: role === "public_guest" ? null : "alice@example.test" },
  permissions: {
    view_research_data: true,
    download_research_data: role !== "public_guest",
    view_licensed_data: role === "member",
    use_ask: role !== "public_guest",
    manage_research_profile: role !== "public_guest",
    view_operations: false,
    submit_collection: role === "member",
    view_faculty_profile: false,
  },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
});

const LICENSED = {
  dataset_id: "refinitiv_esg_snapshot",
  name: "LSEG ESG pillar snapshot",
  grain: "issuer",
  analysis_readiness: "instant",
  local_root: "refinitiv_backfill",
  source_id: "lseg_edp",
  source_system: "LSEG Workspace / EDP (YZU seat)",
  licensed: true,
  access: "yzu_members",
  rows_available: false,
  row_count: 570,
  coverage: "Snapshot pulled 2026-07-06",
  join_keys: ["ric"],
  best_use: "ESG factor overlays on equity panels",
  limitations: "Snapshot only; not time series.",
};

async function explore(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

test("a guest's question gets Library results and an invitation, not a coverage check", async ({ page }) => {
  await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT, assessmentBody: MOCK_DISCOVER_ASSESSMENT });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("public_guest")));
  const assessments = [];
  page.on("request", (request) => { if (request.url().includes("/library/discover/assessment")) assessments.push(request.method()); });
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await explore(page, "Do we hold issuer-quarter governance data for Taiwan?");
  await expect(page.locator(".rd-v2-evidence-brief.is-workspace")).toHaveCount(0);
  await page.getByTestId("discover-assess-coverage").click();

  const invite = page.getByTestId("discover-assessment-needs-account");
  await expect(invite).toContainText("The coverage check needs a free account");
  expect(assessments).toEqual([]);
  await invite.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("access-screen")).toBeVisible();
});

test("a public account gets the coverage check", async ({ page }) => {
  await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT, assessmentBody: MOCK_DISCOVER_ASSESSMENT });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("public_member")));
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await explore(page, "Do we hold issuer-quarter governance data for Taiwan?");
  await expect(page.locator(".rd-v2-evidence-brief.is-workspace").getByTestId("discover-verdict")).toBeVisible();
  await expect(page.getByTestId("discover-assessment-needs-account")).toHaveCount(0);
});

test("a licensed dataset shows what it is but asks for a Yuan Ze sign-in instead of reading rows", async ({ page }) => {
  await mockV2Api(page, { datasetsBody: { ...MOCK_DATASETS, datasets: [LICENSED, ...MOCK_DATASETS.datasets] } });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("public_member")));
  const queried = [];
  page.on("request", (request) => { if (request.url().includes("/query/refinitiv_esg_snapshot")) queried.push(request.url()); });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-evidence-row").filter({ hasText: "LSEG ESG pillar snapshot" }).first().click();

  const workspace = page.getByTestId("library-asset-workspace");
  await expect(workspace).toContainText("University subscription");
  const brief = workspace.getByTestId("library-members-only");
  await expect(brief).toContainText("570 rows");
  await expect(brief).toContainText("Snapshot pulled 2026-07-06");
  await expect(brief).toContainText("ric");
  await expect(brief).toContainText("ESG factor overlays on equity panels");
  await expect(brief).toContainText("Snapshot only; not time series.");
  await expect(brief).toContainText("Yuan Ze members");
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "LSEG ESG pillar snapshot" }).first()).toContainText("Members only");
  await expect(workspace.getByRole("button", { name: "View all rows" })).toHaveCount(0);
  expect(queried).toEqual([]);
  await workspace.getByTestId("library-workspace-members-sign-in").click();
  await expect(page.getByTestId("access-screen")).toBeVisible();
});
