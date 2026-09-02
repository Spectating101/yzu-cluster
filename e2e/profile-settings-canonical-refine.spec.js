import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/profile-settings-canonical-refine";
const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["1920", { width: 1920, height: 1080 }],
];

const RESEARCHER_PROFILE = {
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

const PROFILE_PORTRAIT = {
  headline: "Empirical finance across markets, behavior, and digital systems",
  overview: "The supplied record describes an empirical finance program that connects market participation, investor behavior, corporate decisions, and the growing role of digital finance. The strongest through-line is not a single asset class but the use of empirical methods to study how information and financial technology change decisions and market outcomes.",
  themes: [
    {
      label: "Digital finance and market participation",
      read: "The current-research field and a supplied publication highlight both place digital finance inside questions about participation in capital markets.",
      basis: ["current_research", "publication_highlights"],
    },
    {
      label: "Investor response to information",
      read: "Investor behavior is explicit in the current research record and appears again in the supplied work on information shocks.",
      basis: ["current_research", "publication_highlights"],
    },
    {
      label: "Corporate financial decisions",
      read: "Corporate finance is an explicit specialty and one supplied work centers on empirical evidence around corporate financial decisions.",
      basis: ["specialties", "publication_highlights"],
    },
  ],
  methods: [
    {
      label: "Panel regression",
      read: "Explicitly recorded as a method, consistent with the profile's emphasis on empirical capital-market questions.",
      basis: ["methods"],
    },
    {
      label: "Event study",
      read: "Explicitly recorded as a method for examining market response around discrete information or policy events.",
      basis: ["methods"],
    },
    {
      label: "Causal inference",
      read: "The record explicitly identifies causal inference as part of the researcher's analytical toolkit.",
      basis: ["methods"],
    },
  ],
  connections: [
    {
      label: "Technology × behavior",
      read: "The supplied record connects FinTech and digital finance with questions about investor participation and behavioral response.",
      basis: ["specialties", "current_research"],
    },
    {
      label: "Information × market outcomes",
      read: "The combination of investor-behavior research, information-shock work, and event-study methods makes information transmission a visible cross-cutting concern.",
      basis: ["publication_highlights", "methods"],
    },
    {
      label: "Firm decisions × capital markets",
      read: "Corporate-finance specialization sits alongside empirical capital-market research, suggesting a bridge between firm-level decisions and market evidence.",
      basis: ["specialties", "current_research"],
    },
  ],
  works: [
    {
      label: "Digital finance and capital-market participation",
      read: "Connects the digital-finance theme to participation in capital markets.",
      basis: ["publication_highlights"],
    },
    {
      label: "Investor behavior under information shocks",
      read: "Makes the information-and-behavior connection explicit in the supplied publication record.",
      basis: ["publication_highlights"],
    },
    {
      label: "Empirical evidence on corporate financial decisions",
      read: "Extends the profile from investor-side behavior toward firm-side financial decision making.",
      basis: ["publication_highlights"],
    },
  ],
  evidence_read: "The profile supplies research context and publication signals, but no profile-to-Library relationship is recorded in this fixture. Research Drive therefore should not imply that any of these works are held evidence.",
  unknowns: [
    "Which datasets support each recorded publication",
    "Whether the listed research directions are currently funded projects",
    "The exact relationship between each method and each publication",
  ],
  source_count: 14,
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

  await page.unroute("**/api/library/chat/stream");
  await page.unroute("**/api/library/chat");
  const fulfillPortrait = (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      session_id: "profile-portrait-visual",
      reply: JSON.stringify(PROFILE_PORTRAIT),
    }),
  });
  await page.route("**/api/library/chat/stream", fulfillPortrait);
  await page.route("**/api/library/chat", fulfillPortrait);
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
  test(`Guest Profile guides the Research Drive workflow ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, { found: false, profile: null });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByRole("heading", { name: "From discovery to evidence-grounded research work", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start here", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What it does", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it handles research", exact: true })).toBeVisible();
    await expect(page.getByText("Discover", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Library", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Synthesis", { exact: true }).first()).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-guest.png`, fullPage: false });
  });

  test(`Signed-in Profile is an AI-grounded research portrait ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await setup(page, viewport, RESEARCHER_PROFILE, "rich.researcher@example.test");
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("Kong, De-Rong", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("AI research portrait", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Empirical finance across markets, behavior, and digital systems" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How your research hangs together" })).toBeVisible();
    await expect(page.getByText("Technology × behavior", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recorded facts" })).toBeVisible();
    await expect(page.getByText("AI synthesized", { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${OUT}/${name}-profile-user.png`, fullPage: false });
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
