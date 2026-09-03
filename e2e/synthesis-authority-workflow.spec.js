import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-authority-workflow";
const ACCEPTED_HASH = "sha256:authority-workflow-v1";
const SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_weekly_factor_exposure",
  grain: "asset × week",
  group_by: ["asset", "week"],
  metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
};
const NODES = [
  { id: "idn", type: "source", layer: "evidence", label: "IDN daily cross-section", role: "Held input", grain: "asset-day", coverage: "2020–2026" },
  { id: "ff", type: "source", layer: "evidence", label: "Fama-French factors", role: "Validation", grain: "day", coverage: "1963–2026" },
];
const PREVIEW = {
  status: "succeeded",
  spec_hash: ACCEPTED_HASH,
  bounded: true,
  materialised: false,
  registered: false,
  sampling: { strategy: "first_rows", source_rows: 969392, previewed_rows: 5000 },
  rows: { after_transforms: 4988, output: 71 },
  output: {
    columns: ["asset", "week", "weekly_excess_return"],
    rows: [{ asset: "BBCA", week: "2026-W01", weekly_excess_return: 0.0124 }],
  },
};

const STAGES = [
  {
    id: "01-objective",
    phase: "design",
    status: "No output registered",
    state: { nodes: [] },
  },
  {
    id: "02-evidence",
    phase: "design",
    status: "No output registered",
    state: { nodes: NODES },
  },
  {
    id: "03-specification",
    phase: "design",
    status: "No output registered",
    state: {
      nodes: NODES,
      unit_conflict: {
        source_dataset_id: "idn",
        source_column: "return_pct",
        source_unit: "percent",
        target_unit: "decimal",
        operation: "divide by 100",
      },
    },
  },
  {
    id: "04-proposal",
    phase: "review",
    status: "Reviewable change",
    state: {
      nodes: NODES,
      proposal: {
        id: "proposal-authority-workflow",
        proposal_hash: "sha256:proposal-authority-workflow",
        title: "Weekly factor exposure",
        summary: "Aggregate daily excess returns to asset × week.",
        operations: [{ op: "update_spec", patch: { grain: "asset × week" } }],
        execution_spec: SPEC,
      },
    },
  },
  {
    id: "05-preview",
    phase: "review",
    status: "Durable execution state",
    state: {
      nodes: NODES,
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "spec_accepted", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    },
  },
  {
    id: "06-approval",
    phase: "review",
    status: "Durable execution state",
    state: {
      nodes: NODES,
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "pending_approval", job_id: "job-pending", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    },
  },
  {
    id: "07-build",
    phase: "execute",
    status: "Durable execution state",
    state: {
      nodes: NODES,
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "running", job_id: "job-running", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    },
  },
  {
    id: "08-result",
    phase: "execute",
    status: "Query-ready evidence",
    state: {
      nodes: NODES,
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: {
        status: "query_ready",
        job_id: "job-complete",
        spec_hash: ACCEPTED_HASH,
        output_dataset_id: SPEC.output_dataset_id,
        manifest_id: "manifest-complete",
        rows: 969392,
        drive_verified: true,
      },
    },
  },
];

function threadFor(extra = {}) {
  return {
    id: "thread-authority-workflow",
    created_at: "2026-09-03T15:00:00Z",
    updated_at: "2026-09-03T15:00:00Z",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    materialisation: ["registered", "query_ready"].includes(extra.execution?.status)
      ? extra.execution.status
      : "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
      required_grain: "asset × week",
      nodes: [],
      edges: [],
      spec: SPEC,
      ...extra,
    },
  };
}

async function mount(page, extra) {
  const thread = threadFor(extra);
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/measurements")) {
      const nodes = Array.isArray(thread.state.nodes) ? thread.state.nodes : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: thread.id,
          writes: false,
          measurement_basis: "mapped_library_bytes",
          input_dataset_ids: nodes.map((node) => node.id),
          measured_inputs: nodes.length,
          unmeasured: [],
          column_profiles: [],
          unit_conflict: thread.state.unit_conflict || null,
          join_candidates: thread.state.join_candidates || [],
        }),
      });
    }
    if (url.pathname.endsWith("/discover-handoff")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread_id: thread.id, missing_evidence: [], collect_intents: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.pathname.endsWith(`/${thread.id}`)
        ? thread
        : { threads: [thread], total: 1 }),
    });
  });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await page.locator("button:visible").filter({ hasText: thread.title }).first().click();
  await expect(page.locator(".rd-v2-synthesis-page")).toBeVisible();
}

async function remount(page, extra) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.goto("about:blank");
  await mount(page, extra);
}

test("AI authority remains attached to the active research consequence through the full lifecycle", async ({ page }) => {
  mkdirSync(outDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  for (let index = 0; index < STAGES.length; index += 1) {
    const stage = STAGES[index];
    if (index === 0) await mount(page, stage.state);
    else await remount(page, stage.state);

    const root = page.locator(".rd-v2-synthesis-page");
    const headerStatus = page.locator(".s04-head > em");
    const authority = headerStatus.getByTestId("synthesis-authority-control");
    const mode = authority.getByTestId("synthesis-automation-mode");

    await expect(root).toHaveAttribute("data-synthesis-workspace-phase", stage.phase);
    await expect(headerStatus).toContainText(stage.status);
    await expect(authority).toBeVisible();
    await expect(page.locator("aside.yzu-sidebar").getByTestId("synthesis-automation-mode")).toHaveCount(0);

    if (index === 0) {
      await expect(mode).toHaveValue("manual");
      await mode.selectOption("auto_choose");
    }
    await expect(mode).toHaveValue("auto_choose");

    await page.screenshot({ path: `${outDir}/${stage.id}-1440.png`, fullPage: true });
  }
});
