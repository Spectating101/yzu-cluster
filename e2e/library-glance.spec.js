import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const row = (id, name, extra = {}) => ({
  dataset_id: id,
  name,
  grain: "day",
  analysis_readiness: "instant",
  local_root: `lake/${id}`,
  source_system: "Public source",
  ...extra,
});

const DATASETS = {
  datasets: [
    row("vdem", "Electoral democracy index", { glance: { rows: 34228, columns: 5, from: "1789", to: "2025" } }),
    row("crypto", "Major cryptocurrency prices", { glance: { rows: 29896, columns: 4, from: "2016-09-25", to: "2026-09-25" } }),
    row("rowsonly", "Rows but no dates", { glance: { rows: 242, columns: 3 } }),
    row("bare", "Nothing known"),
    row("legacy", "Older row", { row_count: 26051, coverage: "1925-12-31 → 2024-12-31" }),
  ],
};

async function open(page) {
  await mockV2Api(page, { datasetsBody: DATASETS });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

const rowFor = (page, name) => page.getByTestId("library-evidence-row").filter({ hasText: name });

test("each row shows its size and the years it covers", async ({ page }) => {
  await open(page);
  const vdem = rowFor(page, "Electoral democracy index").getByTestId("library-evidence-glance");
  await expect(vdem).toContainText("34K rows");
  await expect(vdem).toContainText("1789–2025");
  await expect(vdem.getByRole("img")).toHaveAttribute("aria-label", "Covers 1789–2025");
  await expect(vdem).toHaveAttribute("title", /34,228 rows · 5 columns · 1789 to 2025/);
});

test("older rows still show what they know", async ({ page }) => {
  await open(page);
  await expect(rowFor(page, "Older row").getByTestId("library-evidence-glance")).toContainText("26K rows");
  await expect(rowFor(page, "Older row").getByTestId("library-evidence-glance")).toContainText("1925–2024");
});

test("a row without dates shows its size and no bar, and a row with no facts shows its type", async ({ page }) => {
  await open(page);
  const rowsOnly = rowFor(page, "Rows but no dates").getByTestId("library-evidence-glance");
  await expect(rowsOnly).toContainText("242 rows");
  await expect(rowsOnly.getByRole("img")).toHaveCount(0);
  await expect(rowFor(page, "Nothing known").getByTestId("library-evidence-glance")).toHaveCount(0);
  await expect(rowFor(page, "Nothing known")).toContainText("Dataset");
});

test("bars share one timeline", async ({ page }) => {
  await open(page);
  const left = async (name) => rowFor(page, name).locator(".rd-v2-cap-glance-track i").evaluate((el) => parseFloat(el.style.left));
  expect(await left("Electoral democracy index")).toBeLessThan(1);
  expect(await left("Major cryptocurrency prices")).toBeGreaterThan(85);
});

test("the column is named Coverage when rows carry facts", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("columnheader", { name: "Coverage" })).toBeVisible();
});

test("Home's featured cards show the same glance", async ({ page }) => {
  await mockV2Api(page, {
    datasetsBody: {
      datasets: [
        row("vdem", "Electoral democracy index", { featured_rank: 1, description: "Democracy by country and year.", glance: { rows: 34228, columns: 5, from: "1789", to: "2025" } }),
        row("bare", "Nothing known", { featured_rank: 2, description: "No facts yet." }),
      ],
    },
  });
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: 2,
      authenticated: true,
      principal: { id: "g", role: "public_guest", display_name: "Guest", email: null },
      permissions: { view_research_data: true, download_research_data: true, view_licensed_data: false, use_ask: false, manage_research_profile: false, view_operations: false, submit_collection: false, view_faculty_profile: false },
      session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
    }),
  }));
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const cards = page.getByTestId("home-guest-ready");
  await expect(cards.getByTestId("home-glance")).toHaveCount(1);
  await expect(cards.getByTestId("home-glance")).toContainText("34K rows");
  await expect(cards.getByTestId("home-glance")).toContainText("1789–2025");
});
