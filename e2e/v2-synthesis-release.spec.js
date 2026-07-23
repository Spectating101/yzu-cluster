/**
 * Discover/Library release visibility — Synthesis stays in the codebase
 * but must not appear in public nav or deep links.
 */
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("Synthesis release visibility boundary", () => {
  test("sidebar has no Synthesis entry; Library/Discover remain", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const nav = page.locator(".yzu-sidebar nav");
    await expect(nav.getByRole("button", { name: /^Home$/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /^Library$/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /^Discover$/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /^Resources$/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /^Synthesis$/i })).toHaveCount(0);

    // No broken selected state on Home.
    await expect(nav.getByRole("button", { name: /^Home$/i })).toHaveClass(/active/);
  });

  test("tab=synthesis deep link normalizes to Library with Library selected", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    await expect(page.getByTestId("synthesis-workbench")).toHaveCount(0);

    const nav = page.locator(".yzu-sidebar nav");
    await expect(nav.getByRole("button", { name: /^Library$/i })).toHaveClass(/active/);
    await expect(nav.getByRole("button", { name: /^Synthesis$/i })).toHaveCount(0);

    await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("library");
  });
});
