import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-automation";
const ACCEPTED_HASH = "sha256:auto-accepted-v1";
const SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_weekly_factor_exposure",
  grain: "asset × week",
  group_by: ["asset", "week"],
  metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
};
const NODES = [
  {
    id: "idn",
    dataset_id: "idn_fry_daily_cross_section",
    type: "source",
    layer: "evidence",
    label: "IDN daily cross-section",
    role: "Held input",
    status: "held",
    grain: "asset-day",
    coverage: "2020–2026",
  },
  {
    id: "ff",
    dataset_id: "fama_french_factors",
    type: "source",
    layer: "evidence",
    label: "Fama-French factors",
    role: "Validation",
    status: "queryable",
    grain: "day",
    coverage: "1963–2026",
  },
];

function proposalThread() {
  return {
    id: "thread-auto",
    created_at: "2026-09-02T10:00:00+00:00",
    updated_at: "2026-09-02T10:00:00+00:00",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    materialisation: "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
      required_grain: "asset × week",
      maturity: "review",
      maturityLabel: "Method review",
      nodes: structuredClone(NODES),
      edges: [],
      proposal: {
        id: "proposal-auto-v1",
        proposal_hash: "sha256:proposal-auto-v1",
        title: "Weekly factor exposure",
        summary: "Aggregate the daily cross-section to asset × week and join Fama-French factors backward.",
        operations: [{ op: "update_spec", summary: "Use weekly aggregation with the reviewed factor input." }],
        execution_spec: structuredClone(SPEC),
      },
      execution_spec: null,
      execution: null,
    },
  };
}

async function installAuthorityMock(page, { thread, counts }) {
  await mockV2Api(page);

  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const threadId = parts[index + 1] || "";
    const suffix = parts.slice(index + 2).join("/");
    const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (!threadId && method === "GET") return respond({ threads: [thread], total: 1 });
    if (threadId !== thread.id) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);

    if (suffix === "measurements" && method === "GET") {
      return respond({
        thread_id: thread.id,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: NODES.map((node) => node.dataset_id),
        measured_inputs: 2,
        unmeasured: [],
        column_profiles: [],
      });
    }

    if (suffix === "patches" && method === "POST") {
      counts.patch += 1;
      const body = route.request().postDataJSON?.() || {};
      if (
        body.decision !== "accept" ||
        body.proposal_id !== thread.state.proposal?.id ||
        body.proposal_hash !== thread.state.proposal?.proposal_hash
      ) {
        return respond({ error: "proposal identity mismatch" }, 409);
      }
      const proposal = thread.state.proposal;
      thread.state.execution_spec = structuredClone(proposal.execution_spec);
      thread.state.accepted_spec_hash = ACCEPTED_HASH;
      thread.state.proposal = null;
      thread.state.execution = {
        status: "spec_accepted",
        spec_hash: ACCEPTED_HASH,
        output_dataset_id: SPEC.output_dataset_id,
      };
      thread.state.maturity = "planned";
      thread.state.maturityLabel = "Accepted method";
      thread.updated_at = "2026-09-02T10:01:00+00:00";
      return respond(thread);
    }

    if (suffix === "execute" && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "preview") {
        counts.preview += 1;
        thread.state.preview = {
          status: "succeeded",
          spec_hash: ACCEPTED_HASH,
          authority_hash: "sha256:auto-preview-authority",
          bounded: true,
          materialised: false,
          registered: false,
          review_required: true,
          sampling: { source_rows: 969392, previewed_rows: 5000, source_truncated: true },
          rows: { preview_input: 5000, after_transforms: 4988, output: 71 },
          preflight: { warnings: [] },
          output: {
            dataset_id: SPEC.output_dataset_id,
            columns: ["asset", "week", "weekly_excess_return"],
            rows: [{ asset: "BBCA", week: "2026-W01", weekly_excess_return: 0.0124 }],
          },
        };
        thread.state.lastActivity = "Bounded Preview passed.";
        thread.updated_at = "2026-09-02T10:01:30+00:00";
        return respond({ thread, preview: thread.state.preview, preview_only: true, execution_submitted: false });
      }
      if (body.action === "request_approval") {
        counts.requestApproval += 1;
        if (thread.state.preview?.status !== "succeeded") {
          return respond({ error: "current Preview required" }, 409);
        }
        thread.state.execution = {
          status: "pending_approval",
          job_id: "job-auto",
          spec_hash: ACCEPTED_HASH,
          output_dataset_id: SPEC.output_dataset_id,
        };
        thread.state.lastActivity = "Execution request awaiting approval.";
        thread.updated_at = "2026-09-02T10:02:00+00:00";
        return respond({
          job: { id: "job-auto", status: "pending_approval" },
          thread,
          preview: thread.state.preview,
          execution_submitted: true,
        });
      }
      return respond({ error: `unexpected action ${body.action}` }, 400);
    }

    if (suffix === "conversation" && method === "POST") return respond(thread);
    return respond({ error: `unsupported ${method} ${suffix}` }, 400);
  });

  await page.route("**/library/jobs/job-auto/approve", async (route) => {
    counts.approve += 1;
    thread.state.execution = {
      ...thread.state.execution,
      status: "queued",
    };
    thread.state.lastActivity = "Approved execution queued.";
    thread.updated_at = "2026-09-02T10:02:30+00:00";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job: { id: "job-auto", status: "queued" } }),
    });
  });
}

async function openThread(page) {
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "IDN weekly factor exposure" }).click();
  await expect(page.getByTestId("synthesis-proposal-state")).toBeVisible();
}

async function selectActiveThread(page) {
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "IDN weekly factor exposure" }).click();
  await expect(page.getByTestId("synthesis-automation-mode")).toBeVisible();
}

test.describe("Synthesis agent authority", () => {
  test("Auto-choose persists but cannot cross proposal approval", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    const thread = proposalThread();
    const counts = { patch: 0, preview: 0, requestApproval: 0, approve: 0 };
    await installAuthorityMock(page, { thread, counts });
    await page.setViewportSize({ width: 1920, height: 961 });
    await openThread(page);

    const control = page.getByTestId("synthesis-automation-mode");
    await expect(control).toHaveValue("manual");
    await control.selectOption("auto_choose");
    await expect(control).toHaveValue("auto_choose");
    await expect.poll(() => counts.patch).toBe(0);
    await expect(page.getByRole("button", { name: "Accept & test method" })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator("aside.yzu-sidebar").getByTestId("synthesis-automation-mode")).toHaveCount(0);
    await selectActiveThread(page);
    await expect(page.getByTestId("synthesis-automation-mode")).toHaveValue("auto_choose");
    await expect(page.getByRole("button", { name: "Accept & test method" })).toBeVisible();
    expect(counts.patch).toBe(0);
    expect(counts.preview).toBe(0);
    expect(counts.requestApproval).toBe(0);
    expect(counts.approve).toBe(0);

    await page.screenshot({ path: `${outDir}/auto-choose-proposal-workstation.png`, fullPage: true });
  });

  test("Auto-approve advances one bound proposal through Preview and job approval once", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.addInitScript(() => {
      localStorage.setItem("rd_v2_synthesis_automation", "auto_approve");
    });
    const thread = proposalThread();
    const counts = { patch: 0, preview: 0, requestApproval: 0, approve: 0 };
    await installAuthorityMock(page, { thread, counts });
    await page.setViewportSize({ width: 1920, height: 961 });

    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator("aside.yzu-sidebar").getByTestId("synthesis-automation-mode")).toHaveCount(0);
    await selectActiveThread(page);
    await expect(page.getByTestId("synthesis-automation-mode")).toHaveValue("auto_approve");

    await expect.poll(() => counts.patch, { timeout: 10000 }).toBe(1);
    await expect.poll(() => counts.preview, { timeout: 10000 }).toBe(1);
    await expect.poll(() => counts.requestApproval, { timeout: 10000 }).toBe(1);
    await expect.poll(() => counts.approve, { timeout: 10000 }).toBe(1);
    await expect.poll(() => thread.state.execution?.status, { timeout: 10000 }).toBe("queued");

    await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state")).toHaveText("Build");
    await page.screenshot({ path: `${outDir}/auto-approve-build-workstation.png`, fullPage: true });

    await page.waitForTimeout(500);
    expect(counts.patch).toBe(1);
    expect(counts.preview).toBe(1);
    expect(counts.requestApproval).toBe(1);
    expect(counts.approve).toBe(1);
  });
});
