import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-scale";
const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "workstation", width: 1920, height: 1080 },
];

function node(datasetId, label, index) {
  return {
    id: `node-${index}`,
    dataset_id: datasetId,
    type: "source",
    layer: "evidence",
    label,
    role: index === 0 ? "Held input" : "Supporting input",
    status: "held",
    grain: "entity-week",
    coverage: "2010–2026",
  };
}

function thread(id, nodes, extra = {}) {
  return {
    id,
    title: extra.title || "Production-scale synthesis",
    objective: extra.objective || "Construct a measured multi-source research panel from held evidence.",
    materialisation: "not_materialised",
    created_at: "2026-08-26T12:00:00Z",
    updated_at: "2026-08-26T12:00:00Z",
    state: {
      title: extra.title || "Production-scale synthesis",
      objective: extra.objective || "Construct a measured multi-source research panel from held evidence.",
      required_grain: "entity × week",
      maturity: "exploring",
      maturityLabel: "Evidence mapping",
      lastActivity: "Measured mapped Library evidence.",
      nodes,
      edges: [],
      proposal: null,
      ...extra.state,
    },
  };
}

function measurementFor(thread, overrides = {}) {
  return {
    thread_id: thread.id,
    writes: false,
    measurement_basis: "mapped_library_bytes",
    input_dataset_ids: thread.state.nodes.map((row) => row.dataset_id),
    measured_inputs: thread.state.nodes.length,
    unmeasured: [],
    column_profiles: [
      { dataset_id: thread.state.nodes[0]?.dataset_id, column: "entity_id", kind: "name", rows: 2_500_000, blanks: 0, distinct: 650_000, flags: [] },
      { dataset_id: thread.state.nodes[0]?.dataset_id, column: "fwd_20d_return", kind: "measurement", rows: 2_500_000, blanks: 10_000, distinct: 2_300_000, flags: ["lookahead"] },
    ],
    ...overrides,
  };
}

async function expectNoHorizontalOverflow(locator) {
  await expect(locator).toBeVisible();
  const fits = await locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(fits).toBeTruthy();
}

function threeWayOverlap() {
  return {
    applicable: true,
    key: "entity_id",
    key_parts: ["entity_id"],
    source_count: 3,
    row_cap_per_source: 500000,
    bounded: false,
    union_distinct: 6,
    all_shared_distinct: 1,
    sources: [
      { index: 0, dataset_id: "issuer_master_point_in_time", label: "Issuer master point-in-time identity spine", rows_read: 4, distinct: 4, truncated: false },
      { index: 1, dataset_id: "regulatory_filing_signals", label: "Regulatory filing disclosure signals", rows_read: 3, distinct: 3, truncated: false },
      { index: 2, dataset_id: "market_microstructure_weekly", label: "Market microstructure weekly observations", rows_read: 4, distinct: 4, truncated: false },
    ],
    intersections: [
      { mask: 1, source_indexes: [0], dataset_ids: ["issuer_master_point_in_time"], order: 1, count: 1, percent_of_union: 16.667 },
      { mask: 3, source_indexes: [0, 1], dataset_ids: ["issuer_master_point_in_time", "regulatory_filing_signals"], order: 2, count: 1, percent_of_union: 16.667 },
      { mask: 7, source_indexes: [0, 1, 2], dataset_ids: ["issuer_master_point_in_time", "regulatory_filing_signals", "market_microstructure_weekly"], order: 3, count: 1, percent_of_union: 16.667 },
      { mask: 5, source_indexes: [0, 2], dataset_ids: ["issuer_master_point_in_time", "market_microstructure_weekly"], order: 2, count: 1, percent_of_union: 16.667 },
      { mask: 6, source_indexes: [1, 2], dataset_ids: ["regulatory_filing_signals", "market_microstructure_weekly"], order: 2, count: 1, percent_of_union: 16.667 },
      { mask: 4, source_indexes: [2], dataset_ids: ["market_microstructure_weekly"], order: 1, count: 1, percent_of_union: 16.667 },
    ],
    pairwise: [],
    exact_for_read_window: true,
    note: "Exact key overlap for the resolved input bytes.",
  };
}

function eightWayOverlap() {
  const labels = [
    "Issuer point-in-time fundamentals and revision history",
    "Regulatory filing disclosure and governance signals",
    "Daily market microstructure and liquidity observations",
    "Analyst forecast dispersion and recommendation history",
    "Institutional ownership and quarterly holdings panel",
    "Corporate actions, delistings, and identifier continuity",
    "Macroeconomic surprise and monetary-policy event calendar",
    "News-risk entity exposure and event intensity panel",
  ];
  const raw = [
    [255, 1200], [127, 2200], [63, 5000], [31, 8000], [15, 12000], [7, 20000], [3, 30000],
    [1, 100000], [2, 80000], [4, 70000], [8, 60000], [16, 50000], [32, 40000], [64, 30000], [128, 20000], [85, 15000],
  ];
  const union = raw.reduce((sum, [, count]) => sum + count, 0);
  const distinctBySource = Array.from({ length: 8 }, (_, sourceIndex) =>
    raw.reduce((sum, [mask, count]) => sum + (mask & (1 << sourceIndex) ? count : 0), 0),
  );
  const datasets = labels.map((label, index) => ({
    index,
    dataset_id: `production_source_${index + 1}_with_a_long_registered_identifier`,
    label,
    rows_read: 500000,
    distinct: distinctBySource[index],
    truncated: true,
  }));
  return {
    applicable: true,
    key: "entity_id",
    key_parts: ["entity_id"],
    source_count: 8,
    row_cap_per_source: 500000,
    bounded: true,
    union_distinct: union,
    all_shared_distinct: 1200,
    sources: datasets,
    intersections: raw.map(([mask, count]) => ({
      mask,
      source_indexes: Array.from({ length: 8 }, (_, index) => index).filter((index) => mask & (1 << index)),
      dataset_ids: Array.from({ length: 8 }, (_, index) => index).filter((index) => mask & (1 << index)).map((index) => datasets[index].dataset_id),
      order: Array.from({ length: 8 }, (_, index) => index).filter((index) => mask & (1 << index)).length,
      count,
      percent_of_union: (100 * count) / union,
    })),
    pairwise: [],
    exact_for_read_window: true,
    note: "Bounded key-overlap sample; sources reached the read cap.",
  };
}

const THREE_NODES = [
  node("issuer_master_point_in_time", "Issuer master point-in-time identity spine", 0),
  node("regulatory_filing_signals", "Regulatory filing disclosure signals", 1),
  node("market_microstructure_weekly", "Market microstructure weekly observations", 2),
];
const PANEL_NODES = [
  node("issuer_week_panel", "Issuer-week research panel", 0),
  node("market_week_panel", "Weekly market evidence", 1),
];
const EIGHT_OVERLAP = eightWayOverlap();
const EIGHT_NODES = EIGHT_OVERLAP.sources.map((source, index) => node(source.dataset_id, source.label, index));
const EIGHT_PAIR_SHARED = EIGHT_OVERLAP.intersections.reduce(
  (sum, row) => sum + (row.mask & 1 && row.mask & 2 ? row.count : 0),
  0,
);

const CASES = [
  {
    id: "three-source-exact",
    thread: thread("scale-three", THREE_NODES, { title: "Three-source issuer research population" }),
    measurement: (t) => measurementFor(t, {
      join_candidates: [{ left_key: "entity_id", right_key: "entity_id", matched: 2, left_distinct: 4, right_distinct: 3, right_duplicate_rows: 0, match_rate_pct: 50, usable: true, reason: null }],
      join_candidate_dataset_id: THREE_NODES[1].dataset_id,
      join_candidate_rows: 3,
      multi_overlap: threeWayOverlap(),
    }),
    assert: async (page) => {
      await expect(page.getByTestId("synthesis-multi-overlap-visual")).toBeVisible();
      await expect(page.locator(".s04-multi-venn-body")).toBeVisible();
      await expect(page.getByTestId("synthesis-upset-visual")).toHaveCount(0);
    },
  },
  {
    id: "pairwise-panel-grain",
    thread: thread("scale-panel-grain", PANEL_NODES, { title: "Entity-week panel join" }),
    measurement: (t) => measurementFor(t, {
      join_candidates: [
        {
          left_key: "entity_id",
          right_key: "entity_id",
          key_parts: ["entity_id"],
          complete_identity_domain: false,
          left_dataset_id: PANEL_NODES[0].dataset_id,
          right_dataset_id: PANEL_NODES[1].dataset_id,
          left_label: PANEL_NODES[0].label,
          right_label: PANEL_NODES[1].label,
          matched: 2,
          left_distinct: 2,
          right_distinct: 2,
          right_duplicate_rows: 2,
          match_rate_pct: 100,
          usable: true,
          reason: null,
        },
        {
          left_key: "entity_id + week",
          right_key: "entity_id + week",
          key_parts: ["entity_id", "week"],
          complete_identity_domain: true,
          left_dataset_id: PANEL_NODES[0].dataset_id,
          right_dataset_id: PANEL_NODES[1].dataset_id,
          left_label: PANEL_NODES[0].label,
          right_label: PANEL_NODES[1].label,
          matched: 2,
          left_distinct: 4,
          right_distinct: 4,
          right_duplicate_rows: 0,
          match_rate_pct: 50,
          usable: true,
          reason: null,
        },
      ],
      join_candidate_dataset_id: PANEL_NODES[1].dataset_id,
      join_candidate_rows: 4,
      multi_overlap: null,
    }),
    assert: async (page) => {
      const decision = page.getByTestId("synthesis-join-decision");
      await expect(decision.locator("header.s04-title h2")).toHaveText(PANEL_NODES[1].label);
      await expect(decision.locator("header.s04-title em")).toContainText("50%");
      const firstKey = decision.locator(".s04-options").first().locator("li").first();
      await expect(firstKey).toContainText("entity_id + week");
      await expect(firstKey).toContainText("2 of 4");
      await expect(page.getByTestId("synthesis-join-overlap-visual")).toBeVisible();
    },
  },
  {
    id: "eight-source-bounded",
    thread: thread("scale-eight", EIGHT_NODES, { title: "Eight-source empirical research estate" }),
    measurement: (t) => measurementFor(t, {
      join_candidates: [{
        left_key: "entity_id",
        right_key: "entity_id",
        left_dataset_id: EIGHT_NODES[0].dataset_id,
        right_dataset_id: EIGHT_NODES[1].dataset_id,
        left_label: EIGHT_NODES[0].label,
        right_label: EIGHT_NODES[1].label,
        matched: EIGHT_PAIR_SHARED,
        left_distinct: EIGHT_OVERLAP.sources[0].distinct,
        right_distinct: EIGHT_OVERLAP.sources[1].distinct,
        right_duplicate_rows: 341600,
        match_rate_pct: Number((100 * EIGHT_PAIR_SHARED / EIGHT_OVERLAP.sources[0].distinct).toFixed(3)),
        usable: true,
        reason: null,
      }],
      join_candidate_dataset_id: EIGHT_NODES[1].dataset_id,
      join_candidate_rows: 500000,
      multi_overlap: EIGHT_OVERLAP,
      truncated_inputs: 0,
      max_inputs: 8,
    }),
    assert: async (page) => {
      const decision = page.getByTestId("synthesis-join-decision");
      const upset = page.getByTestId("synthesis-upset-visual");
      await expect(upset).toBeVisible();
      await expect(page.locator(".s04-upset-legend > span")).toHaveCount(8);
      await expect(decision.locator("header.s04-title h2")).toHaveText(EIGHT_OVERLAP.sources[1].label);
      await expect(page.getByTestId("synthesis-multi-overlap-visual")).toContainText("Bounded overlap sample");
      await expect(page.getByTestId("synthesis-multi-overlap-visual")).toContainText("smaller exclusive intersections");
      await expectNoHorizontalOverflow(upset);
      const rowsFit = await page.locator(".s04-upset-row").evaluateAll(
        (rows) => rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
      );
      expect(rowsFit).toBeTruthy();
    },
  },
  {
    id: "scope-many-cuts",
    thread: thread("scale-scope", [node("large_panel", "Large historical panel", 0)], {
      title: "Large historical panel scope",
      state: {
        scope_block: {
          rows: 5_840_000,
          limit: 1_000_000,
          options: Array.from({ length: 12 }, (_, index) => ({
            id: `cut-${index + 1}`,
            label: `from ${2015 + index}-01-01`,
            rows: Math.max(420_000, 5_300_000 - index * 445_000),
          })),
        },
      },
    }),
    measurement: (t) => measurementFor(t),
    assert: async (page) => {
      await expect(page.getByTestId("synthesis-scope-retention-visual")).toBeVisible();
      await expect(page.getByTestId("synthesis-scope-block")).toContainText("5,840,000");
    },
  },
  {
    id: "unit-long-labels",
    thread: thread("scale-units", [node("returns", "Long-form return decomposition panel", 0), node("rates", "Risk-free rate history", 1)], {
      title: "Cross-provider unit reconciliation",
      state: {
        unit_conflict: {
          left: { column: "issuer_adjusted_forward_excess_return_fractional_daily_measurement", typical: 0.00062 },
          right: { column: "published_risk_free_reference_rate_percentage_points_daily", typical: 0.0124 },
          outcomes: [
            { id: "rescale", label: "Rescale published reference rate ÷100 before subtraction", result: -0.000204, recommended: true },
            { id: "asis", label: "Leave both recorded magnitudes unchanged", result: -0.02018 },
          ],
        },
      },
    }),
    measurement: (t) => measurementFor(t, {
      measured_inputs: 2,
      input_dataset_ids: t.state.nodes.map((row) => row.dataset_id),
      unit_conflict: t.state.unit_conflict,
    }),
    assert: async (page) => {
      await expect(page.getByTestId("synthesis-unit-scale-visual")).toBeVisible();
      await expect(page.getByTestId("synthesis-unit-conflict")).toContainText("20");
    },
  },
];

async function mount(page, item) {
  await mockV2Api(page);
  const measurement = item.measurement(item.thread);
  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/measurements")) {
      expect(url.searchParams.get("max_inputs")).toBe("8");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(measurement) });
    }
    const body = url.pathname.endsWith(`/${item.thread.id}`)
      ? item.thread
      : { threads: [item.thread], total: 1 };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/?tab=synthesis");
  await page.getByTestId("synthesis-thread-item").first().click({ force: true });
  await expect(page.getByTestId("synthesis-home-state")).toHaveCount(0);
}

test.describe("Synthesis production-scale analytical render", () => {
  for (const item of CASES) {
    for (const viewport of VIEWPORTS) {
      test(`${item.id} at ${viewport.id}`, async ({ page }) => {
        mkdirSync(outDir, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mount(page, item);
        await item.assert(page);
        await page.screenshot({ path: `${outDir}/${item.id}-${viewport.id}.png`, fullPage: true });
      });
    }
  }
});
