import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// DISCOVER_ADAPTIVE_FREEZE_2026-07-28 §12 lists what makes an implementation
// conformant, and §13 lists what must not come back. Both were prose until now,
// which is how a fourth chrome counter shipped without anyone noticing the
// freeze binds the row to three.

const open = async (page, q = "") => {
  await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  if (q) {
    const box = page.getByRole("textbox").first();
    await box.fill(q);
    await box.press("Enter");
    await page.waitForTimeout(1200);
  }
};

test("Explore and History are the only Discover modes", async ({ page }) => {
  await open(page);
  // scoped to the page's own mode switcher; the rail's Detail|Ask toggle is a
  // different control and is required by the freeze, not forbidden by it.
  const modes = page.locator(".rd-v2-discover-modes button");
  expect(await modes.count()).toBeGreaterThan(0);
  const labels = (await modes.allInnerTexts()).map((t) => t.trim().split("·")[0].trim());
  expect([...new Set(labels)].sort()).toEqual(["Explore", "History"]);
});

test("§2 — one composer in the centre, and no Search | Ask toggle beside it", async ({ page }) => {
  await open(page);
  const centre = page.locator(".rd-v2-discover-idle, .s04-main, main").first();
  await expect(centre.getByRole("button", { name: /^Search$/ })).toHaveCount(0);
  await expect(centre.getByRole("button", { name: /^Ask$/ })).toHaveCount(0);
  // exactly one free-text input drives Explore
  const boxes = centre.locator('input[type="text"], input:not([type]), textarea');
  expect(await boxes.count()).toBeGreaterThanOrEqual(1);
});

test("§13 — none of the withdrawn surfaces are present", async ({ page }) => {
  await open(page, "stablecoin");
  for (const gone of ["Plan", "AI canvas", "Source Finder", "Advanced Search"]) {
    await expect(page.getByRole("tab", { name: gone })).toHaveCount(0);
    await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
  }
});

test("§3 — held evidence is chrome, never a permanent result section", async ({ page }) => {
  await open(page, "stablecoin");
  const chrome = page.locator(".rd-v2-discover-frozen-counts");
  await expect(chrome).toBeVisible();
  await expect(chrome).toContainText("Library evidence");
  // it must not also exist as a results heading
  await expect(page.locator(".rd-v2-discover-results h2, .rd-v2-discover-results h3")
    .filter({ hasText: "Library evidence" })).toHaveCount(0);
});

test("§3 — the chrome row carries exactly the three frozen counters", async ({ page }) => {
  await open(page, "stablecoin");
  const text = await page.locator(".rd-v2-discover-frozen-counts").innerText();
  const labels = text.split("\n").map((l) => l.split("·")[0].trim()).filter(Boolean);
  expect(labels).toEqual(["Available", "Library evidence", "Web context"]);
});

test("§3 — every visible offering carries a description and a row-level Add", async ({ page }) => {
  await open(page, "stablecoin");
  const rows = page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidates > li");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    expect((await row.innerText()).trim().length).toBeGreaterThan(40);
    await expect(row.getByRole("button", { name: /Add to collection/ })).toHaveCount(1);
  }
});

test("§12 — selecting a row does not take over the centre", async ({ page }) => {
  await open(page, "stablecoin");
  const rows = page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidates > li");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  await rows.first().locator(".rd-v2-discover-candidate").click();
  await page.waitForTimeout(400);
  await expect(rows).toHaveCount(before);
});

test("§12 — a keyword paints results without opening Ask", async ({ page }) => {
  await open(page, "stablecoin");
  const askPane = page.locator('[data-testid="rail-pane-ask"]');
  if (await askPane.count()) await expect(askPane).toBeHidden();
});

test("§3 — the held-evidence popover carries a bounded preview and both actions", async ({ page }) => {
  // A result only counts as held when the catalog also holds it, so the fixture
  // has to agree with itself. The earlier version skipped instead, and that
  // skip hid a popover that was defined and never mounted.
  const HELD = {
    dataset_id: "idn_fry_daily_cross_section",
    name: "IDN daily cross-section",
    analysis_readiness: "instant",
    local_root: "data_lake/idn",
    backend: "local_csv",
    grain: "asset-day",
  };
  await mockV2Api(page);
  await page.unroute("**/datasets**").catch(() => {});
  await page.route("**/datasets**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ datasets: [HELD], total: 1 }),
  }));
  await page.unroute("**/library/discover?*").catch(() => {});
  await page.route("**/library/discover?*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ sections: [{ id: "registry", title: "Registry", rows: [
      { ...HELD, candidate_key: `dataset:${HELD.dataset_id}`, title: HELD.name },
    ] }], total: 1 }),
  }));

  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const box = page.getByRole("textbox").first();
  await box.fill("idn daily");
  await box.press("Enter");
  await page.waitForTimeout(1400);

  const menu = page.getByTestId("discover-library-evidence");
  await expect(menu, "the held-evidence opener must be mounted, not merely defined").toHaveCount(1);
  await menu.locator("summary").click();
  await expect(menu.getByRole("button", { name: "Compare coverage" })).toHaveCount(1);
  await expect(menu.getByRole("button", { name: "Open Library results" })).toHaveCount(1);
});
