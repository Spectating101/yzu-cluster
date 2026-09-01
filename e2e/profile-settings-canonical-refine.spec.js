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

const UNBOUND_DESK_ACCESS = {
  version: 2,
  authenticated: false,
  access: "public_guest",
  principal: null,
  permissions: {
    view_research_data: true,
    view_faculty_profile: true,
    view_operations: false,
    use_ask: false,
    submit_collection: false,
    approve_jobs: false,
  },
};

async function setup(page, viewport, profileBody, boundEmail = "") {
  await page.setViewportSize(viewport);
  await page.addInitScript((email) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    if (email) window.localStorage.setItem("procure_user_email", email);
  }, boundEmail);
  await mockV2Api(page, { profileBody, historyBody: { items: [] } });
  // The generic fixture is an authenticated operator. Profile browsing needs
  // to prove that account identity and faculty-registry lookup are distinct.
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(UNBOUND_DESK_ACCESS),
  }));
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
    await expect(page.getByText("Registry preview", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Set my own identity →" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-unbound.png`, fullPage: false });
  });

  test(`canonical thin Profile remains stable ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(
      page,
      viewport,
      {
        found: true,
        profile: {
          name_en: "Test Prof",
          title: "Faculty researcher",
          discipline: "YZU",
          email: "researcher@example.test",
        },
      },
      "researcher@example.test",
    );
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
