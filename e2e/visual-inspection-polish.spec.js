import { test, expect } from "@playwright/test";
import { mockV2Api, MOCK_DATASETS, waitForShell } from "./fixtures/v2MockApi.js";

const asset = {
  ...MOCK_DATASETS.datasets[0],
  glance: { rows: 8000, columns: 3 },
  full_download: "/library/datasets/gdelt_asia_daily_country_panel/download",
  download_name: "asia_daily_news",
};
const rows = Array.from({ length: 5000 }, (_, index) => ({ date: "2024-01-01", country: "TW", score: index }));

async function openAsset(page, { width = 1440, height = 900, holdQuery } = {}) {
  await page.setViewportSize({ width, height });
  await mockV2Api(page, { datasetsBody: { datasets: [asset] } });
  await page.route("**/query/*", async (route) => {
    if (holdQuery) await holdQuery;
    const limit = Number(new URL(route.request().url()).searchParams.get("limit")) || 8;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: rows.slice(0, limit) }) });
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-evidence-row").first().click();
  await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
}

for (const width of [390, 900]) {
  test(`data viewer fits ${width}px and keeps its controls reachable`, async ({ page }) => {
    await openAsset(page, { width, height: 844 });
    await page.getByRole("button", { name: "View all rows", exact: true }).click();
    const viewer = page.getByTestId("data-table-view");
    await expect(viewer).toContainText("5,000 rows loaded of 8,000");
    await expect(viewer).not.toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("library-asset-inspector")).toHaveAttribute("inert", "");
    const bounds = await viewer.boundingBox();
    expect(bounds.width).toBeGreaterThan(280);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    for (const control of [viewer.getByRole("searchbox", { name: "Filter rows" }), viewer.getByRole("button", { name: "Next", exact: true }), viewer.getByRole("button", { name: "Close data view" })]) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    }
    if (width === 390) {
      await expect(page.getByTestId("rail-fold")).toBeHidden();
      const nav = await page.locator(".yzu-sidebar").boundingBox();
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(nav.y);
    }
    await viewer.getByRole("button", { name: "Close data view" }).click();
    await expect(page.getByTestId("library-asset-inspector")).not.toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "View all rows", exact: true })).toBeFocused();
  });
}

test("sample loading does not claim its schema is unavailable", async ({ page }) => {
  let release;
  const holdQuery = new Promise((resolve) => { release = resolve; });
  try {
    await openAsset(page, { holdQuery });
    const sample = page.getByTestId("library-data-preview");
    await expect(sample.getByRole("status")).toHaveText("Reading a local sample…");
    await expect(sample).not.toContainText("No table structure is available yet");
    await expect(sample).not.toContainText("Documented structure only");
  } finally {
    release();
  }
  await expect(page.getByTestId("library-data-preview")).toContainText("Observed sample");
});

test("download menu stays in the narrow inspector and supports keyboard tool selection", async ({ page }) => {
  await openAsset(page, { width: 390, height: 844 });
  const menu = page.getByTestId("library-use-dataset");
  await menu.locator("summary").click();
  const panel = await menu.locator(".rd-v2-use-dataset-panel").boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await menu.getByRole("tab", { name: "Stata", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(menu.getByRole("tab", { name: "R", exact: true })).toBeFocused();
  await expect(menu.getByRole("tabpanel")).toContainText("read.csv");
  await page.keyboard.press("End");
  await expect(menu.getByRole("tab", { name: "Python", exact: true })).toBeFocused();
  await expect(menu.getByRole("tabpanel")).toContainText("pd.read_csv");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(menu.locator(".rd-v2-use-dataset-panel")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(menu.locator("summary")).toBeFocused();
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.getByRole("dialog", { name: "Inspect Asia daily news-risk panel" })).toBeVisible();
});

test("inspection motion is brief and removed when reduced motion is requested", async ({ page }) => {
  await openAsset(page);
  const scrim = page.getByTestId("library-asset-inspector");
  await expect(scrim).toHaveCSS("animation-duration", "0.15s");
  await expect(scrim).toHaveCSS("transform", "none");
  await page.getByRole("button", { name: "Expand sample", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Asia daily news-risk panel expanded sample" });
  await expect(preview).not.toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("tab", { name: "Ask", exact: true })).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scrim).toHaveCSS("animation-name", "none");
  await expect(page.locator(".rd-preview-scrim")).toHaveCSS("animation-name", "none");
  const close = preview.getByRole("button", { name: "Close preview" });
  await close.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(close).toHaveCSS("outline-style", "solid");
  await expect(close).toHaveCSS("outline-width", "2px");
});

test("a desktop fold preference does not remove the mobile context sheet", async ({ page }) => {
  await openAsset(page);
  await page.getByRole("button", { name: "Close data inspector" }).click();
  await page.getByTestId("rail-fold").click();
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/rail-folded/);
  await expect(page.getByTestId("rail-fold")).toBeHidden();
  await page.getByRole("button", { name: "Show research context", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide panel", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".rd-v2-shell")).toHaveClass(/rail-folded/);
});

test("member Resources keeps request counts and actions readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockV2Api(page);
  await page.route("**/library/account/usage", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ hourly_remaining: 60, daily_remaining: 240, limits: { hourly_requests: 60, daily_requests: 240 } }),
  }));
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      version: 2, authenticated: true,
      principal: { id: "visual-member", role: "member", display_name: "Pilot" },
      permissions: { view_research_data: true, view_operations: false, use_ask: true, submit_collection: true },
    }),
  }));
  await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const cards = page.getByTestId("member-resources").locator("article");
  await expect(cards).toHaveCount(3);
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first.width).toBeGreaterThan(300);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  const counts = cards.nth(1).locator("dt");
  for (const label of await counts.all()) {
    expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await cards.nth(1).getByRole("button", { name: "Open request history" }).scrollIntoViewIfNeeded();
  await expect(cards.nth(1).getByRole("button", { name: "Open request history" })).toBeInViewport();
});
