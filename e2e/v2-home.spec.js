import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const RECENT_KEY = "rd_v2_recent_datasets";
const TICKER_ID = "ticker_week_country_broadcast_panel";
const ASIA_ID = "gdelt_asia_daily_country_panel";

test.describe("v2 Home continuation surface", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("continue section is the primary resume object", async ({ page }) => {
    const cont = page.getByTestId("home-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toContainText("Continue working");
    await expect(cont.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.locator(".rd-v2-home-command")).toHaveCount(0);
  });

  test("Continue opens dataset preview and keeps rail grounded", async ({ page }) => {
    const cont = page.getByTestId("home-continue");
    await expect(cont.locator(".rd-v2-home-continue-id")).toBeVisible();
    const title = (await cont.locator("h2").innerText()).trim();
    const datasetId = (await cont.locator(".rd-v2-home-continue-id").innerText()).trim();
    await cont.getByRole("button", { name: "Continue" }).click();

    const modal = page.locator(".rd-v2-preview-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(title);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Home" })).toBeVisible();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).toHaveCount(0);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.locator(".rd-v2-rail-selection")).toContainText(title);
    await expect(rail.getByRole("tab", { name: "Detail" })).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(datasetId);
  });

  test("action row routes Search, Discover, and Ask", async ({ page }) => {
    const actions = page.locator(".rd-v2-home-actions");
    await expect(actions.getByRole("button", { name: /Search the lab/i })).toBeVisible();
    await expect(actions.getByRole("button", { name: /Discover data/i })).toBeVisible();
    await expect(actions.getByRole("button", { name: /Ask the assistant/i })).toBeVisible();

    await actions.getByRole("button", { name: /Search the lab/i }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByTestId("home-continue")).toBeVisible();

    await page.locator(".rd-v2-home-actions").getByRole("button", { name: /Discover data/i }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Home", exact: true }).click();
    await page.locator(".rd-v2-home-actions").getByRole("button", { name: /Ask the assistant/i }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  });

  test("attention queue shows only actionable work", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await expect(queue).toContainText(/needing action|Clear/i);
    await expect(queue.locator('[data-kind="approval"]')).toContainText("MOPS financial statements");
    await expect(queue.locator('[data-kind="approval"]')).toContainText("1 pending");
    await expect(queue.locator('[data-kind="procurement"]')).toContainText("Procurement in progress");
    await expect(queue.locator('[data-kind="procurement"]')).toContainText(/running/i);
    await expect(queue.locator('[data-kind="library"]')).toHaveCount(0);
    await expect(queue.locator('[data-kind="discover"]')).toHaveCount(0);
    await expect(queue.getByRole("button", { name: /^Open / })).toHaveCount(2);
    await expect(queue.getByRole("button", { name: /^Ask about / })).toHaveCount(2);
  });

  test("Open on approval attention selects the Resources job rail", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await queue.locator('[data-kind="approval"]').getByRole("button", { name: /^Open Approval/ }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Resources" })).toBeVisible();
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("MOPS financial statements");
    await expect(rail).toContainText("Job ID");
    await expect(rail).toContainText("job-pending-1");
    await expect(rail.getByRole("button", { name: "Approve job" })).toBeVisible();
  });

  test("Ask on approval attention sends grounded Home context", async ({ page }) => {
    const queue = page.getByRole("region", { name: "Attention queue" });
    await queue.locator('[data-kind="approval"]').getByRole("button", { name: /^Ask about Approval/ }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-rail-selection")).toHaveText("MOPS financial statements");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText("Home · MOPS financial statements");
    await expect(page.getByTestId("ask-messages")).toContainText("Review the pending procurement approval");
    await expect(page.getByTestId("ask-messages")).toContainText("MOPS financial statements");

    await rail.getByRole("tab", { name: "Detail" }).click();
    await expect(rail.getByRole("tab", { name: "Detail" })).toHaveAttribute("aria-selected", "true");
    await expect(rail).toContainText("Type");
    await expect(rail).toContainText("Approval");
    await expect(rail).toContainText("Review source, cost, destination");
  });

  test("recent assets remain below attention", async ({ page }) => {
    const recent = page.getByRole("region", { name: "Recent research assets" });
    await expect(recent).toBeVisible();
    await expect(recent.locator(".rd-v2-catalog button.row").first()).toBeVisible();
  });

  test("suggested asks render from faculty profile", async ({ page }) => {
    const asks = page.locator(".rd-v2-home-suggested");
    await expect(asks).toBeVisible();
    await expect(asks.getByRole("button").first()).toBeVisible();
  });
});

test.describe("v2 Home recent history", () => {
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
