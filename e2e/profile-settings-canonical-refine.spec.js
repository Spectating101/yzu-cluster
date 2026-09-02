import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-canonical-refine";
const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["1920", { width: 1920, height: 1080 }],
];

const RICH_PROFILE = {
  found: true,
  profile: {
    name_en: "Kong, De-Rong",
    title: "Assistant Professor",
    discipline: "Finance",
    email: "rich.researcher@example.test",
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

const DESK_ACCESS = {
  version: 2,
  authenticated: true,
  access: "operator",
  principal: {
    id: "visual-user",
    email: "",
    display_name: "Researcher",
    role: "operator",
  },
  permissions: {
    view_research_data: true,
    view_faculty_profile: true,
    view_operations: true,
    use_ask: true,
    submit_collection: true,
    approve_jobs: true,
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
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(DESK_ACCESS),
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
  test(`Guest Profile describes Research Drive ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("heading", { name: "Research Drive", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What it does" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it handles research" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find a researcher" })).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-guest.png`, fullPage: false });
  });

  test(`Sparse signed-in Profile keeps the full personalization architecture ${name}`, async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Research context" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What Research Drive uses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Works on record" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence relationships" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-user-sparse.png`, fullPage: false });
  });

  test(`Rich signed-in Profile showcases recorded personalization context ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, RICH_PROFILE, "rich.researcher@example.test");
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Kong, De-Rong", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Digital finance, investor behavior, and empirical capital-market research", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("18 indexed works", { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-user-rich.png`, fullPage: false });
  });

  test(`Settings uses simple category-and-row grammar ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personalization", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-settings.png`, fullPage: false });
  });
}
