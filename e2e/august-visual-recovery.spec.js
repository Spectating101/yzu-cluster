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
  await expect(page.getByText("TWSE ESG issuer labels · September refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Stablecoin exchange activity backfill", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("MOPS governance disclosures", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Compare Taiwan issuer fundamentals with news-risk shocks/)).toBeVisible();
  await expect(page.getByRole("button", { name: /\+ 1 more recent event in History/ })).toBeVisible();
}

async function openProductionHome(page) {
  await page.goto("/?tab=home");
  await settle(page);
  await expect(page.locator(".rd-v2-home-authority")).toBeVisible();
  await expectPopulatedHome(page);
}

async function expectTab(page, expected) {
  await expect.poll(() => {
    const url = new URL(page.url());
    return url.searchParams.get("tab") || "home";
  }).toBe(expected);
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

test.describe("Home production interaction proof", () => {
  test("production Home controls reach their real product surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockV2Api(page, {
      datasetsBody: HOME_PRODUCTION_DATASETS,
      healthBody: HOME_PRODUCTION_HEALTH,
      jobsBody: HOME_PRODUCTION_JOBS,
      profileBody: HOME_PRODUCTION_PROFILE,
    });

    await openProductionHome(page);
    const focal = page.locator('[data-testid="home-focal-asset"]');
    await focal.getByRole("button", { name: "Open in Library", exact: true }).click();
    await expectTab(page, "library");
    await expect(page.locator(".rd-v2-library-page")).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("dataset")).toBe("gdelt_asia_daily_country_panel");

    await openProductionHome(page);
    await page.locator('[data-testid="home-focal-asset"]').getByRole("button", { name: "Inspect schema", exact: true }).click();
    const preview = page.getByRole("dialog", { name: /Asia daily news-risk panel preview/i });
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Close preview", exact: true }).click();
    await expect(preview).toBeHidden();

    await openProductionHome(page);
    await page.locator('[data-testid="home-continue"]').getByRole("button", { name: "Review", exact: true }).click();
    await expectTab(page, "discover");
    await expect(page.locator(".rd-v2-discover-page--history")).toBeVisible();

    await openProductionHome(page);
    await page.locator(".rd-v2-home-continue-secondary").click();
    await expectTab(page, "discover");
    await expect(page.locator(".rd-v2-discover-page--history")).toBeVisible();

    await openProductionHome(page);
    await page.locator(".rd-v2-home-authority-trail-row").filter({ hasText: "GDELT Asia news-risk · August refresh" }).click();
    await expectTab(page, "library");
    await expect(page.locator(".rd-v2-library-page")).toBeVisible();

    await openProductionHome(page);
    await page.locator(".rd-v2-home-authority-trail-row").filter({ hasText: "Stablecoin exchange activity backfill" }).click();
    await expectTab(page, "discover");
    await expect(page.locator(".rd-v2-discover-page--history")).toBeVisible();

    await openProductionHome(page);
    await page.getByRole("button", { name: /\+ 1 more recent event in History/ }).click();
    await expectTab(page, "discover");
    await expect(page.locator(".rd-v2-discover-page--history")).toBeVisible();

    await openProductionHome(page);
    await page.locator(".rd-v2-home-authority-card.headroom").getByRole("button", { name: "Manage resources →", exact: true }).click();
    await expectTab(page, "resources");
    await expect(page.getByRole("heading", { level: 1, name: "Resources", exact: true })).toBeVisible();

    await openProductionHome(page);
    await page.getByRole("button", { name: "+ New research", exact: true }).click();
    await expectTab(page, "synthesis");
    await expect(page.locator('[data-testid="synthesis-studio"]')).toBeVisible();

    await openProductionHome(page);
    await page.locator('[data-testid="home-research-seed"] button').first().click();
    const askTab = page.locator('aside.rd-v2-rail').getByRole("tab", { name: "Ask", exact: true });
    const detailTab = page.locator('aside.rd-v2-rail').getByRole("tab", { name: "Detail", exact: true });
    await expect(askTab).toHaveAttribute("aria-selected", "true");
    await detailTab.click();
    await expect(detailTab).toHaveAttribute("aria-selected", "true");
  });
});
