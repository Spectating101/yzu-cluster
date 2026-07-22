import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const RECENT_KEY = "rd_v2_recent_datasets";
const TICKER_ID = "ticker_week_country_broadcast_panel";
const ASIA_ID = "gdelt_asia_daily_country_panel";

test.describe("RC3 Home research operating brief", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("continue section remains the primary resume object", async ({ page }) => {
    const cont = page.getByTestId("home-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toContainText("Continue working");
    await expect(cont.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.locator(".rd-rc3-product-thesis")).toContainText("Institutional research data OS");
  });

  test("Continue opens dataset preview and keeps rail grounded", async ({ page }) => {
    const cont = page.getByTestId("home-continue");
    await expect(cont.locator(".rd-v2-home-continue-id")).toBeAttached();
    const title = (await cont.locator("h2").innerText()).trim();
    const datasetId = (await cont.locator(".rd-v2-home-continue-id").innerText()).trim();
    await cont.getByRole("button", { name: "Continue" }).click();

    const preview = page.getByRole("dialog", { name: `${title} preview` });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(title);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Home" })).toBeVisible();

    await preview.getByRole("button", { name: "Close preview" }).click();
    await expect(preview).toHaveCount(0);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(title);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(datasetId);
  });

  test("research lifecycle routes into the owned evidence surfaces", async ({ page }) => {
    const lifecycle = page.getByRole("region", { name: "Research lifecycle" });
    await expect(lifecycle.getByRole("button", { name: /Find/ })).toBeVisible();
    await expect(lifecycle.getByRole("button", { name: /Verify/ })).toBeVisible();
    await expect(lifecycle.getByRole("button", { name: /Acquire/ })).toBeVisible();
    await expect(lifecycle.getByRole("button", { name: /Synthesize/ })).toBeVisible();

    await lifecycle.getByRole("button", { name: /Verify/ }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("region", { name: "Research lifecycle" }).getByRole("button", { name: /Find/ }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("region", { name: "Research lifecycle" }).getByRole("button", { name: /Ask across the workflow/ }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  });

  test("attention queue shows only consequential researcher decisions", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await expect(queue.locator('[data-kind="approval"]')).toContainText("MOPS financial statements");
    await expect(queue.locator('[data-kind="approval"]')).toContainText("1 pending");
    await expect(queue.locator('[data-kind="procurement"]')).toHaveCount(0);
    await expect(queue.locator('[data-kind="library"]')).toHaveCount(0);
    await expect(queue.locator('[data-kind="discover"]')).toHaveCount(0);
    await expect(queue.getByRole("button", { name: "Review", exact: true })).toHaveCount(1);
  });

  test("approval attention routes to Discover rather than Resources", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await queue.locator('[data-kind="approval"]').getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Resources" })).toHaveCount(0);
  });

  test("attention can be discussed without replacing the main Home workspace", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await queue.locator('[data-kind="approval"]').getByRole("button", { name: "Ask", exact: true }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Home");
    await expect(page.getByTestId("home-continue")).toBeVisible();
  });

  test("recent assets remain below attention", async ({ page }) => {
    const recent = page.getByRole("region", { name: "Recent research assets" });
    await expect(recent).toBeVisible();
    await expect(recent.locator(".rd-v2-catalog button.row").first()).toBeVisible();
  });

  test("Home does not duplicate the persistent Ask rail", async ({ page }) => {
    await expect(page.locator(".rd-v2-home-suggested")).toHaveCount(0);
    await expect(page.locator("aside.rd-v2-rail").getByRole("tab", { name: "Ask" })).toBeVisible();
  });
});

test.describe("RC3 Home recent history", () => {
  test("loading Home does not rewrite stored recent with first catalog row", async ({ page }) => {
    await mockV2Api(page);
    await page.addInitScript(
      ([key, ids]) => {
        localStorage.setItem(key, JSON.stringify(ids));
      },
      [RECENT_KEY, [TICKER_ID, ASIA_ID]],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const cont = page.getByTestId("home-continue");
    await expect(cont).toContainText("Ticker week panel");
    await expect(cont.locator(".rd-v2-home-continue-id")).toHaveText(TICKER_ID);

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), RECENT_KEY);
    expect(stored[0]).toBe(TICKER_ID);
    expect(stored).not.toEqual([ASIA_ID, TICKER_ID]);
  });
});
