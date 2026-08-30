import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/visual-hardening";
const DESKTOP = { width: 1920, height: 961 };
const COMPACT_DESKTOP = { width: 1180, height: 800 };
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

const CONNECTED_ACCOUNTS = {
  accounts: [
    {
      id: "connected-account-g-lab",
      provider: "google_drive",
      label: "Lab Drive",
      email: "lab@example.test",
      access_mode: "index",
      status: "connected",
      verified_at: "2026-08-30T12:00:00Z",
    },
  ],
  providers: [
    {
      id: "google_drive",
      label: "Google Drive",
      configured: true,
      rclone_available: true,
      supports_index_only: true,
      default_access_mode: "index",
    },
    {
      id: "dropbox",
      label: "Dropbox",
      configured: true,
      rclone_available: true,
      supports_index_only: true,
      default_access_mode: "read",
    },
    {
      id: "onedrive",
      label: "OneDrive",
      configured: true,
      rclone_available: true,
      supports_index_only: false,
      default_access_mode: "read",
    },
  ],
};

const RESEARCH_SEED = {
  version: 1,
  principal: {
    id: "researcher-1",
    display_name: "Researcher One",
  },
  bootstrap_mode: "faculty_profile",
  research_context: {
    title: "Test Prof",
    discipline: "YZU",
  },
  starter_prompts: [
    "What evidence in my Library is useful for the current research direction?",
    "Which evidence gaps should I investigate next?",
  ],
  reference_holdings: [],
  procurement_recommendations: [],
  connected_sources: [{
    id: "connected-account-g-lab",
    kind: "connected_storage",
    provider: "google_drive",
    label: "Lab Drive",
    email: "lab@example.test",
    access_mode: "index",
    status: "verified",
  }],
  source_summary: { connected_sources: 1 },
  policy: {
    connected_storage_optional: true,
    seed_without_connected_storage: true,
    automatic_byte_copy: false,
    automatic_recursive_cloud_index: false,
    materialization_requires_explicit_operation: true,
  },
};

async function visualMocks(page, options = {}) {
  await mockV2Api(page, options);
  // These routes were added after the long-lived v2 fixture. Keep this visual
  // gate representative of the current desk instead of letting Vite proxy them
  // to a backend that is intentionally absent in mocked CI.
  await page.route("**/library/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RESEARCH_SEED),
    }),
  );
  await page.route("**/library/accounts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CONNECTED_ACCOUNTS),
    }),
  );
}

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
        await visualMocks(page);
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

  for (const [tab, name] of [["home", "home"], ["library", "library"]]) {
    test(`${name} keeps a real work canvas at small-desktop width`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize(COMPACT_DESKTOP);
      await visualMocks(page);
      await page.goto(`/?tab=${tab}`);
      await settle(page);
      await assertResearcherFacing(page);

      const main = await page.locator(".yzu-main").boundingBox();
      const inspector = await page.locator(".yzu-inspector").boundingBox();
      expect(main?.width || 0).toBeGreaterThan(560);
      expect(inspector?.width || 0).toBeLessThanOrEqual(330);
      await page.screenshot({ path: `${OUT}/${name}-compact-desktop.png` });
    });
  }

  test("quiet desktop surfaces do not reserve a redundant inspector column", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await visualMocks(page);
    for (const tab of ["profile", "settings", "synthesis"]) {
      await page.goto(`/?tab=${tab}`);
      await settle(page, 500);
      await expect(page.locator(".yzu-inspector")).toBeHidden();
      const main = await page.locator(".yzu-main").boundingBox();
      expect(main?.width || 0).toBeGreaterThan(1500);
    }
  });

  test("connected storage is visible in the first Settings viewport", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await visualMocks(page);
    await page.goto("/?tab=settings");
    await settle(page);
    const section = page.getByText("Connected storage", { exact: true }).first();
    await expect(section).toBeVisible();
    const box = await section.boundingBox();
    expect(box?.y ?? 10_000).toBeLessThan(DESKTOP.height - 80);
    await expect(page.getByText("Lab Drive", { exact: true })).toBeVisible();
  });

  test("stale pilot browser identity is purged and never becomes research truth", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript(() => {
      localStorage.setItem("procure_user_email", "drkong@saturn.yzu.edu.tw");
    });
    await visualMocks(page, {
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

  test("slow Home enrichment reads as usable progress rather than a stalled app", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await visualMocks(page, { healthDelayMs: 4200 });
    await page.goto("/?tab=home");
    await waitForShell(page);

    await expect(page.getByText(/Desk open · status still loading/i)).toBeVisible({ timeout: 3500 });
    await page.screenshot({ path: `${OUT}/home-staged-loading-desktop.png` });
  });

  test("slow History approval enrichment keeps the lifecycle visibly usable", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await visualMocks(page, { jobsDelayMs: 4200 });
    await page.goto("/?tab=history");
    await waitForShell(page);

    await expect(page.getByText(/Research history is ready/i)).toBeVisible({ timeout: 3500 });
    await page.screenshot({ path: `${OUT}/history-staged-loading-desktop.png` });
  });

  test("nested Library values render as structured content", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await visualMocks(page);
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
