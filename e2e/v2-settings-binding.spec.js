/**
 * Settings support route + nav demotion.
 * Settings is not in primary sidebar; Advanced recovery remains via direct URL.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/status/generated/profile-settings-visual");

test.describe("Settings demoted from primary navigation", () => {
  test("sidebar has no Settings; support route keeps Advanced recovery", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const nav = page.locator(".yzu-sidebar nav");
    await expect(nav.getByRole("button", { name: /^Settings$/i })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: /^Profile$/i })).toBeVisible();

    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-page-head h1")).toContainText(/Advanced recovery/i);
    await expect(page.getByTestId("settings-support-note")).toBeVisible();
    await expect(page.getByTestId("settings-group-advanced")).toBeVisible();
    await expect(page.getByTestId("settings-group-identity")).toHaveCount(0);
    await expect(page.getByText(/MCP tools/i)).toHaveCount(0);
    await expect(page.getByTestId("settings-detail-action")).toHaveCount(0);

    await page.screenshot({
      path: path.join(OUT, "settings_desktop_1440.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(nav.getByRole("button", { name: /^Settings$/i })).toHaveCount(0);
    await page.screenshot({
      path: path.join(OUT, "settings_mobile_390.png"),
      fullPage: false,
    });
  });

  test("workspace preferences persist from header account menu", async ({ page }) => {
    await mockV2Api(page);
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "rd_v2_settings",
          JSON.stringify({ defaultTab: "home", onSelect: "detail", email: "" }),
        );
      } catch {
        /* ignore */
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await page.getByTestId("header-account-menu").click();
    await expect(page.getByTestId("workspace-preferences")).toBeVisible();
    await page.getByTestId("workspace-default-tab").selectOption("library");
    await page.getByTestId("workspace-on-select").selectOption("ask");

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rd_v2_settings") || "{}"));
    expect(stored.defaultTab).toBe("library");
    expect(stored.onSelect).toBe("ask");
  });
});
