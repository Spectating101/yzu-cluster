import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-reopen";

async function setupUnboundResearcher(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await mockV2Api(page, {
    profileBody: { found: false, profile: null },
    historyBody: { items: [] },
  });
}

async function noDocumentOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

async function settle(page) {
  await page.waitForTimeout(260);
}

for (const viewport of [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
]) {
  test(`unbound Profile is composed at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupUnboundResearcher(page, viewport);
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("profile-unbound")).toBeVisible();
    await expect(page.getByTestId("profile-unbound")).toContainText("Researcher not connected");
    await expect(page.getByTestId("profile-detail-rail")).toContainText("Profile not connected");
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/profile-empty-${viewport.name}.png`, fullPage: false });
  });

  test(`unbound Settings uses the workspace at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupUnboundResearcher(page, viewport);
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Workspace behavior" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Research identity" })).toBeVisible();
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/settings-empty-${viewport.name}.png`, fullPage: false });
  });
}
