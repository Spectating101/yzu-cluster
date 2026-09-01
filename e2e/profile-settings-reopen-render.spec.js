import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-reopen";

async function setupLoggedOut(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await mockV2Api(page, {
    profileBody: { found: false, profile: null },
    historyBody: { items: [] },
  });

  await page.unroute("**/library/desk/capabilities");
  await page.route("**/library/desk/capabilities", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 2,
        authenticated: false,
        access: "guest",
        principal: null,
        permissions: {},
        tenancy: { mode: "public", identity_aware: true },
      }),
    }),
  );

  await page.unroute("**/library/desk/session");
  await page.route("**/library/desk/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, authorized: false }),
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

for (const viewport of [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
]) {
  test(`logged-out Profile is composed at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupLoggedOut(page, viewport);
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("profile-unbound")).toBeVisible();
    await expect(page.getByTestId("profile-unbound")).toContainText("Researcher not connected");
    await expect(page.getByTestId("profile-detail-rail")).toContainText("Profile not connected");
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/profile-empty-${viewport.name}.png`, fullPage: false });
  });

  test(`logged-out Settings uses the workspace at ${viewport.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setupLoggedOut(page, viewport);
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Workspace behavior" })).toBeVisible();
    await expect(page.getByText("Connect this browser to a named Research Drive account before linking personal storage.")).toBeVisible();
    await noDocumentOverflow(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/settings-empty-${viewport.name}.png`, fullPage: false });
  });
}
