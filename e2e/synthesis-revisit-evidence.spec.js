import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const EVIDENCE = {
  id: "idn_fry_daily_cross_section",
  dataset_id: "idn_fry_daily_cross_section",
  type: "source",
  layer: "evidence",
  label: "Indonesia daily cross-section",
  status: "query_ready",
  query_ready: true,
  grain: "ric-day",
  coverage: "2020–2026",
  proposed_by: "semantic_evidence_map",
};

function makeThread(id, title) {
  return {
    id,
    created_at: "2026-08-26T00:00:00+00:00",
    updated_at: "2026-08-26T00:00:00+00:00",
    title,
    objective: `Build ${title.toLowerCase()} from held research evidence.`,
    materialisation: "not_materialised",
    state: {
      title,
      objective: `Build ${title.toLowerCase()} from held research evidence.`,
      required_grain: "issuer × week",
      maturity: "exploring",
      maturityLabel: "Evidence mapping",
      lastActivity: "Construction created.",
      materialisation: "not_materialised",
      nodes: [],
      edges: [],
      proposal: null,
      execution_spec: null,
      execution: null,
    },
  };
}

async function installRevisitMock(page) {
  const target = makeThread("thread-revisit", "Revisit evidence thread");
  const comparison = makeThread("thread-comparison", "Comparison thread");
  const threads = new Map([
    [target.id, target],
    [comparison.id, comparison],
  ]);
  let targetEvidenceReads = 0;
  let evidenceWrites = 0;

  await page.route("**/library/synthesis/threads**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const threadIndex = parts.lastIndexOf("threads");
    const threadId = parts[threadIndex + 1] || "";
    const suffix = parts.slice(threadIndex + 2).join("/");
    const method = request.method();
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (!threadId && method === "GET") {
      return respond({ threads: [...threads.values()], total: threads.size });
    }

    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);

    if (suffix === "measurements" && method === "GET") {
      return respond({
        thread_id: threadId,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: [],
        measured_inputs: 0,
        unmeasured: [],
        column_profiles: [],
      });
    }

    if (suffix === "evidence-map" && method === "GET") {
      if (threadId === target.id) targetEvidenceReads += 1;
      return respond({
        thread_id: threadId,
        objective: thread.objective,
        nodes: threadId === target.id ? [structuredClone(EVIDENCE)] : [],
        reason: threadId === target.id ? "" : "no held evidence proposed for comparison thread",
        review_required: true,
        writes: false,
      });
    }

    if (suffix === "evidence-map" && method === "POST") {
      evidenceWrites += 1;
      return respond({ error: "this regression never permits a durable evidence write" }, 500);
    }

    if (suffix === "materialisation" && method === "GET") {
      return respond({
        thread_id: threadId,
        materialisation: "not_materialised",
        output_registered: false,
        output_dataset_id: "",
      });
    }

    return respond({ error: `unsupported mock route: ${method} ${suffix}` }, 400);
  });

  return {
    target,
    comparison,
    targetEvidenceReads: () => targetEvidenceReads,
    evidenceWrites: () => evidenceWrites,
  };
}

test("reopening an unmapped thread restores its read-only held-evidence proposal", async ({ page }) => {
  await mockV2Api(page);
  const state = await installRevisitMock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const proposal = page.getByTestId("synthesis-evidence-proposal");
  await expect(proposal).toContainText("Indonesia daily cross-section");
  await expect(page.getByTestId("synthesis-evidence-state")).toContainText("No inputs mapped");
  await expect.poll(state.targetEvidenceReads).toBeGreaterThanOrEqual(1);
  expect(state.evidenceWrites()).toBe(0);

  await page
    .getByTestId("synthesis-thread-item")
    .filter({ hasText: state.comparison.title })
    .click();
  await expect(page.getByTestId("synthesis-evidence-proposal")).toHaveCount(0);

  const readsBeforeReturn = state.targetEvidenceReads();
  await page
    .getByTestId("synthesis-thread-item")
    .filter({ hasText: state.target.title })
    .click();

  await expect.poll(state.targetEvidenceReads).toBeGreaterThan(readsBeforeReturn);
  await expect(page.getByTestId("synthesis-evidence-proposal")).toContainText(
    "Indonesia daily cross-section",
  );
  await expect(page.getByTestId("synthesis-evidence-state")).toContainText("No inputs mapped");
  expect(state.evidenceWrites()).toBe(0);
});
