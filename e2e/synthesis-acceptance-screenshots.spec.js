import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { EXAMPLE_STATE } from "../drive/src/v2/synthesisContract.js";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const E = EXAMPLE_STATE;
const outDir = "artifacts/synthesis-acceptance";

const WIDTHS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "workstation", width: 1920, height: 961 },
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
  group_by: ["asset", "week"],
  metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
};

const ACCEPTED_HASH = "2d6ed4f1c316e30b2a5d8d0698e50f98";
const PREVIEW = {
  status: "succeeded",
  created_at: "2026-08-19T09:10:00+00:00",
  spec_hash: ACCEPTED_HASH,
  bounded: true,
  materialised: false,
  registered: false,
  review_required: true,
  sampling: {
    strategy: "first_rows",
    input_row_limit: 5000,
    source_rows: 969392,
    previewed_rows: 5000,
    source_truncated: true,
  },
  preflight: { warnings: [], join_probes: [] },
  rows: { source: 969392, preview_input: 5000, after_transforms: 4988, output: 71, by_step: [] },
  output: {
    dataset_id: "idn_weekly_factor_exposure",
    columns: ["asset", "week", "weekly_excess_return"],
    dtypes: { asset: "object", week: "object", weekly_excess_return: "float64" },
    rows_returned: 3,
    rows: [
      { asset: "BBCA", week: "2026-W01", weekly_excess_return: 0.0124 },
      { asset: "TLKM", week: "2026-W01", weekly_excess_return: -0.0041 },
      { asset: "ASII", week: "2026-W01", weekly_excess_return: 0.0087 },
    ],
  },
};

const previewed = {
  accepted_spec_hash: ACCEPTED_HASH,
  preview: PREVIEW,
};

const STATES = {
  "00-opening-recommended": {
    durable_state: "exploration_ready",
    brief: "A reusable longitudinal measure of observable public attention to individual stablecoins, constructed from held and reachable evidence.",
    required_grain: "asset × week",
    target_period: "2021 onward",
    intended_use: "Reusable input for later empirical studies",
    constructions: [
      {
        recommended: true,
        title: "Composite weekly attention index",
        nodes: [
          { id: "trends", role: "Search intent", source: "Google Trends", grain: "asset-week" },
          { id: "community", role: "Community activity", source: "Reddit activity", grain: "asset-week" },
          { id: "visibility", role: "Public visibility", source: "Wikipedia views", grain: "asset-day" },
        ],
        validation_role: "GDELT news",
        ideal_direct_measure: {
          label: "Historical X follower growth",
          unavailable_because: "no verified history",
        },
        expected_output: {
          label: "Stablecoin attention weekly panel",
          grain: "asset-week",
          period: "2021–2026",
        },
        ai_resolved: ["source roles", "target grain", "validation role"],
        method_will_resolve: ["component weighting", "missing-component rule"],
      },
      { title: "Event-only attention panel" },
      { title: "Single-source visibility proxy" },
    ],
  },
  "00a-defined": {},
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
  "06a-preview-required": {
    nodes: NODES,
    execution_spec: SPEC,
    accepted_spec_hash: ACCEPTED_HASH,
    execution: { status: "spec_accepted", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
  },
  "06b-preview-passed": {
    nodes: NODES,
    execution_spec: SPEC,
    ...previewed,
    execution: { status: "spec_accepted", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
  },
  "06c-approval": {
    nodes: NODES,
    execution_spec: SPEC,
    ...previewed,
    execution: { status: "pending_approval", job_id: "job-pending", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
  },
  "07-building": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "running", job_id: "job-running", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id } },
  "07a-completed-awaiting-registry": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "completed", job_id: "job-completed", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id, rows: 969392 } },
  "08-registered": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "registered", job_id: "job-8842", spec_hash: ACCEPTED_HASH, output_dataset_id: "idn_weekly_factor_exposure",
                 manifest_id: "man-8842", rows: 969392, drive_verified: true },
    provenance: E.provenance, settled_decisions: E.settled_decisions, excursions: E.excursions,
    column_profiles: E.column_profiles, columns_in_use: E.columns_in_use },
  "08a-query-ready": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "query_ready", job_id: "job-8842", spec_hash: ACCEPTED_HASH, output_dataset_id: "idn_weekly_factor_exposure",
                 manifest_id: "man-8842", rows: 969392, drive_verified: true },
    provenance: E.provenance, settled_decisions: E.settled_decisions, excursions: E.excursions,
    column_profiles: E.column_profiles, columns_in_use: E.columns_in_use },
  "09-failed": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "failed", job_id: "job-failed", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id,
      error: "as-of join produced 206,432,820 rows, over the 1,000,000 limit" } },
  "10-reuse": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "registered", job_id: "job-reuse", spec_hash: ACCEPTED_HASH, output_dataset_id: "idn_weekly_factor_exposure",
      drive_verified: true },
    reuse_from: E.reuse_from, reuse_changes: E.reuse_changes },
  "11-stale-fields": { nodes: NODES, execution_spec: SPEC, ...previewed,
    execution: { status: "registered", job_id: "job-stale", spec_hash: ACCEPTED_HASH, output_dataset_id: "idn_weekly_factor_exposure",
      drive_verified: true },
    scope_block: E.scope_block, unit_conflict: E.unit_conflict, provenance: E.provenance },
};

const EXPECTED_PHASE = {
  "00-opening-recommended": "Method",
  "00a-defined": "Evidence",
  "01-exploring": "Method",
  "02-columns": "Method",
  "03-scope-blocked": "Method",
  "04-unit-conflict": "Method",
  "05-join": "Method",
  "06-proposal": "Proposal",
  "06a-preview-required": "Preview",
  "06b-preview-passed": "Preview",
  "06c-approval": "Approval",
  "07-building": "Build",
  "07a-completed-awaiting-registry": "Build",
  "08-registered": "Result",
  "08a-query-ready": "Result",
  "09-failed": "Build",
  "10-reuse": "Result",
  "11-stale-fields": "Result",
};

const EXECUTION_FIRST = new Set([
  "06a-preview-required",
  "06b-preview-passed",
  "06c-approval",
  "07-building",
  "07a-completed-awaiting-registry",
  "08-registered",
  "08a-query-ready",
  "09-failed",
  "10-reuse",
  "11-stale-fields",
]);

const threadFor = (extra) => ({
  id: "thread-acceptance",
  created_at: "2026-08-19T09:00:00+00:00",
  updated_at: "2026-08-19T09:00:00+00:00",
  title: "IDN weekly factor exposure",
  objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
  materialisation: ["registered", "query_ready"].includes(extra.execution?.status)
    ? extra.execution.status
    : "not_materialised",
  state: {
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    required_grain: "asset × week",
    maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.",
    nodes: [], edges: [], proposal: null, spec: SPEC,
    ...extra,
  },
});

const PANELS = [
  ["synthesis-scope-block", "panel-scope"],
  ["synthesis-unit-conflict", "panel-units"],
  ["synthesis-join-decision", "panel-join"],
  ["synthesis-method-surface", "panel-columns"],
  ["synthesis-settled-decisions", "panel-settled"],
  ["synthesis-provenance", "panel-provenance"],
  ["synthesis-reuse", "panel-reuse"],
  ["synthesis-excursion-record", "panel-excursions"],
];

async function resetScroll(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(120);
}

async function mount(page, thread) {
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("thread-acceptance")
        ? thread : { threads: [thread], total: 1 }),
    }));
  await page.goto("/?tab=synthesis");
  const firstThread = page.locator("button:visible").filter({ hasText: thread.title }).first();
  await expect(firstThread).toBeVisible();
  await firstThread.click();
  await expect(page.getByTestId("synthesis-home-state")).toHaveCount(0);
}

test.describe("Synthesis acceptance screenshots", () => {
  for (const [name, extra] of Object.entries(STATES)) {
    for (const viewport of WIDTHS) {
      test(`${name} at ${viewport.id} ${viewport.width}px`, async ({ page }) => {
        mkdirSync(outDir, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mount(page, threadFor(extra));
        await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state"))
          .toHaveText(EXPECTED_PHASE[name]);

        if (name === "00a-defined") {
          await expect(page.getByTestId("synthesis-workflow-next")).toContainText("Find held evidence");
          await expect(page.getByTestId("synthesis-evidence-state")).toBeVisible();
          await expect(page.getByTestId("synthesis-evidence-state")).toContainText("No inputs mapped");
        }

        if (name === "06a-preview-required") {
          const preview = page.getByTestId("synthesis-preview-state");
          await expect(preview).toBeVisible();
          await expect(preview).toContainText("Test this accepted recipe before full execution");
          await expect(page.getByRole("button", { name: "Run bounded test" })).toBeVisible();
        }

        if (name === "06b-preview-passed") {
          const preview = page.getByTestId("synthesis-preview-state");
          await expect(preview).toBeVisible();
          await expect(preview).toContainText("This accepted recipe completed on bounded bytes");
          await expect(preview).toContainText("5,000");
          await expect(page.getByRole("button", { name: "Review execution approval" })).toBeVisible();
        }

        if (name === "06c-approval") {
          await expect(page.getByTestId("synthesis-preview-state")).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Review execution approval" })).toBeVisible();
          await expect(page.getByText("Bounded preview", { exact: true })).toBeVisible();
          const previewStep = page.getByRole("listitem").filter({ hasText: "Bounded preview" }).first();
          await expect(previewStep).toBeVisible();
          await expect(previewStep).toContainText("✓");
        }

        if (viewport.id === "desktop" && EXECUTION_FIRST.has(name)) {
          const execution = page.locator(
            '[data-testid="synthesis-execution-state"], [data-testid="synthesis-failed-state"], [data-testid="synthesis-registered-state"], [data-testid="synthesis-query-ready-state"]',
          ).first();
          const evidence = page.getByTestId("synthesis-evidence-state").first();
          await expect(execution).toBeVisible();
          if (await evidence.count()) {
            const [executionBox, evidenceBox] = await Promise.all([execution.boundingBox(), evidence.boundingBox()]);
            expect(executionBox).not.toBeNull();
            expect(evidenceBox).not.toBeNull();
            expect(executionBox.y, `${name} should foreground execution/result truth`).toBeLessThan(evidenceBox.y);
          }
          await expect(page.locator(".s04-steps")).not.toBeVisible();
        }

        await page.waitForTimeout(300);
        await resetScroll(page);
        await page.screenshot({ path: `${outDir}/${name}-${viewport.id}.png` });

        for (const [testid, suffix] of PANELS) {
          const panel = page.getByTestId(testid);
          if (await panel.count()) {
            await panel.first().scrollIntoViewIfNeeded();
            await panel.first().screenshot({ path: `${outDir}/${name}-${viewport.id}-${suffix}.png` });
            await resetScroll(page);
          }
        }

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

  test("the Synthesis work header keeps its count and creation action legible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, threadFor(STATES["00-opening-recommended"]));

    const heading = page.locator(".s04-thread-heading");
    const label = heading.locator("span");
    const count = heading.locator("small");
    const create = page.getByRole("button", { name: "+ New synthesis" });
    await expect(label).toBeVisible();
    await expect(count).toBeVisible();
    await expect(create).toBeVisible();
    const [labelBox, countBox, createBox] = await Promise.all([
      label.boundingBox(), count.boundingBox(), create.boundingBox(),
    ]);
    expect(labelBox).not.toBeNull();
    expect(countBox).not.toBeNull();
    expect(createBox).not.toBeNull();
    expect(countBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height + 2);
    expect(createBox.x).toBeGreaterThan(labelBox.x + labelBox.width);
  });

  test("interactive evidence nodes keep role, source, and coverage on separate lines", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, threadFor(STATES["01-exploring"]));

    const node = page.locator(".s04-map-node").first();
    const role = node.locator("small");
    const source = node.locator("strong");
    const coverage = node.locator("span");
    await expect(node).toBeVisible();
    const [roleBox, sourceBox, coverageBox] = await Promise.all([
      role.boundingBox(), source.boundingBox(), coverage.boundingBox(),
    ]);
    expect(roleBox).not.toBeNull();
    expect(sourceBox).not.toBeNull();
    expect(coverageBox).not.toBeNull();
    expect(sourceBox.y).toBeGreaterThanOrEqual(roleBox.y + roleBox.height + 2);
    expect(coverageBox.y).toBeGreaterThanOrEqual(sourceBox.y + sourceBox.height + 2);
  });

  test("the S-04 opening is a complete, non-duplicated visual state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, threadFor(STATES["00-opening-recommended"]));

    const main = page.locator(".s04-main");
    await expect(main.getByText("Construction recommendation", { exact: true })).toBeVisible();
    await expect(main.getByRole("region", { name: "Research brief" })).toBeVisible();
    await expect(main.getByRole("region", { name: "Recommended construction" })).toBeVisible();
    await expect(main.getByRole("region", { name: "What happens next" })).toBeVisible();
    await expect(main.locator(':text-is("asset × week"):visible')).toHaveCount(1);
    await expect(main.getByText("Composite weekly attention index", { exact: true })).toHaveCount(1);
    const accept = main.getByRole("button", { name: "Accept & design method" });
    await expect(accept).toBeEnabled();
    const acceptBox = await accept.boundingBox();
    expect(acceptBox, "the opening decision must be reachable without a desktop scroll").not.toBeNull();
    expect(acceptBox.y + acceptBox.height).toBeLessThanOrEqual(900);
    await expect(page.getByTestId("synthesis-opening-rail")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".s04-main h1")).toBeVisible();
    const mobileGrip = page.getByRole("button", { name: "Show research context" });
    const mobileGripBox = await mobileGrip.boundingBox();
    expect(mobileGripBox, "the compact inspector affordance should remain available").not.toBeNull();
    expect(mobileGripBox.height).toBeGreaterThanOrEqual(44);
  });
});