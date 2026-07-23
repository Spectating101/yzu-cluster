import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const DESTINATIONS = [
  ["Home", "home", ".rd-v2-home-page"],
  ["Library", "library", ".rd-v2-library-page"],
  ["Discover", "discover", ".rd-v2-discover-page"],
  ["Synthesis", "synthesis", ".rd-loop7-synthesis-page"],
  ["Resources", "resources", ".rd-rc3-resources-page"],
];

const SHOWCASE_THREADS = [
  {
    id: "construction-ownership-regimes",
    created_at: "2026-07-21T09:00:00+00:00",
    updated_at: "2026-07-23T09:40:00+00:00",
    title: "Ownership regimes and estimate revisions",
    objective: "Determine whether ownership regimes predict analyst estimate revisions and subsequent market response.",
    materialisation: "not_materialised",
    state: {
      title: "Ownership regimes and estimate revisions",
      question: "Do changes in controlling ownership regimes predict analyst estimate revisions and subsequent market response among Indonesian listed firms?",
      unit_of_analysis: "Firm × month",
      population: "Indonesian listed firms with analyst coverage",
      period: "2015–2025",
      required_grain: "firm × month",
      nodes: [
        {
          id: "target-ownership-estimates",
          type: "target",
          layer: "target",
          label: "Ownership-regime estimate-revision panel",
          interpretation: "A reusable firm-month panel joining ownership regimes, estimate revisions, and market response.",
          grain: "firm-month",
          coverage: "2015–2025",
        },
        {
          id: "idx-market-response",
          dataset_id: "ticker_week_country_broadcast_panel",
          type: "source",
          layer: "evidence",
          label: "IDX market response",
          role: "Outcome evidence",
          status: "query_ready",
          grain: "firm-day",
          coverage: "2015–2025",
        },
        {
          id: "refinitiv-estimate-revisions",
          type: "source",
          layer: "evidence",
          label: "Analyst estimate revisions",
          role: "Primary outcome signal",
          status: "queryable",
          grain: "firm-month",
          coverage: "2015–2025",
          provenance: "LSEG Workspace entitlement",
        },
        {
          id: "ownership-snapshots",
          type: "source",
          layer: "evidence",
          label: "Controlling-owner snapshots",
          role: "Treatment construction",
          status: "registered",
          grain: "firm-year",
          coverage: "2015–2025",
          provenance: "Refinitiv ownership",
        },
        {
          id: "ownership-change-history",
          type: "source",
          layer: "evidence",
          label: "Ownership-change history",
          role: "Required treatment timing",
          status: "sourceable",
          grain: "firm-month",
          coverage: "2015–2025",
          provenance: "Refinitiv bulk history or IDX disclosure archive",
        },
      ],
      edges: [],
      method: { accepted: false },
      proposal: null,
      execution_spec: null,
      execution: null,
    },
  },
  {
    id: "construction-news-shocks",
    created_at: "2026-07-19T08:00:00+00:00",
    updated_at: "2026-07-22T08:30:00+00:00",
    title: "Asia news-shock panel",
    objective: "Construct a reusable country-day news-risk panel for event and volatility studies.",
    materialisation: "query_ready",
    state: {
      title: "Asia news-shock panel",
      question: "How do country-level news shocks transmit into market volatility across Asia?",
      unit_of_analysis: "Country × day",
      population: "Selected Asian equity markets",
      period: "2018–2024",
      required_grain: "country × day",
      nodes: [
        {
          id: "gdelt-news-risk",
          dataset_id: "gdelt_asia_daily_country_panel",
          type: "source",
          layer: "evidence",
          label: "Asia daily news-risk panel",
          status: "query_ready",
          grain: "country-day",
          coverage: "2018–2024",
        },
      ],
      method: {
        accepted: true,
        accepted_definition: "Country-day standardized news-risk shocks with market-calendar alignment.",
      },
      execution_spec: {
        input_dataset_id: "gdelt_asia_daily_country_panel",
        output_dataset_id: "asia_news_shock_panel",
        group_by: ["country_iso3", "date"],
        method: "Country-day standardized news-risk shocks with market-calendar alignment.",
      },
      execution: {
        status: "query_ready",
        job_id: "job-news-shocks-17",
        output_dataset_id: "asia_news_shock_panel",
        rows: 18432,
        drive_verified: true,
        registry_verified: true,
        manifest_id: "mft_news_shocks_20260722",
      },
    },
  },
  {
    id: "construction-esg-rebrand",
    created_at: "2026-07-18T08:00:00+00:00",
    updated_at: "2026-07-21T14:00:00+00:00",
    title: "ESG rebrand event study",
    objective: "Measure flows and performance around mutual-fund ESG rebranding events.",
    materialisation: "not_materialised",
    state: {
      title: "ESG rebrand event study",
      question: "Do ESG rebrands change mutual-fund flows and risk-adjusted performance?",
      unit_of_analysis: "Fund × month",
      population: "US mutual funds",
      period: "2010–2025",
      required_grain: "fund × month",
      nodes: [],
      method: {
        accepted: true,
        accepted_definition: "Difference-in-differences around verified rebrand events with fund and month fixed effects.",
      },
      execution_spec: {
        input_dataset_id: "crsp_mutual_fund_monthly",
        output_dataset_id: "esg_rebrand_event_panel",
        group_by: ["fund_id", "month"],
        method: "Difference-in-differences around verified rebrand events with fund and month fixed effects.",
      },
      execution: null,
    },
  },
];

async function installShowcaseSynthesis(page) {
  const threads = new Map(SHOWCASE_THREADS.map((thread) => [thread.id, structuredClone(thread)]));
  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const threadIndex = parts.lastIndexOf("threads");
    const threadId = parts[threadIndex + 1] || "";
    const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (!threadId && method === "GET") {
      return respond({ threads: [...threads.values()], total: threads.size });
    }
    if (threadId && method === "GET") {
      const thread = threads.get(threadId);
      return thread ? respond(thread) : respond({ error: "not found" }, 404);
    }
    return respond({ error: "showcase route is read-only" }, 400);
  });
}

test("capture Sol ceiling desktop instrument", async ({ page }) => {
  await mockV2Api(page);
  await installShowcaseSynthesis(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await mkdir("artifacts/sol-ceiling", { recursive: true });

  for (const [label, file, selector] of DESTINATIONS) {
    if (label !== "Home") {
      await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
    }
    await expect(page.locator(selector)).toBeVisible();
    if (label === "Synthesis") {
      await expect(page.getByRole("heading", { name: "Ownership regimes and estimate revisions", exact: true })).toBeVisible();
      await expect(page.getByText("Ownership-change history", { exact: true })).toBeVisible();
    }
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/sol-ceiling/${file}-1440x900.png`,
      fullPage: false,
    });
  }
});