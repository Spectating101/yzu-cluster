import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const RECENT_KEY = "rd_v2_recent_datasets";
const TICKER_ID = "ticker_week_country_broadcast_panel";
const ASIA_ID = "gdelt_asia_daily_country_panel";

test.describe("Home working brief", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("continue remains the primary resume object without product-explainer chrome", async ({ page }) => {
    const continuation = page.getByTestId("home-continue");
    await expect(continuation).toBeVisible();
    await expect(continuation).toContainText("Continue");
    await expect(continuation.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
    await expect(page.locator(".rd-rc3-product-thesis")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Research lifecycle" })).toHaveCount(0);
  });

  test("research context is compact and operational", async ({ page }) => {
    const context = page.getByRole("region", { name: "Research context summary" });
    await expect(context).toContainText("Holdings");
    await expect(context).toContainText("Query ready");
    await expect(context).toContainText("Running");
    await expect(context).toContainText("Needs review");
  });

  test("Continue opens preview and keeps the selected object grounded", async ({ page }) => {
    const continuation = page.getByTestId("home-continue");
    const title = (await continuation.locator("h2").innerText()).trim();
    const datasetId = (await continuation.locator(".rd-v2-home-continue-id").innerText()).trim();
    await continuation.getByRole("button", { name: "Continue", exact: true }).click();

    const preview = page.getByRole("dialog", { name: `${title} preview` });
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Close preview" }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(title);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(datasetId);
  });

  test("attention combines decisions, running work, Library, and Discover", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await expect(queue.locator('[data-kind="approval"]')).toContainText("MOPS financial statements");
    await expect(queue.locator('[data-kind="library"]')).toContainText("Faculty vault");
    await expect(queue.locator('[data-kind="discover"]')).toContainText("Find missing data");
    await expect(queue.getByRole("button", { name: "Open", exact: true }).first()).toBeVisible();
  });

  test("approval attention routes to Discover rather than Resources", async ({ page }) => {
    const approval = page.getByRole("region", { name: "Attention queue" }).locator('[data-kind="approval"]');
    await approval.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Resources" })).toHaveCount(0);
  });

  test("attention can be discussed without replacing Home", async ({ page }) => {
    const approval = page.getByRole("region", { name: "Attention queue" }).locator('[data-kind="approval"]');
    await approval.getByRole("button", { name: "Ask", exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Home");
    await expect(page.getByTestId("home-continue")).toBeVisible();
  });

  test("recent assets and suggested gaps remain visible", async ({ page }) => {
    const recent = page.getByRole("region", { name: "Recent research assets" });
    await expect(recent.locator(".rd-v2-catalog button.row").first()).toBeVisible();
    const gaps = page.getByRole("region", { name: "Suggested gaps" });
    await expect(gaps.getByRole("button").first()).toBeVisible();
  });
});

test.describe("Home recent history", () => {
  test("loading Home does not rewrite stored recent with first catalog row", async ({ page }) => {
    await mockV2Api(page);
    await page.addInitScript(
      ([key, ids]) => localStorage.setItem(key, JSON.stringify(ids)),
      [RECENT_KEY, [TICKER_ID, ASIA_ID]],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const continuation = page.getByTestId("home-continue");
    await expect(continuation).toContainText("Ticker week panel");
    await expect(continuation.locator(".rd-v2-home-continue-id")).toHaveText(TICKER_ID);

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), RECENT_KEY);
    expect(stored[0]).toBe(TICKER_ID);
    expect(stored).not.toEqual([ASIA_ID, TICKER_ID]);
  });
});
