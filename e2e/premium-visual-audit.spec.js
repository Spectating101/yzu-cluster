import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockV2Api, waitForShell, MOCK_DISCOVER_HIT } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/premium-visual-audit";
fs.mkdirSync(OUT, { recursive: true });

const PROFILE = {
  name_en: "Kong, De-Rong",
  title: "Professor",
  discipline: "Finance",
  email: "drkong@saturn.yzu.edu.tw",
  paper_count_parsed: 34,
  specialties: ["Asset Pricing", "FinTech", "Corporate governance"],
  research_tracks: [
    { id: "stablecoin", title: "Stablecoin trust and market engagement", phase: "active_grant", weight: 1 },
    { id: "taiwan", title: "Taiwan equity disclosure and misconduct", weight: 0.8 },
    { id: "revision", title: "PIT analyst revisions and momentum", weight: 0.6 },
  ],
  method_tags: ["panel_data", "on_chain", "machine_learning"],
  publication_highlights: [
    "Kong, D.-R. (2025). Investor attention and digital asset market quality. Pacific-Basin Finance Journal.",
    "Kong, D.-R. (2024). Governance signals and market misconduct. Journal of Financial Markets.",
  ],
  lab_fintech_stack: [
    { id: "stablecoin_trust", label: "Stablecoin trust & engagement panel", route: "vault", registry_dataset_ids: ["stablecoin_trust_engagement"] },
    { id: "usdt_bq", label: "USDT BigQuery catalogue", route: "bigquery", registry_dataset_ids: ["usdt_bigquery_catalogue"] },
    { id: "skynet", label: "Skynet security governance panel", route: "vault", registry_dataset_ids: ["skynet_security_governance"] },
  ],
  procurement_recommendations: [
    { dataset: "TWSE daily investor flows", dataset_id: "twse_investor_flows", source_route: "vault", search_query: "TWSE daily investor flows" },
    { dataset: "MOPS Taiwan governance misconduct", source_route: "discover", search_query: "MOPS governance misconduct Taiwan" },
    { dataset: "SEC enforcement actions", source_route: "discover", search_query: "SEC enforcement actions dataset" },
  ],
};

const MIXED_DISCOVER = {
  sections: [{
    title: "Mixed",
    rows: [
      {
        dataset_id: "gdelt_asia_daily_country_panel",
        title: "Asia daily news-risk panel",
        source: "GDELT",
        analysis_readiness: "instant",
        local_root: "research_panels/gdelt",
        coverage: "2018–2024 · Asia",
        grain: "country_day",
        description: "Lab panel ready for query",
      },
      ...(MOCK_DISCOVER_HIT.sections?.[0]?.rows || []),
      {
        title: "Licensed market feed",
        source: "Vendor",
        url: "https://vendor.example/feed",
        manual_access: true,
        access_mode: "licensed",
        license: "commercial license",
        description: "Entitlement-gated market data",
      },
    ],
  }],
  total: 3,
};

async function setup(page, discoverBody = MIXED_DISCOVER) {
  await mockV2Api(page, { discoverBody, jobsBody: { jobs: [] } });
  await page.route("**/library/faculty/profile*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ found: true, profile: PROFILE }),
  }));
  await page.addInitScript(() => localStorage.setItem("procure_user_email", "drkong@saturn.yzu.edu.tw"));
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

async function open(page, tab, size) {
  await page.setViewportSize(size);
  await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("desktop premium surfaces", async ({ page }) => {
  await setup(page);
  const desktop = { width: 1440, height: 900 };

  await open(page, "home", desktop);
  await shot(page, "01-desktop-home");

  await open(page, "library", desktop);
  await shot(page, "02-desktop-library");

  await open(page, "browse", desktop);
  await page.locator(".rd-v2-search-pill input").fill("mops");
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
  await shot(page, "03-desktop-discover-browse");
  await page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate", { hasText: "MOPS" }).click();
  await expect(page.getByTestId("discover-focus-workspace")).toBeVisible();
  await shot(page, "04-desktop-discover-focus");

  await open(page, "resources", desktop);
  await shot(page, "05-desktop-resources");

  await open(page, "profile", desktop);
  await shot(page, "06-desktop-profile");

  await open(page, "settings", desktop);
  await shot(page, "07-desktop-settings");
});

test("mobile premium shell and inspector", async ({ page }) => {
  await setup(page);
  const mobile = { width: 390, height: 1200 };

  await open(page, "home", mobile);
  await shot(page, "08-mobile-home");

  await open(page, "library", mobile);
  const firstRow = page.locator(".rd-v2-catalog .row").first();
  if (await firstRow.count()) await firstRow.click();
  await shot(page, "09-mobile-library-selected");

  await open(page, "browse", mobile);
  await page.locator(".rd-v2-search-pill input").fill("mops");
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
  await shot(page, "10-mobile-discover-browse");
  await page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate", { hasText: "MOPS" }).click();
  await expect(page.getByTestId("discover-focus-workspace")).toBeVisible();
  await shot(page, "11-mobile-discover-focus");

  await open(page, "resources", mobile);
  await shot(page, "12-mobile-resources");

  await open(page, "profile", mobile);
  await shot(page, "13-mobile-profile");
});
