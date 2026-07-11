/**
 * Discover local sufficiency screenshots.
 * Run: CI=true YZU_PAGES=false TMPDIR=$PWD/.tmp-pw npx playwright test e2e/discover-sufficiency-screenshots.spec.js
 */
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import path from "node:path";
import fs from "node:fs";

const OUT = "docs/screenshots-review/discover-sufficiency";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, label) {
  await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 6000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
}

const LAB_READY = {
  dataset_id: "gdelt_asia_daily_country_panel",
  title: "Asia daily news-risk panel",
  source: "GDELT",
  analysis_readiness: "instant",
  local_root: "research_panels/gdelt",
  coverage: "2018–2024",
  grain: "country_day",
  description: "Lab panel ready for query",
};

function section(rows) {
  return { sections: [{ title: "Mixed", rows }], total: rows.length };
}

async function openDiscover(page, discoverBody, jobsBody = { jobs: [] }) {
  await mockV2Api(page, { discoverBody, jobsBody });
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.locator(".rd-v2-search-pill input").fill("coverage");
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
}

test.describe("Discover sufficiency screenshots", () => {
  test("browse and focus sufficiency states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 01 Browse · exact local match
    await openDiscover(
      page,
      section([
        LAB_READY,
        {
          title: "GDELT Asia country panel (catalog mirror)",
          source: "GDELT",
          url: "https://example.com/gdelt-asia",
          candidate_key: "url:https://example.com/gdelt-asia",
          equivalent_dataset_id: "gdelt_asia_daily_country_panel",
          coverage: "2018–2024",
          grain: "country_day",
          collect_via: "http_fetch",
          description: "Explicit equivalent of the lab panel",
        },
      ]),
    );
    await expect(
      page.locator('.rd-v2-discover-candidate[data-sufficiency="exact-local"]'),
    ).toContainText(/Exact local match/i);
    await shot(page, "01-desktop-browse-exact-local");

    // 02 Browse · partial local coverage
    await openDiscover(
      page,
      section([
        LAB_READY,
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
          description: "Longer GDELT Asia window",
        },
      ]),
    );
    await expect(page.locator('[data-sufficiency="partial-local"]')).toContainText(/Partial local coverage/i);
    await shot(page, "02-desktop-browse-partial-local");

    // 03 Browse · related local asset
    await openDiscover(
      page,
      section([
        LAB_READY,
        {
          title: "GDELT event excerpts",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-events",
          candidate_key: "url:https://example.com/gdelt-events",
          grain: "country_day",
          coverage: "2018–2024",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
          description: "Same family, equivalence not established",
        },
      ]),
    );
    await expect(page.locator('[data-sufficiency="related-local"]')).toContainText(/Related lab asset/i);
    await shot(page, "03-desktop-browse-related-local");

    // 04 Browse · no local alternative
    await openDiscover(
      page,
      section([
        LAB_READY,
        {
          title: "SEC EDGAR 10-K bulk",
          source: "SEC EDGAR",
          source_system: "SEC EDGAR",
          url: "https://www.sec.gov/edgar",
          candidate_key: "url:https://www.sec.gov/edgar",
          grain: "filing",
          collect_via: "http_fetch",
          description: "US filings corpus",
        },
      ]),
    );
    await expect(page.locator('[data-sufficiency="no-local-alternative"]')).toContainText(
      /No local alternative found/i,
    );
    await shot(page, "04-desktop-browse-no-local-alternative");

    // 05 Focus · exact local match
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia country panel (catalog mirror)",
          source: "GDELT",
          url: "https://example.com/gdelt-asia",
          candidate_key: "url:https://example.com/gdelt-asia",
          equivalent_dataset_id: "gdelt_asia_daily_country_panel",
          coverage: "2018–2024",
          grain: "country_day",
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "GDELT Asia" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Exact local match/i);
    await expect(page.locator('[data-testid="discover-eval-actions"] .rd-v2-btn.primary')).toContainText(
      /Open local dataset/i,
    );
    await shot(page, "05-desktop-focus-exact-local");

    // 07 Focus · partial temporal (06 likely-equivalent omitted — unsupported without backend contract)
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Partial local coverage/i);
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/2018|2024|2015|2026/);
    await shot(page, "07-desktop-focus-partial-temporal");

    // 08 Focus · partial grain
    await openDiscover(
      page,
      section([
        {
          title: "MOPS daily filings feed",
          source: "MOPS",
          source_system: "MOPS",
          url: "https://mops.example/daily",
          candidate_key: "url:https://mops.example/daily",
          grain: "issuer_day",
          join_keys: ["issuer_id", "week"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS daily" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Partial local coverage/i);
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/grain|week|day/i);
    await shot(page, "08-desktop-focus-partial-grain");

    // 09 Focus · related
    await openDiscover(
      page,
      section([
        {
          title: "GDELT event excerpts",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-events",
          candidate_key: "url:https://example.com/gdelt-events",
          grain: "country_day",
          coverage: "2018–2024",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "event excerpts" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Related lab asset/i);
    await shot(page, "09-desktop-focus-related-local");

    // 10 Focus · no local alternative
    await openDiscover(
      page,
      section([
        {
          title: "SEC EDGAR 10-K bulk",
          source: "SEC EDGAR",
          source_system: "SEC EDGAR",
          url: "https://www.sec.gov/edgar",
          candidate_key: "url:https://www.sec.gov/edgar",
          grain: "filing",
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "SEC EDGAR" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/No local alternative found/i);
    await shot(page, "10-desktop-focus-no-local-alternative");

    // 11 Focus · comparison unknown
    await openDiscover(
      page,
      section([
        {
          title: "Untitled research dump",
          url: "https://example.com/dump",
          candidate_key: "url:https://example.com/dump",
          description: "Thin web hit with no comparable identity",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "Untitled" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Comparison unavailable|Local comparison unavailable/i);
    await shot(page, "11-desktop-focus-comparison-unknown");

    // 12 Focus · partial + Ask
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
    await shot(page, "12-desktop-focus-partial-with-ask");

    // 13 Focus · lifecycle Running overrides sufficiency action
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
      {
        jobs: [
          {
            id: "job-running",
            status: "running",
            candidate_key: "url:https://example.com/gdelt-ext",
            result: { stage: "Downloading files" },
            plan: { title: "GDELT Asia extended panel" },
            request: { candidate_key: "url:https://example.com/gdelt-ext" },
          },
        ],
      },
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
    await expect(page.getByTestId("discover-lifecycle")).toContainText(/Running/i);
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Partial local coverage/i);
    await expect(page.locator('[data-testid="discover-eval-actions"] .rd-v2-btn.primary')).not.toContainText(
      /Open local dataset/i,
    );
    await shot(page, "13-desktop-focus-lifecycle-running-override");

    // 14 Back to Browse · state preserved
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator('[data-sufficiency="partial-local"]')).toBeVisible();
    await shot(page, "14-desktop-back-sufficiency-preserved");

    // 15 Tablet partial
    await page.setViewportSize({ width: 900, height: 1200 });
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
    await shot(page, "15-tablet-focus-partial-local");

    // 16 Mobile browse
    await page.setViewportSize({ width: 390, height: 1200 });
    await openDiscover(
      page,
      section([
        LAB_READY,
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
        {
          title: "SEC EDGAR 10-K bulk",
          source: "SEC EDGAR",
          source_system: "SEC EDGAR",
          url: "https://www.sec.gov/edgar",
          candidate_key: "url:https://www.sec.gov/edgar",
          collect_via: "http_fetch",
        },
      ]),
    );
    await expect(page.locator('[data-testid="discover-sufficiency-line"]').first()).toBeVisible();
    await shot(page, "16-mobile-browse-sufficiency");

    // 17 Mobile focus exact
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia country panel (catalog mirror)",
          source: "GDELT",
          url: "https://example.com/gdelt-asia",
          candidate_key: "url:https://example.com/gdelt-asia",
          equivalent_dataset_id: "gdelt_asia_daily_country_panel",
          coverage: "2018–2024",
          grain: "country_day",
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "GDELT Asia" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Exact local match/i);
    await shot(page, "17-mobile-focus-exact-local");

    // 18 Mobile focus partial
    await openDiscover(
      page,
      section([
        {
          title: "GDELT Asia extended panel",
          source_system: "GDELT news graph",
          source: "GDELT",
          url: "https://example.com/gdelt-ext",
          candidate_key: "url:https://example.com/gdelt-ext",
          coverage: "2015–2026",
          grain: "country_day",
          join_keys: ["date", "country_iso3"],
          collect_via: "http_fetch",
        },
      ]),
    );
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
    await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Partial local coverage/i);
    await shot(page, "18-mobile-focus-partial-local");
  });
});
