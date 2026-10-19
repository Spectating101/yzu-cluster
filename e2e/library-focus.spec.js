import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const access = (role) => ({
  version: 2,
  authenticated: true,
  principal: { id: `${role}-fixture`, role, display_name: role, email: role === "public_guest" ? null : "alice@example.test" },
  permissions: {
    view_research_data: true,
    download_research_data: true,
    view_licensed_data: role === "member",
    use_ask: role !== "public_guest",
    manage_research_profile: role !== "public_guest",
    view_operations: false,
    submit_collection: role === "member",
    view_faculty_profile: false,
  },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
});

const row = (id, name, extra = {}) => ({
  dataset_id: id,
  name,
  grain: "day",
  analysis_readiness: "instant",
  local_root: `lake/${id}`,
  source_system: "Public source",
  ...extra,
});

const datasetsFor = (role) => ({
  datasets: [
    row("crsp_daily", "CRSP daily stock file", { featured_rank: 1, licensed: true, access: "yzu_members", rows_available: role === "member" }),
    row("ff_factors", "Fama-French daily factors", { featured_rank: 2, tags: ["asset pricing"] }),
    row("crypto_majors", "Major cryptocurrency prices", { featured_rank: 3, tags: ["crypto"] }),
    row("vdem", "Electoral democracy index", { featured_rank: 4, tags: ["politics"] }),
    row("depeg_weeks", "Stablecoin de-peg weeks", { grain: "week", tags: ["stablecoin", "depeg"] }),
    row("coin_catalog", "Etherscan stablecoin catalog", { grain: "catalog_harvest", tags: ["stablecoin"] }),
    row("bls_county", "County unemployment", { tags: ["labour"] }),
    row("noaa_temp", "Temperature anomalies", { tags: ["climate"] }),
    row("sg_cpi", "Singapore CPI", { tags: ["inflation"] }),
  ],
});

const MEMBER_PROFILE = (topics) => ({
  configured: Boolean(topics.length),
  principal: { email: "alice@example.test", display_name: "Alice" },
  profile: { research_topics: topics },
  memory: { memories: [], settings: {} },
});

async function openLibrary(page, role, profile) {
  await mockV2Api(page, { datasetsBody: datasetsFor(role) });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access(role)));
  if (profile) await page.route("**/library/profile", (route) => fulfill(route, profile));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

const listed = (page) => page.getByTestId("library-evidence-row");

test("a guest starts from the featured datasets, not the whole inventory", async ({ page }) => {
  await openLibrary(page, "public_guest");
  await expect(page.getByTestId("library-lens-featured")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("library-lens-for_you")).toHaveCount(0);
  await expect(listed(page)).toHaveCount(3);
  await expect(listed(page).first()).toContainText("Fama-French daily factors");
  await expect(page.getByTestId("library-evidence-estate")).not.toContainText("CRSP daily stock file");
  await expect(page.getByTestId("library-evidence-estate")).not.toContainText("Etherscan stablecoin catalog");
  await expect(page.getByTestId("library-lens-note")).toContainText("most worth opening");
  await expect(page.locator(".rd-v2-toolbar-count")).toContainText("3 of 9 datasets");
});

test("All shows every dataset, and Featured comes back", async ({ page }) => {
  await openLibrary(page, "public_guest");
  await page.getByTestId("library-lens-all").click();
  await expect(listed(page)).toHaveCount(9);
  await expect(page.getByTestId("library-lens-all")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("library-lens-featured").click();
  await expect(listed(page)).toHaveCount(3);
});

test("searching looks across everything and hides the view switch", async ({ page }) => {
  await openLibrary(page, "public_guest");
  await page.getByLabel("Search your Library").fill("stablecoin");
  await expect(page.getByTestId("library-lens")).toHaveCount(0);
  await expect(listed(page)).toHaveCount(2);
  await expect(page.getByTestId("library-evidence-estate")).toContainText("Stablecoin de-peg weeks");
  await page.getByLabel("Search your Library").fill("");
  await expect(page.getByTestId("library-lens-featured")).toHaveAttribute("aria-pressed", "true");
});

test("choosing a status filter shows all matching datasets, and picking Featured clears it", async ({ page }) => {
  await openLibrary(page, "public_guest");
  await page.getByTestId("library-state-filter").selectOption("ready");
  await expect(page.getByTestId("library-lens-all")).toHaveAttribute("aria-pressed", "true");
  await expect(listed(page).first()).toBeVisible();
  await page.getByTestId("library-lens-featured").click();
  await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
  await expect(listed(page)).toHaveCount(3);
});

test("a member with a research focus starts from a list matched to it", async ({ page }) => {
  await openLibrary(page, "member", MEMBER_PROFILE(["stablecoin"]));
  await expect(page.getByTestId("library-lens-for_you")).toHaveAttribute("aria-pressed", "true");
  await expect(listed(page).first()).toContainText("Stablecoin de-peg weeks");
  await expect(page.getByTestId("library-lens-note")).toContainText("Matched to your research: stablecoin");
  await expect(page.getByTestId("library-evidence-estate")).not.toContainText("Temperature anomalies");
  await page.getByTestId("library-lens-featured").click();
  await expect(listed(page).first()).toContainText("CRSP daily stock file");
});

test("a member without a research focus gets featured with a nudge to set one", async ({ page }) => {
  await openLibrary(page, "public_member", MEMBER_PROFILE([]));
  await expect(page.getByTestId("library-lens-for_you")).toHaveCount(0);
  await expect(page.getByTestId("library-lens-featured")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("library-lens-note")).toContainText("Add your research focus in Profile");
});

test("a member whose focus matches nothing still gets featured", async ({ page }) => {
  await openLibrary(page, "member", MEMBER_PROFILE(["glaciology"]));
  await expect(page.getByTestId("library-lens-for_you")).toHaveCount(0);
  await expect(page.getByTestId("library-lens-featured")).toHaveAttribute("aria-pressed", "true");
});

test("Discover suggests neutral searches to a guest", async ({ page }) => {
  await mockV2Api(page, { datasetsBody: datasetsFor("public_guest") });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("public_guest")));
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const examples = page.getByTestId("discover-composer-examples");
  await expect(examples).toContainText("inflation");
  await expect(examples).toContainText("study unemployment across countries");
  await expect(examples).not.toContainText("stablecoin");
});

test("Discover suggests a member's own topic", async ({ page }) => {
  await mockV2Api(page, { datasetsBody: datasetsFor("member") });
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("member")));
  await page.route("**/library/profile", (route) => fulfill(route, MEMBER_PROFILE(["stablecoin de-pegging"])));
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const examples = page.getByTestId("discover-composer-examples");
  await expect(examples).toContainText("What data can I use to study stablecoin de-pegging?");
  await examples.getByRole("button").first().click();
  await expect(page.getByLabel("Search or describe a research need")).toHaveValue("stablecoin de-pegging");
});
