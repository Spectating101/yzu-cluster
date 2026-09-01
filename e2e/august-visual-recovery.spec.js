import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import {
  HOME_PRODUCTION_DATASETS,
  HOME_PRODUCTION_HEALTH,
  HOME_PRODUCTION_JOBS,
  HOME_PRODUCTION_PROFILE,
} from "./fixtures/homeProductionState.js";

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

async function expectHomeContainment(page, viewportWidth) {
  const result = await page.evaluate(() => {
    const pageNode = document.querySelector(".rd-v2-home-authority");
    const nextCard = document.querySelector(".rd-v2-home-authority-card.next");
    const bodyScroll = document.querySelector(".rd-v2-home-authority > .rd-v2-body-scroll");
    if (!pageNode || !nextCard || !bodyScroll) return { missing: true };

    const card = nextCard.getBoundingClientRect();
    const body = bodyScroll.getBoundingClientRect();
    const descendants = Array.from(
      nextCard.querySelectorAll("button, .rd-v2-chip, .rd-v2-chips-row, p, strong, span, em"),
    );
    const violations = descendants
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          cls: node.className || "",
          left: rect.left,
          right: rect.right,
          cardLeft: card.left,
          cardRight: card.right,
        };
      })
      .filter((entry) => entry.left < card.left - 1 || entry.right > card.right + 1);

    return {
      missing: false,
      violations,
      cardRight: card.right,
      bodyRight: body.right,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  expect(result.missing).toBe(false);
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  expect(result.cardRight).toBeLessThanOrEqual(result.bodyRight + 1);
  expect(result.scrollWidth).toBeLessThanOrEqual(Math.ceil(viewportWidth));
  expect(result.clientWidth).toBeLessThanOrEqual(Math.ceil(viewportWidth));
}

async function expectPopulatedHome(page) {
  await expect(page.getByText("GDELT Asia news-risk · August refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Taiwan issuer fundamentals · Q2 refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Stablecoin exchange activity backfill", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("MOPS governance disclosures", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Compare Taiwan issuer fundamentals with news-risk shocks around earnings dates.", { exact: true })).toBeVisible();
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

        if (tab === "home") {
          await expectHomeContainment(page, viewport.width);
        }

        await page.screenshot({
          path: `${OUT}/${viewportName}-${tab}.png`,
          fullPage: false,
        });
      });
    }

    test(`home populated production state at ${viewportName}`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize(viewport);
      await mockV2Api(page, {
        datasetsBody: HOME_PRODUCTION_DATASETS,
        healthBody: HOME_PRODUCTION_HEALTH,
        jobsBody: HOME_PRODUCTION_JOBS,
        profileBody: HOME_PRODUCTION_PROFILE,
      });
      await page.goto("/?tab=home");
      await settle(page);

      await expect(page.locator("main.yzu-main")).toBeVisible();
      await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
      await expectPopulatedHome(page);
      await expectHomeContainment(page, viewport.width);

      await page.screenshot({
        path: `${OUT}/${viewportName}-home-production.png`,
        fullPage: false,
      });
    });
  }
});
