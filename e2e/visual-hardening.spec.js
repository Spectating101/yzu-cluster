import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/visual-hardening";
const DESKTOP = { width: 1920, height: 961 };
const MOBILE = { width: 390, height: 844 };
const SURFACES = [
  ["home", "home"],
  ["discover", "discover"],
  ["history", "history"],
  ["library", "library"],
  ["synthesis", "synthesis"],
  ["profile", "profile"],
  ["settings", "settings"],
];

async function settle(page, ms = 900) {
  await waitForShell(page);
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(100);
}

async function assertResearcherFacing(page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("[object Object]");
  expect(body).not.toMatch(/fixture\/ops noise/i);
  expect(body).not.toMatch(/Bind example identity/i);
  expect(body).not.toMatch(/Kong, De-Rong/i);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Research Drive visual hardening", () => {
  for (const viewport of [
    ["desktop", DESKTOP],
    ["mobile", MOBILE],
  ]) {
    const [viewportName, size] = viewport;
    for (const [tab, name] of SURFACES) {
      test(`${name} is researcher-facing at ${viewportName}`, async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        await page.setViewportSize(size);
        await mockV2Api(page);
        await page.goto(`/?tab=${tab}`);
        await settle(page);
        await assertResearcherFacing(page);
        await page.screenshot({
          path: `${OUT}/${name}-${viewportName}.png`,
          fullPage: false,
        });
      });
    }
  }

  test("stale pilot browser identity is purged and never becomes research truth", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript(() => {
      localStorage.setItem("procure_user_email", "drkong@saturn.yzu.edu.tw");
    });
    await mockV2Api(page, {
      profileBody: { found: false, profile: { unknown: true } },
    });

    const requestedEmails = [];
    await page.route("**/library/faculty/profile*", (route) => {
      const email = new URL(route.request().url()).searchParams.get("email") || "";
      requestedEmails.push(email);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: false, profile: { email, unknown: true } }),
      });
    });

    await page.goto("/?tab=profile");
    await settle(page, 1100);

    expect(requestedEmails).not.toContain("drkong@saturn.yzu.edu.tw");
    expect(await page.evaluate(() => localStorage.getItem("procure_user_email"))).toBeNull();
    await expect(page.getByText("No faculty identity is bound to this desk yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use my email" })).toBeVisible();
    await expect(page.getByText(/Example/i)).toHaveCount(0);
    await assertResearcherFacing(page);
  });

  test("slow desk enrichment reads as usable progress rather than a stalled app", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await mockV2Api(page, { healthDelayMs: 4200, jobsDelayMs: 3200 });
    await page.goto("/?tab=home");
    await waitForShell(page);

    await expect(page.getByText(/Desk open · status still loading/i)).toBeVisible({ timeout: 3500 });
    await page.screenshot({ path: `${OUT}/home-staged-loading-desktop.png` });

    await page.goto("/?tab=history");
    await waitForShell(page);
    await expect(page.getByText(/Research history is ready/i)).toBeVisible({ timeout: 3500 });
    await page.screenshot({ path: `${OUT}/history-staged-loading-desktop.png` });
  });

  test("nested Library values render as structured content", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await mockV2Api(page);
    await page.route("**/query/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: [{
            date: "2026-04-30",
            country: "TW",
            metadata: { source: "MOPS", flags: { verified: true, revision: 2 } },
            tags: ["issuer", "quarterly"],
          }],
        }),
      }),
    );

    await page.goto("/?tab=library&dataset=gdelt_asia_daily_country_panel");
    await settle(page, 1300);
    const preview = page.getByTestId("library-data-preview");
    await expect(preview).toBeVisible();
    await expect(preview).not.toContainText("[object Object]");
    await expect(preview.locator(".rd-v2-library-structured-value").first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/library-structured-preview-desktop.png` });
  });
});
