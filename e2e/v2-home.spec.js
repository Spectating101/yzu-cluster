import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Home research-state briefing", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("briefing shows continue, judgment, evidence, and next actions", async ({ page }) => {
    await expect(page.getByTestId("home-continue")).toBeVisible();
    await expect(page.getByRole("region", { name: "Research Drive brief" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Suggested searches" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Synthesiz/i })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/Synthesiz/i);

    const judgment = page.getByTestId("home-judgment");
    await expect(judgment).toContainText("Needs judgment");
    await expect(judgment.locator('[data-kind="approval"]')).toContainText("MOPS financial statements");
    await expect(judgment.getByRole("button", { name: /^Open / })).toBeVisible();

    await expect(page.getByTestId("home-evidence")).toBeVisible();
    await expect(page.getByTestId("home-actions")).toContainText("Next valid actions");
    await expect(page.getByTestId("home-actions")).not.toContainText("stablecoin incidents");
  });

  test("Open on approval judgment lands on Discover Review queue", async ({ page }) => {
    const judgment = page.getByTestId("home-judgment");
    await judgment.locator('[data-kind="approval"]').getByRole("button", { name: /^Open / }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(page).toHaveURL(/tab=browse/);
    await expect(page.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "true");
    const review = page.getByTestId("discover-queue-strip");
    await expect(review).toBeVisible();
    await expect(review).toContainText("Needs your review");
    await expect(rail.getByTestId("procurement-decision-card")).toBeVisible();
  });

  test("home continue routes into Library Asset Workspace", async ({ page }) => {
    const cont = page.getByTestId("home-continue");
    await expect(cont.getByRole("button", { name: "Open in Library" })).toBeVisible();
    await cont.getByRole("button", { name: "Open in Library" }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    await expect(page.getByTestId("asset-workspace")).toBeVisible();
    await expect(page.getByTestId("asset-overview-observed")).toBeVisible();
    await expect(page.getByTestId("asset-workspace")).toContainText("Asia daily news-risk panel");
    await expect(page).toHaveURL(/tab=library/);
    await expect(page).toHaveURL(/dataset=gdelt_asia_daily_country_panel/);
  });

  test("Home has no Synthesize control or path to Synthesis", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByRole("button", { name: /Synthesiz/i })).toHaveCount(0);
    await expect(page.locator("aside.yzu-sidebar").getByRole("button", { name: /^Synthesis$/i })).toHaveCount(0);
    await expect(main).not.toContainText(/Synthesiz/i);

    await mockV2Api(page);
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    await expect(page.getByTestId("synthesis-workbench")).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("library");
  });

  test("mobile Home keeps judgment in the first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const judgment = page.getByTestId("home-judgment");
    const judgmentTop = await judgment.evaluate((element) => element.getBoundingClientRect().top);
    expect(judgmentTop).toBeLessThan(844);
  });
});
