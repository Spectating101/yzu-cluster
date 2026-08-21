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
  // S-04 §6's canonical opening state. This fixture deliberately contains only
  // values the thread contract supports; it is the pixel-review target for the
  // whole composition, rather than a hand-drawn mock that can drift from the
  // API shape.
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
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("thread-acceptance")
        ? thread : { threads: [thread], total: 1 }),
    }));
  await page.goto("/?tab=synthesis");
  const firstThread = page.getByTestId("synthesis-thread-item").first();
  await expect(firstThread).toHaveCount(1);
  // Desktop owns thread selection in the left work rail. On a phone that rail
  // becomes a compact picker, while the page selects the first durable thread
  // after loading. Do not require an off-screen desktop control to be clicked.
  if (await firstThread.isVisible()) await firstThread.click();
  else await expect(page.locator(".s04-main h1")).toBeVisible();
}

test.describe("Synthesis acceptance screenshots", () => {
  for (const [name, extra] of Object.entries(STATES)) {
    for (const viewport of WIDTHS) {
      test(`${name} at ${viewport.id} ${viewport.width}px`, async ({ page }) => {
        mkdirSync(outDir, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await mount(page, threadFor(extra));
        await expect(page.getByTestId("synthesis-thread-item").first()).toHaveCount(1);
        await page.waitForTimeout(300);
        // The document is exactly viewport-height; the workspace scrolls inside
        // .rd-v2-body-scroll. fullPage therefore captures whatever that inner
        // scroller happened to be showing, which is how two unrelated states
        // produced identical mobile images. Reset it, then capture what a
        // researcher sees on arrival.
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
    await expect(main.getByText("Exploration ready", { exact: true })).toBeVisible();
    await expect(main.getByRole("region", { name: "Research brief" })).toBeVisible();
    await expect(main.getByRole("region", { name: "Recommended construction" })).toBeVisible();
    await expect(main.getByRole("region", { name: "What happens next" })).toBeVisible();
    await expect(main.getByText("asset × week", { exact: true })).toHaveCount(1);
    await expect(main.getByText("Composite weekly attention index", { exact: true })).toHaveCount(1);
    const accept = main.getByRole("button", { name: "Accept & design method" });
    await expect(accept).toBeEnabled();
    const acceptBox = await accept.boundingBox();
    expect(acceptBox, "the opening decision must be reachable without a desktop scroll").not.toBeNull();
    expect(acceptBox.y + acceptBox.height).toBeLessThanOrEqual(900);
    await expect(page.getByTestId("synthesis-opening-rail")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".s04-main h1")).toBeVisible();
    const mobileGrip = page.getByRole("button", { name: "Show Detail · Ask" });
    const mobileGripBox = await mobileGrip.boundingBox();
    expect(mobileGripBox, "the compact inspector affordance should remain available").not.toBeNull();
    expect(mobileGripBox.width).toBeLessThanOrEqual(68);
    expect(mobileGripBox.height).toBeGreaterThanOrEqual(44);
  });
});
