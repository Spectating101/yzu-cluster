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

const PROFILE_BODY = {
  found: true,
  profile: {
    email: "researcher@example.test",
    name_en: "Researcher One",
    discipline: "Finance",
    specialties: ["FinTech", "digital assets", "market microstructure"],
    method_tags: ["panel regression", "event study", "network analysis"],
    domain_tags: ["fintech", "crypto", "on_chain"],
    paper_count_parsed: 18,
    research_tracks: [
      {
        id: "digital-asset-market-quality",
        title: "Digital-asset market quality and information transmission",
        phase: "active_grant",
        weight: 1,
      },
      {
        id: "financial-data-infrastructure",
        title: "Reusable financial research data infrastructure",
        phase: "active",
        weight: 0.8,
      },
    ],
    publication_highlights: [
      "Researcher One (2026). Digital-asset market quality and information transmission.",
      "Researcher One (2025). Evidence infrastructure for empirical finance.",
      "Researcher One (2024). Network signals in financial markets.",
    ],
    lab_fintech_stack: [
      {
        id: "issuer_weekly_panel",
        label: "Issuer weekly fundamentals",
        route: "vault",
        registry_dataset_ids: ["issuer_weekly_panel"],
      },
      {
        id: "stablecoin_activity",
        label: "Stablecoin on-chain activity",
        route: "bigquery",
        registry_dataset_ids: ["stablecoin_activity"],
      },
    ],
    procurement_recommendations: [
      {
        dataset_id: "exchange_stablecoin_volume",
        dataset: "Exchange-level stablecoin volume",
        source_route: "datacite_doi",
        search_query: "stablecoin exchange volume depeg",
      },
    ],
  },
};

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

const RICH_JOBS = {
  jobs: [
    {
      id: "job-governance-review",
      status: "pending_approval",
      type: "procure",
      candidate_key: "url:https://example.test/mops-governance.csv",
      created_at: "2026-08-30T14:30:00Z",
      updated_at: "2026-08-30T14:35:00Z",
      plan: {
        title: "Taiwan issuer governance disclosures",
        source: "TWSE / MOPS",
        summary: "Issuer-quarter governance fields are ready for researcher review before collection.",
      },
    },
    {
      id: "job-stablecoin-running",
      status: "running",
      type: "procure",
      candidate_key: "url:https://example.test/stablecoin-market.csv",
      created_at: "2026-08-30T13:10:00Z",
      updated_at: "2026-08-30T14:20:00Z",
      plan: {
        title: "Stablecoin market activity",
        source: "DataCite route",
        summary: "Collecting the approved market-activity evidence package.",
      },
      message: "18 of 24 files received",
    },
    {
      id: "job-security-complete",
      status: "completed",
      type: "procure",
      registered_dataset_id: "stablecoin_security_panel",
      created_at: "2026-08-29T11:00:00Z",
      updated_at: "2026-08-30T11:42:00Z",
      plan: {
        title: "Stablecoin security panel",
        source: "Registered Library asset",
        summary: "Collection completed and the resulting evidence is registered.",
      },
    },
  ],
};

const POPULATED_DISCOVER = {
  sections: [{
    id: "external",
    title: "Available sources",
    rows: [
      {
        candidate_key: "url:https://data.example.test/depeg-events.csv",
        title: "Stablecoin de-peg event catalogue",
        source: "DataCite",
        collect_via: "datacite_doi",
        url: "https://data.example.test/depeg-events.csv",
        kind: "dataset",
        coverage: "2019–2026",
        refresh_frequency: "Monthly",
        description: "Dated de-peg events with asset identity, event window, and observed price deviation.",
      },
      {
        candidate_key: "url:https://data.example.test/exchange-volume.parquet",
        title: "Exchange-level stablecoin volume panel",
        source: "Public research archive",
        collect_via: "http_manifest",
        url: "https://data.example.test/exchange-volume.parquet",
        kind: "artifact",
        coverage: "2021–2026",
        refresh_frequency: "Quarterly",
        description: "Daily exchange-by-asset trading volume suitable for event-window activity comparisons.",
      },
      {
        candidate_key: "url:https://data.example.test/reserves.json",
        title: "Stablecoin reserve attestations",
        source: "Issuer disclosures",
        collect_via: "http_manifest",
        url: "https://data.example.test/reserves.json",
        kind: "artifact",
        coverage: "2020–2026",
        refresh_frequency: "Monthly",
        description: "Issuer reserve composition and attestation dates for collateral-quality controls.",
      },
      {
        candidate_key: "url:https://data.example.test/onchain.csv",
        title: "Stablecoin on-chain transfer activity",
        source: "Public blockchain dataset",
        collect_via: "http_manifest",
        url: "https://data.example.test/onchain.csv",
        kind: "dataset",
        coverage: "2020–2026",
        refresh_frequency: "Daily",
        description: "Daily transfer counts, value, and active-address measures across major stablecoins.",
      },
      {
        candidate_key: "url:https://data.example.test/liquidity.csv",
        title: "Stablecoin market-liquidity indicators",
        source: "Open market archive",
        collect_via: "http_manifest",
        url: "https://data.example.test/liquidity.csv",
        kind: "dataset",
        coverage: "2022–2026",
        refresh_frequency: "Daily",
        description: "Bid-ask, depth, and turnover indicators for market-quality analysis around de-peg episodes.",
      },
    ],
  }],
  total: 5,
};

const RESEARCH_SEED = {
  version: 1,
  principal: {
    id: "researcher-1",
    display_name: "Researcher One",
  },
  bootstrap_mode: "faculty_profile",
  research_context: {
    title: "Researcher One",
    discipline: "Finance",
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
  await mockV2Api(page, {
    profileBody: PROFILE_BODY,
    jobsBody: RICH_JOBS,
    ...options,
  });
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

async function openSurface(page, tab) {
  if (tab !== "history") {
    await page.goto(`/?tab=${tab}`);
    return;
  }
  // History is a Discover mode, not a standalone route. Enter it through the
  // same control a researcher uses so the capture cannot accidentally certify
  // a blank deep-link state.
  await page.goto("/?tab=discover");
  await waitForShell(page);
  await page.getByRole("tab", { name: /^History/ }).click();
  await expect(page.getByTestId("discover-history")).toBeVisible();
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
        await openSurface(page, tab);
        await settle(page);
        await assertResearcherFacing(page);
        if (tab === "history") {
          // The selected record and inspector legitimately repeat the title.
          // Assert the lifecycle row rather than making page-wide text unique.
          await expect(
            page.getByRole("button", { name: /Taiwan issuer governance disclosures/i }).first(),
          ).toBeVisible();
        }
        await page.screenshot({
          path: `${OUT}/${name}-${viewportName}.png`,
          fullPage: false,
        });
      });
    }
  }

  test("populated Discover keeps evidence density without losing evaluation truth", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize(DESKTOP);
    await visualMocks(page, { discoverBody: POPULATED_DISCOVER });
    await page.goto("/?tab=discover&q=stablecoin");
    await settle(page, 1600);

    const candidates = page.locator(".rd-v2-discover-candidate");
    await expect(candidates).toHaveCount(5);
    await candidates.first().click();
    await page.waitForTimeout(250);
    await expect(page.getByText("Stablecoin de-peg event catalogue", { exact: true }).first()).toBeVisible();
    const fourth = await candidates.nth(3).boundingBox();
    expect(fourth?.y ?? DESKTOP.height + 1).toBeLessThan(DESKTOP.height);
    await assertResearcherFacing(page);
    await page.screenshot({ path: `${OUT}/discover-populated-desktop.png`, fullPage: false });
  });

  test("an unstructured need stays compact while Discover finds sources", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await visualMocks(page, {
      assessmentBody: {
        question: "I need dataset regarding forest fire and economic changes",
        assessment_status: "insufficient_requirement",
        because: "No explicit research requirement dimensions were supplied, so held coverage cannot be established.",
        requirement: { dimensions: [] },
        held_evidence: [],
      },
    });
    await page.goto("/?tab=discover&q=I%20need%20dataset%20regarding%20forest%20fire%20and%20economic%20changes");
    await settle(page);
    // The workspace assesses only when the researcher submits the need; a
    // query-string prefill must not itself write an assessment.
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await settle(page, 1200);

    const brief = page.getByTestId("discover-assessment-result");
    await expect(brief.getByText("Evidence brief needed", { exact: true })).toBeVisible();
    await expect(brief.getByText("State the dimensions that matter", { exact: true })).toBeVisible();
    await expect(brief.getByText("Execution capacity", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("discover-evidence-gap")).toHaveCount(0);
    const box = await brief.boundingBox();
    expect(box?.height || 10_000).toBeLessThan(230);
  });

  for (const [tab, name] of [["home", "home"], ["library", "library"]]) {
    test(`${name} keeps a real work canvas at small-desktop width`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize(COMPACT_DESKTOP);
      await visualMocks(page);
      await openSurface(page, tab);
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
      await openSurface(page, tab);
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
    await expect(page.getByRole("heading", { name: "Research evidence, kept inspectable." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What this workspace does" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use my email" })).toHaveCount(0);
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
    await openSurface(page, "history");

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