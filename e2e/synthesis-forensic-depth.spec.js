import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-forensics";
const ACCEPTED_HASH = "sha256:forensic-v2";
const CURRENT_SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_daily_factor_exposure",
  grain: "asset × day",
  group_by: ["asset", "date"],
  metrics: [{ function: "mean", column: "excess_return", as: "daily_excess_return" }],
};
const EXECUTION_SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_weekly_factor_exposure",
  grain: "asset × week",
  transforms: [
    { op: "filter", column: "market", cmp: "eq", value: "IDX" },
    { op: "normalize", column: "return_pct", operation: "divide_by_100", as: "return_decimal" },
    { op: "join", right_dataset_id: "fama_french_daily", on: ["date"], how: "left" },
  ],
  group_by: ["asset", "week"],
  metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
};

function thread() {
  return {
    id: "thread-forensic-depth",
    created_at: "2026-09-04T00:00:00Z",
    updated_at: "2026-09-04T00:00:00Z",
    title: "IDN weekly factor exposure",
    objective: "Construct weekly excess return per Indonesian listed equity against Fama-French factors.",
    materialisation: "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Construct weekly excess return per Indonesian listed equity against Fama-French factors.",
      required_grain: "asset × week",
      nodes: [
        { id: "idn", type: "source", layer: "evidence", label: "IDN daily cross-section", role: "Held input" },
        { id: "ff", type: "source", layer: "evidence", label: "Fama-French factors", role: "Validation" },
      ],
      edges: [],
      measured_inputs: 2,
      spec: CURRENT_SPEC,
      proposal: {
        id: "proposal-forensic-v2",
        proposal_hash: "sha256:proposal-forensic-v2",
        title: "Weekly factor exposure revision",
        summary: "Move the construction from asset-day to asset-week and bind the factor join.",
        operations: [
          {
            op: "update_spec",
            patch: {
              grain: "asset × week",
              group_by: ["asset", "week"],
              transforms: EXECUTION_SPEC.transforms,
              metrics: EXECUTION_SPEC.metrics,
              output_dataset_id: EXECUTION_SPEC.output_dataset_id,
            },
          },
        ],
        execution_spec: EXECUTION_SPEC,
      },
      execution_spec: EXECUTION_SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: {
        status: "succeeded",
        spec_hash: ACCEPTED_HASH,
        bounded: true,
        sampling: { strategy: "first_rows", source_rows: 969392, previewed_rows: 5000 },
        rows: { after_transforms: 4988, output: 71 },
        row_effects: [
          { label: "Filter market", before: 5000, after: 4996 },
          { label: "Join factors", before: 4996, after: 4988 },
        ],
        preflight: { warnings: ["12 preview rows were removed before aggregation."] },
        output: {
          columns: ["asset", "week", "weekly_excess_return"],
          rows: [{ asset: "BBCA", week: "2026-W01", weekly_excess_return: 0.0124 }],
        },
      },
      execution: {
        status: "running",
        job_id: "job-forensic-001",
        output_dataset_id: EXECUTION_SPEC.output_dataset_id,
        rows: 4988,
        manifest_id: "manifest-forensic-001",
      },
    },
  };
}

async function mount(page) {
  const activeThread = thread();
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/measurements")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: activeThread.id,
          writes: false,
          measurement_basis: "mapped_library_bytes",
          input_dataset_ids: ["idn", "ff"],
          measured_inputs: 2,
          unmeasured: [],
          column_profiles: [],
          unit_conflict: null,
          join_candidates: [],
        }),
      });
    }
    if (url.pathname.endsWith("/discover-handoff")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread_id: activeThread.id, missing_evidence: [], collect_intents: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.pathname.endsWith(`/${activeThread.id}`)
        ? activeThread
        : { threads: [activeThread], total: 1 }),
    });
  });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await page.locator("button:visible").filter({ hasText: activeThread.title }).first().click();
  await expect(page.locator(".rd-v2-synthesis-page")).toBeVisible();
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByTestId("synthesis-agent-console")).toBeVisible();
}

function emitRun(page, detail) {
  return page.evaluate((payload) => {
    document.dispatchEvent(new CustomEvent("synthesis:agent-activity", { detail: payload }));
  }, detail);
}

test("Synthesis exposes terminal-depth method, row, runtime, and multi-run proof without cluttering the default desk", async ({ page }) => {
  mkdirSync(outDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page);

  const base = Date.now() - 20000;
  await emitRun(page, { threadId: "thread-forensic-depth", kind: "run_started", runId: "forensic-run-1", at: base });
  for (let index = 1; index <= 8; index += 1) {
    await emitRun(page, {
      threadId: "thread-forensic-depth",
      kind: "activity",
      text: index === 8 ? "Drafting exact method proposal" : `Inspecting evidence operation ${index}`,
      action: index === 8 ? "proposal" : "read_evidence",
      at: base + index * 1000,
    });
  }
  await emitRun(page, { threadId: "thread-forensic-depth", kind: "run_completed", at: base + 9000 });
  await emitRun(page, { threadId: "thread-forensic-depth", kind: "run_started", runId: "forensic-run-2", at: base + 10000 });
  await emitRun(page, {
    threadId: "thread-forensic-depth",
    kind: "activity",
    text: "Validating bounded Preview receipt",
    action: "preview",
    at: base + 11000,
  });
  await emitRun(page, { threadId: "thread-forensic-depth", kind: "run_completed", at: base + 12000 });

  const run = page.getByTestId("synthesis-agent-run");
  await expect(run).toContainText("Validating bounded Preview receipt");
  const trace = page.getByTestId("synthesis-agent-trace");
  await expect(trace).toBeVisible();
  await expect(trace.locator(":scope > summary")).toContainText("9 operations · 2 runs");
  await trace.locator(":scope > summary").click();
  await expect(trace).toContainText("Inspecting evidence operation 1");
  await expect(trace).toContainText("Drafting exact method proposal");

  const forensics = page.getByTestId("synthesis-forensics");
  await expect(forensics).toBeVisible();
  await forensics.locator(":scope > summary").click();

  const diff = page.getByTestId("synthesis-research-diff");
  await expect(diff).toContainText("grain");
  await expect(diff).toContainText("asset × day");
  await expect(diff).toContainText("asset × week");

  const recipe = page.getByTestId("synthesis-exact-recipe");
  await expect(recipe).toContainText("filter");
  await expect(recipe).toContainText("normalize");
  await expect(recipe).toContainText("join");
  await expect(recipe).toContainText("fama_french_daily");
  await recipe.getByText("View exact spec JSON").click();
  await expect(recipe.locator("pre")).toContainText('"op": "join"');

  const preview = page.getByTestId("synthesis-preview-forensics");
  await expect(preview).toContainText("Filter market");
  await expect(preview).toContainText("Join factors");
  await expect(preview).toContainText("-4");
  await expect(preview).toContainText("-8");
  await expect(preview).toContainText("12 preview rows were removed");

  const execution = page.getByTestId("synthesis-execution-forensics");
  await expect(execution).toContainText("running");
  await expect(execution).toContainText("job-forensic-001");
  await expect(execution).toContainText("manifest-forensic-001");
  await expect(execution).toContainText("4,988");

  await page.screenshot({ path: `${outDir}/terminal-depth-1440.png`, fullPage: true });
});
