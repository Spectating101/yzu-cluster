import { test, expect } from "@playwright/test";

const MOCK_DATASETS = {
  datasets: [
    { dataset_id: "gdelt_asia_daily_country_panel", name: "Asia daily news-risk panel", grain: "country-day", analysis_readiness: "instant", local_root: "research_panels/gdelt" },
    { dataset_id: "ticker_week_country_broadcast_panel", name: "Ticker week panel", grain: "country-week", analysis_readiness: "instant" },
  ],
};

const MOCK_HEALTH = {
  status: "ok",
  datasets: 2,
  desk: {
    jobs: { running: 1, pending_approval: 0 },
    composer_configured: true,
    storage_tiers: { canonical: { quota_tb: 5, used_tb: 2.1 } },
    gdrive: { ok: true },
  },
};

async function mockApi(page) {
  await page.route("**/datasets", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DATASETS) }));
  await page.route("**/datasets/*", (route) => {
    const id = decodeURIComponent(route.request().url().split("/datasets/")[1] || "");
    const row = MOCK_DATASETS.datasets.find((dataset) => dataset.dataset_id === id) || MOCK_DATASETS.datasets[0];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.route("**/health*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HEALTH) }));
  await page.route("**/library/discover*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sections: [], total: 0 }) }));
  await page.route("**/library/search*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sections: [], total: 0 }) }));
  await page.route("**/library/ops*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ collection_queue: { pending: 0 }, datacite_harvest: { running: 2 } }) }));
  await page.route("**/library/jobs*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [] }) }));
  await page.route("**/yzu/acquisitions*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ acquisitions: [] }) }));
  await page.route("**/library/faculty/profile*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ found: true, profile: { name_en: "Test Prof", discipline: "YZU" } }) }));
  await page.route("**/query/*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ date: "2026-04-30", country: "TW", score: 0.82 }] }) }));
}

async function v2Nav(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

async function selectFirstDataset(page) {
  await page.goto("/?tab=library&folder=research_panels/gdelt", { waitUntil: "domcontentloaded" });
  await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });
  const row = page.locator('.rd-v2-library-asset[data-kind="dataset"]').first();
  await row.waitFor({ state: "visible", timeout: 15_000 });
  await row.click();
}

test.describe("v2 parity @ desk-v2-1440", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });
  });

  test("shell grid keeps adaptive rail proportions without overflow", async ({ page }) => {
    const shell = page.locator(".rd-v2-shell");
    const metrics = await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      const header = document.querySelector(".yzu-header")?.getBoundingClientRect();
      const sidebar = document.querySelector(".yzu-sidebar")?.getBoundingClientRect();
      const rail = document.querySelector(".rd-v2-rail")?.getBoundingClientRect();
      const main = document.querySelector(".yzu-main")?.getBoundingClientRect();
      return {
        cols: style.gridTemplateColumns,
        shellW: Math.round(element.getBoundingClientRect().width),
        headerH: Math.round(header?.height || 0),
        sidebarW: Math.round(sidebar?.width || 0),
        mainW: Math.round(main?.width || 0),
        railW: Math.round(rail?.width || 0),
      };
    });
    expect(metrics.cols).toContain("px");
    expect(metrics.shellW).toBeGreaterThanOrEqual(1438);
    expect(metrics.shellW).toBeLessThanOrEqual(1442);
    expect(metrics.headerH).toBeGreaterThanOrEqual(60);
    expect(metrics.headerH).toBeLessThanOrEqual(66);
    expect(metrics.sidebarW / metrics.shellW).toBeGreaterThanOrEqual(0.16);
    expect(metrics.sidebarW / metrics.shellW).toBeLessThanOrEqual(0.2);
    expect(metrics.railW / metrics.shellW).toBeGreaterThanOrEqual(0.28);
    expect(metrics.railW / metrics.shellW).toBeLessThanOrEqual(0.32);
    expect(metrics.mainW).toBeGreaterThan(metrics.railW);
    expect(metrics.mainW).toBeGreaterThan(metrics.sidebarW);
    expect(metrics.sidebarW + metrics.mainW + metrics.railW).toBeLessThanOrEqual(metrics.shellW + 2);
  });

  test("primary sidebar tabs render page chrome", async ({ page }) => {
    const tabs = [["Home", "Home"], ["Library", "Library"], ["Discover", "Discover"], ["Synthesis", "Synthesis"], ["Resources", "Resources"]];
    for (const [navigation, heading] of tabs) {
      await v2Nav(page, navigation);
      await expect(page.locator(".rd-v2-page-head h1", { hasText: heading })).toBeVisible();
    }
    await expect(page.locator("aside.yzu-sidebar nav button", { hasText: "Profile" })).toHaveCount(0);
    await expect(page.locator("aside.yzu-sidebar nav button", { hasText: "Settings" })).toHaveCount(0);
    await expect(page.locator("aside.yzu-sidebar nav button", { hasText: "Cluster" })).toHaveCount(0);
  });

  test("account menu exposes routable context and preference destinations", async ({ page }) => {
    await page.getByTestId("header-account-menu").click();
    const contextLink = page.getByRole("menuitem", { name: /Research context/ });
    const settingsLink = page.getByRole("menuitem", { name: /Workspace preferences/ });
    await expect(contextLink).toHaveAttribute("href", "/?tab=profile");
    await expect(settingsLink).toHaveAttribute("href", "/?tab=settings");

    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Profile" })).toBeVisible();

    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Settings" })).toBeVisible();
  });

  test("cluster tab remains reachable by URL while deferred", async ({ page }) => {
    await page.goto("/?tab=cluster", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Cluster" })).toBeVisible();
  });

  test("Detail rail has sticky CTAs and segmented toggle", async ({ page }) => {
    await selectFirstDataset(page);
    await expect(page.locator(".rd-v2-rail-toggle button.on", { hasText: "Detail" })).toBeVisible();
    await expect(page.locator('[data-testid="rail-pane-ask"]')).toBeHidden();
    await expect(page.locator("aside .rd-v2-rail-sticky .rd-v2-btn.primary", { hasText: "Preview rows" })).toBeVisible();
    await expect(page.locator('aside.rd-v2-rail [aria-label="Can I use this?"]')).toContainText("Query ready");
    await page.locator(".rd-v2-rail-toggle").getByRole("tab", { name: "Ask" }).click();
    await expect(page.getByTestId("ask-composer")).toBeVisible();
    await expect(page.locator('[data-testid="rail-pane-detail"] .rd-v2-rail-sticky')).not.toBeVisible();
  });

  test("adaptive Preview overlays the main surface with bounded evidence actions", async ({ page }) => {
    await selectFirstDataset(page);
    await page.locator("aside .rd-v2-rail-sticky").getByRole("button", { name: "Preview rows" }).click();
    const preview = page.getByRole("dialog", { name: "Asia daily news-risk panel preview" });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("button", { name: "Rows", exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Fields", exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Export sample" })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Open query" })).toBeVisible();
    await expect(page.locator(".rd-v2-rail-toggle")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
  });
});
