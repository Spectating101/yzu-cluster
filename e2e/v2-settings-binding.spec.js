/**
 * Settings binding — Identity → Access → Defaults → collapsed Advanced; Detail never Loading.
 * Run via sibling package tooling (see scripts note in commit) or:
 *   TMPDIR=$PWD/.tmp-pw npx playwright test e2e/v2-settings-binding.spec.js --retries=0
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/status/generated/profile-settings-visual");

test.describe("Settings binding", () => {
  test("centre order, collapsed Advanced, Detail facts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Settings" })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId("settings-group-identity")).toBeVisible();
    await expect(page.getByTestId("settings-group-access")).toBeVisible();
    await expect(page.getByTestId("settings-group-defaults")).toBeVisible();
    await expect(page.getByTestId("settings-group-advanced")).toBeVisible();
    await expect(page.getByText(/MCP tools/i)).toHaveCount(0);
    await expect(page.getByText(/Jobs pending approval/i)).toHaveCount(0);

    const centre = page.getByTestId("settings-centre");
    const titles = await centre.locator(".rd-v2-statement-head h2, summary").allTextContents();
    const normalized = titles.map((t) => t.trim().toLowerCase());
    const iId = normalized.findIndex((t) => t.includes("identity"));
    const iAccess = normalized.findIndex((t) => t.includes("access"));
    const iDefaults = normalized.findIndex((t) => t.includes("defaults"));
    const iAdvanced = normalized.findIndex((t) => t.includes("advanced"));
    expect(iId).toBeGreaterThanOrEqual(0);
    expect(iAccess).toBeGreaterThan(iId);
    expect(iDefaults).toBeGreaterThan(iAccess);
    expect(iAdvanced).toBeGreaterThan(iDefaults);

    await expect(page.getByTestId("settings-advanced-body")).toBeHidden();
    await expect(page.locator(".rd-v2-settings-summary")).toHaveCount(0);

    const detail = page.getByTestId("settings-detail-rail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/^Loading/i)).toHaveCount(0);
    await expect(page.getByTestId("settings-detail-action")).toBeVisible();
    await expect(detail.getByText(/Identity|Access|Defaults|Advanced/i).first()).toBeVisible();

    await page.screenshot({
      path: path.join(OUT, "settings_desktop_1440.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(OUT, "settings_mobile_390.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("settings-group-advanced").locator("summary").click();
    await expect(page.getByTestId("settings-advanced-body")).toBeVisible();
    await expect(page.getByLabel("Fallback access token")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "settings_advanced_desktop_1440.png"),
      fullPage: false,
    });
  });
});
