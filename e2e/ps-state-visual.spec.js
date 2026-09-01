import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const VIEWPORTS = [
  { name: "desktop-wide", width: 1920, height: 905 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 900, height: 760 },
  { name: "mobile", width: 390, height: 844 },
];

async function installUnboundResearchProfile(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* Storage can be unavailable before first navigation. */
    }
  });
  // Desk access stays authenticated so Profile / Settings are reachable. The
  // state under test is the actual empty product state: no faculty registry
  // identity is bound to this research desk.
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

async function expectInside(child, parent, label) {
  const [childBox, parentBox] = await Promise.all([child.boundingBox(), parent.boundingBox()]);
  expect(childBox && parentBox, `${label}: geometry missing`).toBeTruthy();
  expect(childBox.x, `${label}: spills left`).toBeGreaterThanOrEqual(parentBox.x - 2);
  expect(childBox.x + childBox.width, `${label}: spills right`).toBeLessThanOrEqual(parentBox.x + parentBox.width + 2);
}

test.describe("Profile / Settings unbound-research-profile visual authority", () => {
  test("renders intentional empty states at certified widths", async ({ page }) => {
    await installUnboundResearchProfile(page);
    await mkdir("artifacts/ps-state-visual", { recursive: true });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      const unbound = page.locator(".rd-v2-profile-unbound");
      await expect(unbound).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".rd-v2-profile-identity")).toBeVisible();
      await expect(unbound.locator(".rd-v2-profile-section-head")).toHaveCSS("background-image", "none");
      await assertContained(page, `Profile ${viewport.name}`);
      if (viewport.width >= 1680) {
        await expect(page.locator(".rd-v2-body-scroll")).toHaveCSS("display", "grid");
      }
      await page.screenshot({
        path: `artifacts/ps-state-visual/profile-unbound-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        animations: "disabled",
      });

      await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      const statement = page.locator(".rd-v2-settings-statement");
      await expect(statement).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#rd-settings-email")).toHaveValue("");
      await assertContained(page, `Settings ${viewport.name}`);

      const sections = statement.locator(":scope > .rd-v2-statement-section");
      const account = sections.nth(1);
      const identity = sections.nth(3);
      const desk = sections.nth(4);
      await expectInside(account.locator(".rd-v2-statement-row").first(), account, `Settings ${viewport.name}: account row`);
      await expectInside(page.locator("#rd-settings-email"), identity, `Settings ${viewport.name}: identity input`);
      await expectInside(identity.getByRole("button", { name: "Save identity" }), identity, `Settings ${viewport.name}: identity action`);
      const deskActions = desk.locator(".rd-v2-settings-row.stack .rd-v2-btn");
      for (let i = 0; i < await deskActions.count(); i += 1) {
        await expectInside(deskActions.nth(i), desk, `Settings ${viewport.name}: desk action ${i + 1}`);
      }

      if (viewport.width >= 1680) {
        await expect(statement).toHaveCSS("display", "grid");
      }
      await page.screenshot({
        path: `artifacts/ps-state-visual/settings-unbound-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
  });
});
