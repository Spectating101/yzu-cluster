/**
 * Discover Evaluation Surface screenshots (E3 + E4 integrity).
 * Run: CI=true YZU_PAGES=false TMPDIR=$PWD/.tmp-pw npx playwright test e2e/discover-evaluation-screenshots.spec.js
 */
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell, searchDiscover } from "./fixtures/v2MockApi.js";
import path from "node:path";
import fs from "node:fs";

const OUT = "docs/screenshots-review/discover-evaluation";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, label) {
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
}

async function waitProbeToastClear(page) {
  const toast = page.locator(".rd-v2-toast[data-toast-scope='discover-probe']");
  if (await toast.count()) {
    await expect(toast).toHaveCount(0, { timeout: 6000 });
  }
}

const MIXED = {
  sections: [
    {
      title: "Evaluation surface",
      rows: [
        {
          dataset_id: "gdelt_asia_daily_country_panel",
          title: "Asia daily news-risk panel",
          source: "GDELT",
          analysis_readiness: "instant",
          local_root: "research_panels/gdelt",
          coverage: "2018–2026 · Asia countries",
          description: "Country-day news-risk panel already in the lab vault",
          grain: "country-day",
        },
        {
          title: "Bare public CSV index",
          source: "Web",
          url: "https://example.com/index.csv",
          coverage: "Coverage not described",
          description: "Public index with no collection route yet",
        },
        {
          dataset_id: "mops_financial_statements_ext",
          candidate_key: "dataset:mops_financial_statements_ext",
          title: "MOPS financial statements (Taiwan)",
          source: "MOPS",
          collect_via: "mops_tw",
          url: "https://mops.twse.com.tw/example",
          coverage: "2015–2026",
          geographic_coverage: "Taiwan listed issuers",
          grain: "issuer-quarter",
          description: "Listed-company financial statements",
        },
        {
          title: "Refinitiv Asia equity fundamentals",
          source: "Refinitiv",
          manual_access: true,
          access_mode: "licensed",
          license: "Proprietary — commercial license",
          coverage: "2000–2026 · Asia equities",
          description: "Vendor fundamentals requiring entitlement",
        },
      ],
    },
  ],
  total: 4,
};

test.describe("Discover evaluation screenshots", () => {
  test("desktop + tablet + mobile evaluation states", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MIXED });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    // Type without Enter so Ask does not auto-start a Find-datasets thread yet.
    await searchDiscover(page, "evaluation");
    await expect(page.locator(".rd-v2-discover-candidate")).toHaveCount(4);

    // 1. external before probe
    await page.locator(".rd-v2-discover-candidate", { hasText: "Bare public CSV index" }).click();
    await expect(page.getByTestId("discover-eval-surface")).toContainText(/available to inspect/i);
    await expect(page.getByTestId("discover-eval-actions").getByRole("button", { name: "Test connection" })).toBeVisible();
    await shot(page, "01-desktop-external-before-probe");

    // 2. after successful probe — wait for toast clear so hierarchy is the subject
    await page.getByTestId("discover-eval-actions").getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByTestId("discover-eval-surface").locator(".rd-v2-eval-verified")).toBeVisible();
    await expect(page.getByTestId("discover-eval-actions").getByRole("button", { name: "Inspect source" })).toBeVisible();
    await waitProbeToastClear(page);
    await shot(page, "02-desktop-external-after-probe");

    // 3. acquisition-available (no stale probe toast)
    await page.locator(".rd-v2-discover-candidate", { hasText: "MOPS financial statements" }).click();
    await expect(page.getByTestId("discover-eval-surface")).toContainText(/acquisition available|can be collected/i);
    await expect(page.getByTestId("discover-eval-actions").getByRole("button", { name: "Request this data" })).toBeVisible();
    await expect(page.locator(".rd-v2-toast[data-toast-scope='discover-probe']")).toHaveCount(0);
    await shot(page, "03-desktop-acquisition-available");

    // 4. licensed/manual
    await page.locator(".rd-v2-discover-candidate", { hasText: "Refinitiv Asia equity" }).click();
    await expect(page.getByTestId("discover-eval-surface")).toContainText("Licensed · university access or manual upload");
    await expect(
      page.getByTestId("discover-eval-actions").getByRole("button", { name: "Review access requirements" }),
    ).toBeVisible();
    await shot(page, "04-desktop-licensed-manual");

    // 5. local query-ready — unknowns must be lab-relevant
    await page.getByTestId("discover-library-evidence").locator("summary").click();
    await page.getByTestId("discover-library-evidence").locator(".rd-v2-discover-candidate", { hasText: "Asia daily news-risk panel" }).click();
    await expect(page.getByTestId("discover-eval-surface")).toContainText(/ready to query/i);
    await expect(page.getByTestId("discover-eval-actions").getByRole("button", { name: "Open in Library" })).toBeVisible();
    await expect(page.getByTestId("discover-eval-surface")).not.toContainText("Source connection not tested");
    await expect(page.getByTestId("discover-eval-surface")).not.toContainText("Acquisition constraints not verified");
    await shot(page, "05-desktop-local-query-ready");

    // 6. tablet after probe
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.locator(".rd-v2-discover-candidate", { hasText: "Bare public CSV index" }).click();
    await expect(page.getByTestId("discover-eval-surface").locator(".rd-v2-eval-verified")).toBeVisible();
    await expect(page.getByTestId("discover-eval-actions").getByRole("button", { name: "Inspect source" })).toBeVisible();
    await shot(page, "06-tablet-external-after-probe");
  });
});
