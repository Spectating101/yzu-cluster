import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-continuity";
const ACCEPTED_HASH = "sha256:continuity-v1";
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
const RECOMMENDATION = {
  recommended: true,
  title: "Weekly factor exposure construction",
  nodes: [
    { id: "idn", role: "Returns", source: "IDN daily cross-section", grain: "asset-day" },
    { id: "ff", role: "Factors", source: "Fama-French factors", grain: "day" },
  ],
  expected_output: { label: "IDN weekly factor exposure", grain: "asset-week", period: "2020–2026" },
};
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

function threadFor(extra = {}) {
  return {
    id: "thread-continuity",
    created_at: "2026-09-03T12:00:00Z",
    updated_at: "2026-09-03T12:00:00Z",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    materialisation: ["registered", "query_ready"].includes(extra.execution?.status)
      ? extra.execution.status
      : "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
      required_grain: "asset × week",
      nodes: NODES,
      edges: [],
      spec: SPEC,
      ...extra,
    },
  };
}

async function mount(page, extra) {
  const thread = threadFor(extra);
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().url().includes(thread.id)
        ? thread
        : { threads: [thread], total: 1 }),
    }));
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await page.locator("button:visible").filter({ hasText: thread.title }).first().click();
  await expect(page.locator(".rd-v2-synthesis-page")).toBeVisible();
  return thread;
}

test.describe("Synthesis continuity surfaces", () => {
  test("Proposal becomes the review surface instead of stacking old opening guidance", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, {
      constructions: [RECOMMENDATION],
      proposal: {
        id: "proposal-continuity",
        proposal_hash: "sha256:proposal-continuity",
        title: "Weekly factor exposure",
        summary: "Aggregate the daily cross-section to asset × week.",
        operations: [{ op: "update_spec", patch: { grain: "asset × week" } }],
        execution_spec: SPEC,
      },
    });

    const root = page.locator(".rd-v2-synthesis-page");
    await expect(root).toHaveAttribute("data-synthesis-workspace-phase", "review");
    await expect(page.getByTestId("synthesis-proposal-state")).toBeVisible();
    await expect(page.locator(".s04-opening-workflow-wrap")).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Recommended construction" })).not.toBeVisible();
    await expect(page.getByRole("region", { name: "What happens next" })).not.toBeVisible();
    await expect(page.getByTestId("synthesis-evidence-state")).toBeVisible();
    await page.screenshot({ path: `${outDir}/proposal-review-1440.png`, fullPage: true });
  });

  test("Preview and Approval remain Review while a running worker becomes Execute", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await mount(page, {
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "spec_accepted", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    });
    await expect(page.locator(".rd-v2-synthesis-page")).toHaveAttribute("data-synthesis-workspace-phase", "review");
    await expect(page.getByTestId("synthesis-preview-state")).toBeVisible();
    await expect(page.locator(".s04-steps")).not.toBeVisible();
    await page.screenshot({ path: `${outDir}/preview-review-1440.png`, fullPage: true });

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("about:blank");
    await mount(page, {
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "pending_approval", job_id: "job-pending", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    });
    await expect(page.locator(".rd-v2-synthesis-page")).toHaveAttribute("data-synthesis-workspace-phase", "review");
    await expect(page.getByRole("button", { name: "Review execution approval" })).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("about:blank");
    await mount(page, {
      execution_spec: SPEC,
      accepted_spec_hash: ACCEPTED_HASH,
      preview: PREVIEW,
      execution: { status: "running", job_id: "job-running", spec_hash: ACCEPTED_HASH, output_dataset_id: SPEC.output_dataset_id },
    });
    await expect(page.locator(".rd-v2-synthesis-page")).toHaveAttribute("data-synthesis-workspace-phase", "execute");
    await page.screenshot({ path: `${outDir}/build-execute-1440.png`, fullPage: true });
  });

  test("Ask exposes durable agent operations and can focus their centre proof", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, {
      measured_inputs: 2,
      unmeasured: [],
      proposal: {
        id: "proposal-observable",
        proposal_hash: "sha256:proposal-observable",
        title: "Weekly factor exposure",
        summary: "Aggregate the daily cross-section to asset × week.",
        operations: [{ op: "update_spec", patch: { grain: "asset × week" } }],
        execution_spec: SPEC,
      },
    });

    await page.getByRole("tab", { name: "Ask" }).click();
    const console = page.getByTestId("synthesis-agent-console");
    await expect(console).toBeVisible();
    await expect(console).toContainText("AI operations");
    await expect(console).toContainText("Review");
    await expect(console).toContainText("Research intent recorded");
    await expect(console).toContainText("Evidence measured");
    await expect(console).toContainText("Exact proposal recorded");

    await console.getByRole("button", { name: /Exact proposal recorded/ }).click();
    await expect(page.getByTestId("synthesis-proposal-state")).toHaveAttribute("data-synthesis-agent-focus", "true");
    await page.screenshot({ path: `${outDir}/ask-agent-operations-1440.png`, fullPage: true });
  });

  test("a new Design decision does not pull the viewport away inside the same workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, {
      scope_block: { rows: 1043042, limit: 1000000, options: [] },
    });

    const root = page.locator(".rd-v2-synthesis-page");
    await expect(root).toHaveAttribute("data-synthesis-workspace-phase", "design");
    await expect(page.getByTestId("synthesis-scope-block")).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 240));
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => {
      document.querySelector('[data-testid="synthesis-scope-block"]')?.remove();
      const next = document.createElement("section");
      next.setAttribute("data-testid", "synthesis-unit-conflict");
      next.style.marginTop = "1800px";
      next.style.height = "240px";
      next.innerHTML = "<h2>Unit decision</h2>";
      document.querySelector(".s04-main")?.appendChild(next);
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    await expect(root).toHaveAttribute("data-synthesis-workspace-phase", "design");
  });
});
