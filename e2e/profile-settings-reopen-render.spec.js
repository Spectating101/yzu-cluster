import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-reopen";

async function setupResearcherState(page, viewport, profileBody) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await mockV2Api(page, {
    profileBody,
    historyBody: { items: [] },
  });

  // Settings visual acceptance should represent a valid connected desk, not a
  // missing test route. Connected-storage authority can legitimately be empty;
  // a synthetic 500 here only dirties the screenshot and tests the harness.
  await page.route("**/library/accounts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accounts: [], providers: [] }),
    }),
  );
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

const UNBOUND = { found: false, profile: null };
const THIN = {
  found: true,
  profile: {
    name_en: "Test Prof",
    title: "Faculty researcher",
    discipline: "YZU",
    email: "researcher@example.test",
  },
};

for (const viewport of [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
]) {
  test(`unbound Profile is composed at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupResearcherState(page, viewport, UNBOUND);
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("profile-unbound")).toBeVisible();
    await expect(page.getByTestId("profile-unbound")).toContainText("Researcher not connected");
    await expect(page.getByTestId("profile-detail-rail")).toContainText("Profile not connected");
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/profile-empty-${viewport.name}.png`, fullPage: false });
  });

  test(`thin Profile remains composed at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupResearcherState(page, viewport, THIN);
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("profile-memory-thin")).toBeVisible();
    await expect(page.getByTestId("profile-lab")).toBeVisible();
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/profile-thin-${viewport.name}.png`, fullPage: false });
  });

  test(`unbound Settings uses the workspace at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupResearcherState(page, viewport, UNBOUND);
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Workspace behavior" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Research identity" })).toBeVisible();
    await expect(page.getByText("No storage providers are configured on this host.")).toBeVisible();
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/settings-empty-${viewport.name}.png`, fullPage: false });
  });
}
