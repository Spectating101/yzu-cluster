import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const VIEWPORTS = [
  { name: "desktop-wide", width: 1920, height: 905 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 900, height: 760 },
  { name: "mobile", width: 390, height: 844 },
];

async function installAnonymousBrowser(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* Storage can be unavailable before first navigation. */
    }
  });
  await mockV2Api(page, {
    profileBody: { found: false, profile: { unknown: true } },
  });
}

async function assertContained(page, label) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    body: (() => {
      const node = document.querySelector(".rd-v2-body-scroll");
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width, right: rect.right };
    })(),
  }));
  expect(geometry.scrollWidth, `${label}: horizontal viewport overflow`).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.body?.width || 0, `${label}: body collapsed`).toBeGreaterThan(220);
}

test.describe("Profile / Settings anonymous-state visual authority", () => {
  test("renders intentional empty states at certified widths", async ({ page }) => {
    await installAnonymousBrowser(page);
    await mkdir("artifacts/ps-state-visual", { recursive: true });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await expect(page.locator(".rd-v2-profile-unbound")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".rd-v2-profile-identity")).toBeVisible();
      await assertContained(page, `Profile ${viewport.name}`);
      if (viewport.width >= 1680) {
        await expect(page.locator(".rd-v2-body-scroll")).toHaveCSS("display", "grid");
      }
      await page.screenshot({
        path: `artifacts/ps-state-visual/profile-anonymous-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        animations: "disabled",
      });

      await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await expect(page.locator(".rd-v2-settings-statement")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#rd-settings-email")).toHaveValue("");
      await assertContained(page, `Settings ${viewport.name}`);
      if (viewport.width >= 1680) {
        await expect(page.locator(".rd-v2-settings-statement")).toHaveCSS("display", "grid");
      }
      await page.screenshot({
        path: `artifacts/ps-state-visual/settings-anonymous-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
  });
});
