import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-canonical-refine";
const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["1920", { width: 1920, height: 1080 }],
];

const REGISTRY_PREVIEW = {
  found: true,
  profile: {
    name_en: "Kong, De-Rong",
    title: "Assistant Professor",
    discipline: "Finance",
    email: "drkong@saturn.yzu.edu.tw",
    paper_count_parsed: 18,
    specialties: ["empirical asset pricing", "investment", "FinTech", "corporate finance"],
    methods: ["panel regression", "event study", "causal inference"],
    current_research: "Digital finance, investor behavior, and empirical capital-market research",
    publication_highlights: [
      "Digital finance and capital-market participation",
      "Investor behavior under information shocks",
      "Empirical evidence on corporate financial decisions",
    ],
    domain_tags: ["fintech", "finance"],
    lab_fintech_stack: [],
  },
};

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
  await page.waitForTimeout(900);
}

async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

for (const [name, viewport] of VIEWPORTS) {
  test(`Profile becomes a registry explorer when unbound ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, REGISTRY_PREVIEW);
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("heading", { name: "Find a researcher" })).toBeVisible();
    await expect(page.getByText("Kong, De-Rong", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Use as my profile" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-unbound.png`, fullPage: false });
  });

  test(`canonical thin Profile remains stable ${name}`, async ({ page }) => {
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
    await page.addInitScript(() => {
      window.localStorage.setItem("rd_v2_settings", JSON.stringify({ email: "researcher@example.test" }));
      window.localStorage.setItem("rd_v2_user_email", "researcher@example.test");
    });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Test Prof", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find a researcher" })).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-thin.png`, fullPage: false });
  });

  test(`Settings is a workspace-policy surface ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("heading", { name: "Your desk, by default" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How the desk responds" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Private workspace authority" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-settings.png`, fullPage: false });
  });
}
