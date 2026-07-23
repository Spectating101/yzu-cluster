import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OWNERSHIP_CONSTRUCTION = {
  id: "construction-ownership-regimes",
  created_at: "2026-07-21T09:00:00+00:00",
  updated_at: "2026-07-23T10:45:00+00:00",
  title: "Ownership-regime proxy",
  objective: "Construct a defensible firm-month proxy for controlling-ownership regimes among Indonesian listed firms.",
  materialisation: "not_materialised",
  state: {
    title: "Ownership-regime proxy",
    question: "How can controlling-ownership regimes be measured at firm-month frequency when direct monthly ownership history is incomplete?",
    unit_of_analysis: "Firm × month",
    population: "Indonesian listed firms with analyst coverage",
    period: "2015–2025",
    required_grain: "firm × month",
    recommendation: {
      recommendation_id: "rec-control-event-proxy",
      title: "Control-event proxy",
      construct: {
        name: "Controlling-ownership regime, firm-month",
        description: "A point-in-time proxy for the controlling ownership regime, derived from observed ownership anchors and dated control-change signals.",
        construct_boundary: "Proxy measurement of controlling control—not direct monthly beneficial ownership.",
      },
      evidence_roles: [
        {
          dataset_id: "ownership-snapshots",
          role: "core",
          semantic_role: "treatment anchor",
          contribution: "Anchors the controlling owner and regime at observed annual reporting dates.",
          grain: "firm-year",
          coverage: "2015–2025",
          availability: "registered",
        },
        {
          dataset_id: "estimate-revisions",
          role: "validation",
          semantic_role: "discontinuity validation",
          contribution: "Tests whether inferred control changes coincide with abrupt analyst-information revisions.",
          grain: "firm-month",
          coverage: "2015–2025",
          availability: "query ready",
        },
        {
          dataset_id: "ticker_week_country_broadcast_panel",
          role: "validation",
          semantic_role: "market response validation",
          contribution: "Tests whether inferred control events coincide with abnormal market responses.",
          grain: "firm-day",
          coverage: "2015–2025",
          availability: "query ready",
        },
      ],
      unavailable_ideal_evidence: [
        {
          id: "ideal-monthly-ownership",
          label: "Direct monthly beneficial-ownership history",
          reason: "Incomplete across firms and periods; no verified continuous monthly source is controlled.",
        },
      ],
      method_outline: [
        "Anchor regimes at observed ownership snapshots",
        "Extract dated control-change signals",
        "Resolve conflicting signals conservatively",
        "Emit firm-month regime and confidence fields",
      ],
      expected_output: {
        dataset_id: "idn_ownership_regime_proxy_monthly",
        title: "Indonesia ownership-regime proxy",
        grain: "firm × month",
        coverage: "2015–2025",
        destination: "Library",
      },
      why_recommended: [
        "Uses direct ownership observations as anchors",
        "Improves temporal precision without pretending continuous direct measurement",
        "Keeps validation signals separate from the proxy definition",
      ],
      main_limitation: "Timing between observed snapshots depends on extracted control-event evidence and conservative interpolation.",
      validity_profile: {
        conceptual_fidelity: "high",
        coverage: "medium",
        temporal_precision: "medium",
        reproducibility: "high",
        leakage_risk: "low",
      },
      alternatives: [
        {
          id: "alt-snapshot-interpolation",
          title: "Snapshot interpolation proxy",
          summary: "Forward-fill observed ownership snapshots until the next reported change.",
          method_outline: ["Order annual snapshots", "Forward-fill owner regime", "Flag observed changes"],
          main_limitation: "High interpretability but weak timing precision between reports.",
          validity_profile: {
            conceptual_fidelity: "medium",
            coverage: "high",
            temporal_precision: "low",
            reproducibility: "high",
            leakage_risk: "low",
          },
        },
        {
          id: "alt-latent-regime",
          title: "Latent regime probability",
          summary: "Estimate control-regime change probabilities from disclosures, revisions, and market discontinuities.",
          method_outline: ["Engineer event signals", "Estimate regime probability", "Calibrate against snapshots"],
          main_limitation: "Broader timing coverage but weaker direct construct validity and higher model dependence.",
          validity_profile: {
            conceptual_fidelity: "low",
            coverage: "high",
            temporal_precision: "high",
            reproducibility: "medium",
            leakage_risk: "medium",
          },
        },
      ],
    },
    nodes: [
      {
        id: "target-ownership-estimates",
        type: "target",
        layer: "target",
        label: "Controlling-ownership regime, firm-month",
        interpretation: "A point-in-time proxy for the controlling-ownership regime.",
        grain: "firm-month",
        coverage: "2015–2025",
      },
      {
        id: "ticker_week_country_broadcast_panel",
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

test("render proxy-first Sol ceiling Synthesis flagship", async ({ page }) => {
  await mockV2Api(page);
  await installConstructionMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const design = page.getByRole("region", { name: "Proxy dataset design" });
  await expect(design.getByRole("heading", { name: "Controlling-ownership regime, firm-month", exact: true })).toBeVisible();
  await expect(design.getByRole("heading", { name: "Control-event proxy", exact: true })).toBeVisible();
  await expect(design.getByText("Treatment Anchor", { exact: true })).toBeVisible();
  await expect(design.getByText("Discontinuity Validation", { exact: true })).toBeVisible();
  await expect(design.getByText("Market Response Validation", { exact: true })).toBeVisible();
  await expect(design.getByText("Snapshot interpolation proxy", { exact: true })).toBeVisible();
  await expect(design.getByText("Latent regime probability", { exact: true })).toBeVisible();
  await expect(design.getByText("idn_ownership_regime_proxy_monthly", { exact: true })).toBeVisible();
  await expect(design.getByRole("button", { name: "Challenge proxy design", exact: true })).toBeVisible();
  await expect(design.getByRole("button", { name: "Find additional evidence", exact: true })).toBeVisible();

  const rail = page.locator("aside.rd-v2-rail");
  await expect(rail).toContainText("Proxy design authority");
  await expect(rail.getByText("Method", { exact: true })).toHaveCount(0);
  await expect(rail.getByText("Next decision", { exact: true })).toHaveCount(0);
  await expect(rail.getByText("Evidence gaps", { exact: true })).toHaveCount(0);

  await mkdir("artifacts/sol-ceiling-rebuild", { recursive: true });
  await page.screenshot({
    path: "artifacts/sol-ceiling-rebuild/synthesis-1440x900.png",
    fullPage: false,
  });

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector(".rd-loop7-synthesis-shell")?.getBoundingClientRect();
    const canvas = document.querySelector(".rd-loop7-main")?.getBoundingClientRect();
    const rail = document.querySelector("aside.rd-v2-rail")?.getBoundingClientRect();
    const next = document.querySelector(".rd-proxy-next")?.getBoundingClientRect();
    const overflow = [...document.querySelectorAll(".rd-proxy-canvas strong, .rd-proxy-canvas small, .rd-proxy-canvas dd, .rd-proxy-canvas p")]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    return {
      shellHeight: Math.round(shell?.height || 0),
      canvasWidth: Math.round(canvas?.width || 0),
      railWidth: Math.round(rail?.width || 0),
      nextBottom: Math.round(next?.bottom || 0),
      viewportHeight: window.innerHeight,
      overflow,
    };
  });

  expect(geometry.canvasWidth).toBeGreaterThan(geometry.railWidth * 2);
  expect(geometry.railWidth).toBeLessThanOrEqual(260);
  expect(geometry.shellHeight).toBeGreaterThanOrEqual(620);
  expect(geometry.nextBottom).toBeLessThanOrEqual(geometry.viewportHeight - 4);
  expect(geometry.overflow).toEqual([]);
});
