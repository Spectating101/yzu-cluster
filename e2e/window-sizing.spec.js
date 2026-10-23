import { expect, test } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, searchDiscover, waitForShell } from "./fixtures/v2MockApi.js";

const COLLECTIONS = Array.from({ length: 12 }, (_, i) => ({
  dataset_id: `d${i}`,
  name: `Dataset ${i}`,
  grain: "day",
  analysis_readiness: "instant",
  local_root: `lake/d${i}`,
  source_system: "Public source",
  shelf_hint: `topic_${i}`,
}));

const NAV = {
  nav_mode: "professor_shelves",
  shelves: COLLECTIONS.map((row, i) => ({ id: `shelf${i}`, label: `Collection ${i}`, partition_ids: [`p${i}`] })),
  partitions: COLLECTIONS.map((row, i) => ({
    partition_id: `p${i}`,
    shelf_id: `shelf${i}`,
    professor_label: `Collection ${i}`,
    detail: { registry_dataset_ids: [row.dataset_id] },
  })),
};

async function open(page, size, tab = "library", preset = null) {
  await page.setViewportSize(size);
  if (preset !== null) await page.addInitScript((value) => window.localStorage.setItem("rd.railFolded", value), preset);
  await mockV2Api(page, { datasetsBody: { datasets: COLLECTIONS }, discoverBody: MOCK_DISCOVER_HIT, libraryNavBody: NAV });
  await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("the side panel starts folded below 1280px wide and open above it", async ({ page }) => {
  await open(page, { width: 1100, height: 800 });
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
});

test("the side panel stays open at 1280px and wider", async ({ page }) => {
  await open(page, { width: 1280, height: 720 });
  await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/rail-folded/);
});

test("a saved choice beats the narrow-window default", async ({ page }) => {
  await open(page, { width: 1100, height: 800 }, "library", "0");
  await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/rail-folded/);
});

test("selecting a candidate in a narrow window opens the folded panel", async ({ page }) => {
  await open(page, { width: 1100, height: 800 }, "browse");
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
  await searchDiscover(page, "mops");
  await page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate", { hasText: "MOPS" }).click();
  await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/rail-folded/);
  await expect(page.locator("aside.rd-v2-rail")).toContainText("MOPS financial statements");
});

test("a person who folded the panel keeps it folded when they select something", async ({ page }) => {
  await open(page, { width: 1400, height: 900 }, "browse");
  await page.getByRole("button", { name: /Hide side panel/i }).click();
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
  await searchDiscover(page, "mops");
  await page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate", { hasText: "MOPS" }).click();
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
});

test("collections open from one picker that lists every collection at any window size", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await open(page, viewport);
    const toggle = page.getByTestId("library-collections-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle.locator("b")).toHaveText(String(COLLECTIONS.length));
    await toggle.click();
    await expect(page.getByTestId("library-collection-filter")).toHaveCount(COLLECTIONS.length);
    await expect(page.getByTestId("library-collection-filter").last()).toBeInViewport();
  }
});
