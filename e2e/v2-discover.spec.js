import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Discover tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("start state exposes a research-first evidence workflow", async ({ page }) => {
    const start = page.getByTestId("discover-empty");
    await expect(start).toBeVisible();
    await expect(start.getByRole("heading", { name: "Search what the lab already holds—then widen the evidence space." })).toBeVisible();
    await expect(start.getByRole("textbox", { name: "Research question or dataset" })).toHaveAttribute("placeholder", /holdings, registries/i);
    await expect(start.getByRole("region", { name: "Evidence discovery workflow" })).toContainText("Held evidence");
    await expect(start.getByRole("region", { name: "Evidence discovery workflow" })).toContainText("Controlled acquisition");
    await expect(start.getByRole("button", { name: /Investigate TWSE governance/ })).toBeVisible();
    await expect(start).toContainText(/External candidates remain prospective evidence/i);
  });

  test("suggestion fills header search and shows results", async ({ page }) => {
    await page.getByRole("button", { name: /Investigate TWSE governance/ }).click();
    await expect(page.locator(".rd-v2-search-pill input")).toHaveValue("TWSE governance");
    await expect(page.locator("button.rd-v2-discover-candidate").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button.rd-v2-discover-candidate")).not.toHaveCount(0);
    await expect(page.locator(".rd-v2-discover-browse-groups")).toContainText(/TWSE Open\s*API/i);
    await expect(page.getByTestId("discover-result-summary")).toContainText(/\d+ result/i);
    await expect(page.getByTestId("discover-filter-menu")).toBeVisible();
  });

  test("direct catalog form starts a search", async ({ page }) => {
    const start = page.getByTestId("discover-empty");
    await start.getByRole("textbox", { name: "Research question or dataset" }).fill("MOPS amendments");
    await start.getByRole("button", { name: "Search evidence" }).click();
    await expect(page.locator(".rd-v2-search-pill input")).toHaveValue("MOPS amendments");
  });

  test("selecting a discover row keeps Explore visible and updates the Detail rail", async ({ page }) => {
    await page.locator(".rd-v2-search-pill input").fill("MOPS");
    await page.locator(".rd-v2-search-pill input").press("Enter");
    await page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate").first().click();
    const surface = page.locator("aside.rd-v2-rail").getByTestId("discover-eval-surface");
    await expect(surface).toBeVisible();
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-candidate.selected")).toHaveCount(1);
    await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/no-rail/);
    await expect(surface.locator(".rd-v2-eval-title")).toContainText(/MOPS|Taiwan/i);
    await expect(surface).toContainText("Can I use this?");
    await expect(surface).toContainText("Useful for");
    await expect(surface).toContainText("Still unknown");
    await expect(surface.locator(".rd-v2-eval-tech")).toBeVisible();
    await expect(surface.locator(".rd-v2-eval-tech")).not.toHaveAttribute("open");
    await expect(page.locator('[data-testid="discover-eval-actions"] .rd-v2-btn.primary', { hasText: "Add to lab" })).toBeVisible();
  });

  test("mobile selection preserves Explore and opens Ask deliberately", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.locator(".rd-v2-search-pill input").fill("mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();

    const shell = page.locator(".rd-v2-shell");
    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-candidate.selected")).toHaveCount(1);
    await expect(shell).not.toHaveClass(/no-rail/);
    await expect(rail).toHaveClass(/rd-v2-rail-collapsed/);
    await rail.getByRole("button", { name: /Show Detail/ }).click();
    await expect(rail).not.toHaveClass(/rd-v2-rail-collapsed/);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  });

  test("Discover candidate Ask actions carry candidate context", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.locator(".rd-v2-search-pill input").fill("mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(/MOPS|Taiwan/i);
    await page.getByTestId("ask-messages").getByRole("button", { name: /Assess this source/i }).click();
    await expect(page.getByTestId("ask-messages")).toContainText(/MOPS|Taiwan/i);
  });

  test("Probe source shows verified facts; technical evidence stays collapsed", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.locator(".rd-v2-search-pill input").fill("mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Probe source" }).click();
    const surface = page.locator("aside.rd-v2-rail").getByTestId("discover-eval-surface");
    await expect(surface.locator(".rd-v2-eval-verified")).toContainText("text/csv");
    await expect(surface.locator(".rd-v2-eval-verified")).toContainText(/domain observed/i);
    await expect(surface.locator(".rd-v2-eval-inferred")).toContainText(/direct file|machine-readable/i);
    await expect(surface.locator(".rd-v2-eval-tech")).not.toHaveAttribute("open");
    await surface.locator(".rd-v2-eval-tech > summary").click();
    await expect(surface.locator(".rd-v2-eval-tech")).toHaveAttribute("open");
  });
});
