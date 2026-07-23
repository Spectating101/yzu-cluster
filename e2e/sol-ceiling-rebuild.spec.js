import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OWNERSHIP_CONSTRUCTION = {
  id: "construction-ownership-regimes",
  created_at: "2026-07-21T09:00:00+00:00",
  updated_at: "2026-07-23T10:45:00+00:00",
  title: "Ownership regimes and estimate revisions",
  objective: "Determine whether controlling-ownership changes predict analyst estimate revisions and subsequent market response.",
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
        id: "estimate-revisions",
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
};

const READY_CONSTRUCTION = {
  id: "construction-news-shocks",
  created_at: "2026-07-19T08:00:00+00:00",
  updated_at: "2026-07-22T08:30:00+00:00",
  title: "Asia news-shock panel",
  objective: "Construct a reusable country-day news-risk panel.",
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
      accepted_definition: "Country-day standardized news-risk shocks aligned to market calendars.",
    },
    execution_spec: {
      input_dataset_id: "gdelt_asia_daily_country_panel",
      output_dataset_id: "asia_news_shock_panel",
      group_by: ["country_iso3", "date"],
      method: "Country-day standardized news-risk shocks aligned to market calendars.",
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
};

async function installConstructionMock(page) {
  const threads = new Map(
    [OWNERSHIP_CONSTRUCTION, READY_CONSTRUCTION].map((thread) => [thread.id, structuredClone(thread)]),
  );

  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const threadId = parts[index + 1] || "";
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (route.request().method() !== "GET") return respond({ error: "read-only render" }, 400);
    if (!threadId) return respond({ threads: [...threads.values()], total: threads.size });
    return threads.has(threadId) ? respond(threads.get(threadId)) : respond({ error: "not found" }, 404);
  });
}

test("render populated Sol ceiling Synthesis flagship", async ({ page }) => {
  await mockV2Api(page);
  await installConstructionMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const construction = page.getByRole("region", { name: "Research construction" });
  await expect(construction.getByRole("heading", { name: "Ownership regimes and estimate revisions", exact: true })).toBeVisible();
  await expect(construction.getByText("Ownership-change history", { exact: true })).toBeVisible();
  await expect(construction.getByRole("heading", { name: "Resolve Ownership-change history", exact: true })).toBeVisible();
  await expect(construction.getByText("Research decision required", { exact: true })).toBeVisible();
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Construction authority");

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector(".rd-loop7-synthesis-shell")?.getBoundingClientRect();
    const canvas = document.querySelector(".rd-loop7-main")?.getBoundingClientRect();
    const rail = document.querySelector("aside.rd-v2-rail")?.getBoundingClientRect();
    const evidence = document.querySelector(".rd-loop7-evidence")?.getBoundingClientRect();
    return {
      shellHeight: Math.round(shell?.height || 0),
      canvasWidth: Math.round(canvas?.width || 0),
      railWidth: Math.round(rail?.width || 0),
      evidenceTop: Math.round(evidence?.top || 0),
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.canvasWidth).toBeGreaterThan(geometry.railWidth * 2);
  expect(geometry.railWidth).toBeLessThanOrEqual(290);
  expect(geometry.evidenceTop).toBeLessThan(geometry.viewportHeight - 90);
  expect(geometry.shellHeight).toBeGreaterThanOrEqual(620);

  await mkdir("artifacts/sol-ceiling-rebuild", { recursive: true });
  await page.screenshot({
    path: "artifacts/sol-ceiling-rebuild/synthesis-1440x900.png",
    fullPage: false,
  });
});