import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/august-visual-recovery";
const VIEWPORTS = [
  ["1920", { width: 1920, height: 1080 }],
  ["1440", { width: 1440, height: 900 }],
];
const SURFACES = ["home", "library", "discover", "synthesis", "resources", "profile", "settings"];
const AUGUST_RAIL_SURFACES = new Set(["home", "library", "discover", "synthesis", "resources", "profile", "settings"]);

async function settle(page) {
  await waitForShell(page);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(100);
}

test.describe("August visual authority recovery", () => {
  for (const [viewportName, viewport] of VIEWPORTS) {
    for (const tab of SURFACES) {
      test(`${tab} preserves the approved workstation composition at ${viewportName}`, async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        await page.setViewportSize(viewport);
        await mockV2Api(page);
        await page.goto(`/?tab=${tab}`);
        await settle(page);

        await expect(page.locator("main.yzu-main")).toBeVisible();
        if (AUGUST_RAIL_SURFACES.has(tab)) {
          const rail = page.locator("aside.rd-v2-rail");
          await expect(rail).toBeVisible();
          const box = await rail.boundingBox();
          expect(box?.width || 0).toBeGreaterThan(300);
        }

        await page.screenshot({
          path: `${OUT}/${viewportName}-${tab}.png`,
          fullPage: false,
        });
      });
    }
  }
});
