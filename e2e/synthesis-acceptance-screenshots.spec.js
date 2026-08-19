import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { EXAMPLE_STATE } from "../drive/src/v2/synthesisContract.js";

// Field payloads come from the contract module, so a screenshot can never show
// a shape the desk is not being asked to produce.
const E = EXAMPLE_STATE;
const outDir = "artifacts/synthesis-acceptance";

const WIDTHS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "wide", width: 1960, height: 1600 },
  { id: "mobile", width: 390, height: 844 },
];

const NODES = [
  { id: "idn", type: "source", layer: "evidence", label: "IDN daily cross-section",
    role: "Held input", status: "held", grain: "asset-day", coverage: "2020–2026" },
  { id: "ff", type: "source", layer: "evidence", label: "Fama-French factors",
    role: "Validation", status: "queryable", grain: "day", coverage: "1963–2026" },
];

const SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_weekly_factor_exposure",
  grain: "asset × week",
};

const STATES = {
  "01-exploring": { nodes: NODES },
  "02-columns": { nodes: NODES, column_profiles: E.column_profiles, columns_in_use: E.columns_in_use },
  "03-scope-blocked": { nodes: NODES, scope_block: E.scope_block },
  "04-unit-conflict": { nodes: NODES, unit_conflict: E.unit_conflict },
  "05-join": { nodes: NODES, join_candidates: E.join_candidates,
    join_candidate_dataset_id: "refinitiv_entity_market_spine_expanded", join_candidate_rows: 570 },
  "06-proposal": { nodes: NODES, proposal: {
    id: "prop-1", title: "Weekly factor exposure", proposal_hash: "sha256:9c1f22ab74",
    summary: "Aggregate the daily cross-section to asset × week and join Fama-French backward.",
    operations: [
      { id: "op1", kind: "group_by", detail: "asset × week" },
      { id: "op2", kind: "as_of_join", detail: "backward, tolerance 5D" },
    ],
    execution_spec: SPEC } },
  "07-building": { nodes: NODES, execution_spec: SPEC, execution: { status: "running" } },
  "08-registered": { nodes: NODES, execution_spec: SPEC,
    execution: { status: "registered", output_dataset_id: "idn_weekly_factor_exposure",
                 manifest_id: "man-8842", rows: 969392 },
    provenance: E.provenance, settled_decisions: E.settled_decisions, excursions: E.excursions,
    column_profiles: E.column_profiles, columns_in_use: E.columns_in_use },
  "09-failed": { nodes: NODES, execution_spec: SPEC,
    execution: { status: "failed", error: "as-of join produced 206,432,820 rows, over the 1,000,000 limit" } },
  "10-reuse": { nodes: NODES, execution_spec: SPEC,
    execution: { status: "registered", output_dataset_id: "idn_weekly_factor_exposure" },
    reuse_from: E.reuse_from, reuse_changes: E.reuse_changes },
  // The case the focus policy exists for: a finished thread still carrying the
  // pre-build refusals it has outlived. It must not read CANNOT BUILD.
  "11-stale-fields": { nodes: NODES, execution_spec: SPEC,
    execution: { status: "registered", output_dataset_id: "idn_weekly_factor_exposure" },
    scope_block: E.scope_block, unit_conflict: E.unit_conflict, provenance: E.provenance },
};

const threadFor = (extra) => ({
  id: "thread-acceptance",
  created_at: "2026-08-19T09:00:00+00:00",
  updated_at: "2026-08-19T09:00:00+00:00",
  title: "IDN weekly factor exposure",
  objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
  materialisation: extra.execution?.status === "registered" ? "registered" : "not_materialised",
  state: {
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    required_grain: "asset × week",
    maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.",
    nodes: [], edges: [], proposal: null, spec: SPEC,
    ...extra,
  },
});

async function mount(page, thread) {
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("thread-acceptance")
        ? thread : { threads: [thread], total: 1 }),
    }));
  await page.goto("/?tab=synthesis");
  await page.getByTestId("synthesis-thread-item").first().click();
}

test.describe("Synthesis acceptance screenshots", () => {
  for (const [name, extra] of Object.entries(STATES)) {
    for (const viewport of WIDTHS) {
      test(`${name} at ${viewport.id} ${viewport.width}px`, async ({ page }) => {
        mkdirSync(outDir, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mount(page, threadFor(extra));
        await expect(page.getByTestId("synthesis-thread-item").first()).toBeVisible();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${outDir}/${name}-${viewport.id}.png`, fullPage: true });

        // A screenshot nobody has looked at still has to answer one question.
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${name} overflows horizontally at ${viewport.width}px`).toBeLessThanOrEqual(1);
      });
    }
  }

  test("a finished thread carrying stale pre-build fields never reads CANNOT BUILD", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, threadFor(STATES["11-stale-fields"]));
    await expect(page.getByTestId("synthesis-registered-state")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Cannot build");
    await expect(page.getByTestId("synthesis-scope-block")).toHaveCount(0);
  });
});
