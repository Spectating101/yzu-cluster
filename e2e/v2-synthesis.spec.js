import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Synthesis studio", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("renders a first-class studio with blueprint, inputs, compatibility, and output", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Synthesis" })).toBeVisible();
    await expect(page.getByTestId("synthesis-studio")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Stablecoin trust & engagement/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("synthesis-input-card")).toHaveCount(3);
    await expect(page.getByText("Compatibility", { exact: true })).toBeVisible();
    await expect(page.getByTestId("synthesis-output-card")).toContainText("Stablecoin trust weekly panel");
    await expect(page.locator("aside.rd-v2-rail")).toBeHidden();
  });

  test("runs a profile and exposes the registered reusable output", async ({ page }) => {
    await page.getByRole("button", { name: "Run synthesis" }).click();
    await expect(page.getByTestId("synthesis-output-card")).toContainText("Registered in Library");
    await expect(page.getByTestId("synthesis-output-card")).toContainText("18,432");
    await expect(page.getByRole("button", { name: "Open in Library" })).toBeVisible();
  });

  test("custom pair uses Library asset selectors", async ({ page }) => {
    await page.getByRole("button", { name: /Custom pair/i }).click();
    await expect(page.getByLabel("Synthesis input 1")).toBeVisible();
    await expect(page.getByLabel("Synthesis input 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run synthesis" })).toBeEnabled();
  });

  test("mobile keeps the studio and primary action above navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const actionbar = page.locator(".rd-syn-actionbar");
    const nav = page.locator("aside.yzu-sidebar");
    await expect(actionbar).toBeVisible();
    await expect(nav.getByRole("button")).toHaveCount(7);
    const actionBox = await actionbar.boundingBox();
    const navBox = await nav.boundingBox();
    expect(actionBox).toBeTruthy();
    expect(navBox).toBeTruthy();
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(navBox.y + 1);
  });
});
