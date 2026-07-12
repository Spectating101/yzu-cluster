import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/current-product-review-20260712";
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

async function setup(page) {
  await mockV2Api(page, { jobsBody: { jobs: [] } });
  await page.route("**/library/faculty/profile*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ found: true, profile: PROFILE }),
    }),
  );
  await page.addInitScript(() => localStorage.setItem("procure_user_email", "drkong@saturn.yzu.edu.tw"));
}

async function capture(page, tab, name, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

test("unique current product surfaces", async ({ page }) => {
  await setup(page);

  await capture(page, "home", "01-desktop-home", 1440, 900);
  await capture(page, "resources", "02-desktop-resources", 1440, 900);
  await capture(page, "profile", "03-desktop-profile", 1440, 900);
  await capture(page, "settings", "04-desktop-settings", 1440, 900);

  await capture(page, "home", "05-mobile-home", 390, 1200);
  await capture(page, "resources", "06-mobile-resources", 390, 1200);
  await capture(page, "profile", "07-mobile-profile", 390, 1200);
  await capture(page, "settings", "08-mobile-settings", 390, 1200);
});
