import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

function acceptedThread({ stale = false } = {}) {
  return {
    id: "thread-preview-authority",
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z",
    title: "Preview authority fixture",
    objective: "Construct a bounded weekly authority fixture.",
    materialisation: "not_materialised",
    state: {
      title: "Preview authority fixture",
      objective: "Construct a bounded weekly authority fixture.",
      required_grain: "asset × week",
      maturity: "accepted",
      maturityLabel: "Accepted method",
      nodes: [],
      accepted_spec_hash: "sha256:current",
      execution_spec: {
        input_dataset_id: "fixture_input",
        output_dataset_id: "synthesis_preview_authority_fixture",
        group_by: ["asset_id", "week"],
        metrics: [{ function: "count", as: "row_count" }],
        transforms: [],
      },
      execution: {
        status: "spec_accepted",
        spec_hash: "sha256:current",
        output_dataset_id: "synthesis_preview_authority_fixture",
      },
      ...(stale
        ? {
            preview: {
              status: "succeeded",
              spec_hash: "sha256:older",
              sampling: { source_rows: 1000, previewed_rows: 100 },
            },
          }
        : {}),
    },
  };
}

async function installAuthorityMocks(page, { stale = false } = {}) {
  let thread = acceptedThread({ stale });
  const actions = [];

  await page.route("**/library/synthesis/threads**", async (route) => {
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
    if (threadId === thread.id && !suffix && method === "GET") return respond(thread);
    if (threadId === thread.id && suffix === "execute" && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      const action = String(body.action || "");
      actions.push(action);
      if (action === "preview") {
        thread = {
          ...thread,
          updated_at: "2026-08-26T00:01:00Z",
          state: {
            ...thread.state,
            preview: {
              status: "succeeded",
              spec_hash: "sha256:current",
              authority_hash: "sha256:authority-current",
              bounded: true,
              materialised: false,
              registered: false,
              sampling: {
                strategy: "bounded_head",
                source_rows: 1000,
                previewed_rows: 100,
                source_truncated: true,
              },
              rows: { preview_input: 100, after_transforms: 100, output: 10 },
              output: {
                columns: ["asset_id", "week", "row_count"],
                rows: [{ asset_id: "A", week: "2026-W01", row_count: 10 }],
              },
              preflight: { warnings: [] },
            },
          },
        };
        return respond({
          thread,
          preview: thread.state.preview,
          preview_only: true,
          execution_submitted: false,
          review_required: true,
        });
      }
      if (action === "request_approval") {
        thread = {
          ...thread,
          updated_at: "2026-08-26T00:02:00Z",
          state: {
            ...thread.state,
            execution: {
              status: "pending_approval",
              job_id: "job-preview-authority",
              spec_hash: "sha256:current",
              output_dataset_id: "synthesis_preview_authority_fixture",
            },
          },
        };
        return respond({
          thread,
          preview: thread.state.preview,
          preview_only: false,
          execution_submitted: true,
          job: { id: "job-preview-authority", status: "pending_approval" },
        });
      }
      return respond({ error: `unexpected action: ${action}` }, 400);
    }
    if (threadId === thread.id && suffix === "discover-handoff" && method === "GET") {
      return respond({ thread_id: thread.id, missing_evidence: [], collect_intents: [] });
    }
    return respond({ error: "unsupported authority mock route" }, 400);
  });

  return { actions: () => [...actions] };
}

async function openFixture(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("synthesis-home-state")).toBeVisible();
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "Preview authority fixture" }).click();
  await expect(page.getByTestId("synthesis-execution-state")).toBeVisible();
}

test("Preview and approval remain separate visible and network intentions", async ({ page }) => {
  await mockV2Api(page);
  const observed = await installAuthorityMocks(page);
  await openFixture(page);

  const execution = page.getByTestId("synthesis-execution-state");
  const runPreview = execution.getByRole("button", { name: "Run bounded preview" });
  await expect(runPreview).toBeVisible();
  await expect(execution).toContainText("Bounded preview required");
  await runPreview.click();

  await expect.poll(() => observed.actions()).toEqual(["preview"]);
  await expect(execution).toContainText("Bounded preview passed");
  await expect(execution).toContainText("100");
  await expect(execution.getByRole("button", { name: "Request execution approval" })).toBeVisible();

  const rail = page.locator("aside.rd-v2-rail");
  await rail.getByRole("tab", { name: "Ask" }).click();
  await expect(rail.getByRole("button", { name: /What does this bounded Preview fail to cover/ })).toBeVisible();

  await execution.getByRole("button", { name: "Request execution approval" }).click();
  await expect.poll(() => observed.actions()).toEqual(["preview", "request_approval"]);
  await expect(execution.getByRole("button", { name: "Review approval" })).toBeVisible();
  await expect(page.getByTestId("research-situation")).toContainText("Approval");

  await rail.getByRole("tab", { name: "Detail" }).click();
  await rail.getByRole("tab", { name: "Ask" }).click();
  await expect(rail.getByRole("button", { name: /Tell me exactly what I would authorize/ })).toBeVisible();
});

test("a stale Preview can only rerun Preview from the browser", async ({ page }) => {
  await mockV2Api(page);
  const observed = await installAuthorityMocks(page, { stale: true });
  await openFixture(page);

  const execution = page.getByTestId("synthesis-execution-state");
  await expect(execution).toContainText("Stale");
  const rerun = execution.getByRole("button", { name: "Run bounded preview" });
  await expect(rerun).toBeVisible();
  await expect(execution.getByRole("button", { name: "Request execution approval" })).toHaveCount(0);
  await rerun.click();

  await expect.poll(() => observed.actions()).toEqual(["preview"]);
  await expect(execution.getByRole("button", { name: "Request execution approval" })).toBeVisible();
});
