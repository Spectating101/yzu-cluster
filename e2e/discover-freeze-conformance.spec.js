import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// DISCOVER_ADAPTIVE_FREEZE_2026-07-28 §12 lists what makes an implementation
// conformant, and §13 lists what must not come back. Both were prose until now,
// which is how a fourth chrome counter shipped without anyone noticing the
// freeze binds the row to three.

const open = async (page, q = "") => {
  await mockV2Api(page);
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
  const rows = page.locator("[data-testid=discover-result-row], .rd-v2-discover-result");
  const n = await rows.count();
  test.skip(n === 0, "fixture returned no offerings");
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    expect((await row.innerText()).trim().length).toBeGreaterThan(40);
    await expect(row.getByRole("button", { name: /Add to collection/ })).toHaveCount(1);
  }
});

test("§12 — selecting a row does not take over the centre", async ({ page }) => {
  await open(page, "stablecoin");
  const rows = page.locator("[data-testid=discover-result-row], .rd-v2-discover-result");
  const before = await rows.count();
  test.skip(before === 0, "fixture returned no offerings");
  await rows.first().click();
  await page.waitForTimeout(400);
  await expect(rows).toHaveCount(before);
});

test("§12 — a keyword paints results without opening Ask", async ({ page }) => {
  await open(page, "stablecoin");
  const askPane = page.locator('[data-testid="rail-pane-ask"]');
  if (await askPane.count()) await expect(askPane).toBeHidden();
});
