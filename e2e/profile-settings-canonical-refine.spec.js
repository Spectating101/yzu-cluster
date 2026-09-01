import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-canonical-refine";
const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["1920", { width: 1920, height: 1080 }],
];

async function setup(page, viewport, profileBody) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await mockV2Api(page, { profileBody, historyBody: { items: [] } });
  await page.route("**/library/accounts", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ accounts: [], providers: [] }),
  }));
}

async function settle(page) {
  await waitForShell(page);
  await page.waitForTimeout(700);
}

async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

for (const [name, viewport] of VIEWPORTS) {
  test(`refined unbound Profile ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Research profile", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Use my email" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-unbound.png`, fullPage: false });
  });

  test(`canonical thin Profile remains unchanged ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, {
      found: true,
      profile: {
        name_en: "Test Prof",
        title: "Faculty researcher",
        discipline: "YZU",
        email: "researcher@example.test",
      },
    });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Test Prof", { exact: true }).first()).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-thin.png`, fullPage: false });
  });

  test(`refined Settings ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("heading", { name: "Workspace behavior" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-settings.png`, fullPage: false });
  });
}
