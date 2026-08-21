import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const renderDir = "artifacts/synthesis-renders";

const EVIDENCE_MAP_NODE = {
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

const EXPLORING_THREAD = {
  id: "thread-attention",
  session_id: "synthesis-session-attention",
  created_at: "2026-07-19T08:00:00+00:00",
  updated_at: "2026-07-19T08:00:00+00:00",
  title: "Historical stablecoin attention",
  objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
  materialisation: "not_materialised",
  state: {
    title: "Historical stablecoin attention",
    objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
    required_grain: "asset × week",
    maturity: "exploring",
    maturityLabel: "Evidence mapping",
    lastActivity: "Use GDELT as a validation signal.",
    materialisation: "not_materialised",
    nodes: [
      { id: "target", type: "target", layer: "target", label: "Historical stablecoin attention", interpretation: "A longitudinal public-attention signal.", grain: "asset-week", coverage: "2021–2026" },
      { id: "trends", type: "construct", layer: "evidence", label: "Search intent", role: "Core signal", status: "held", grain: "asset-week", coverage: "2021–2026" },
      { id: "reddit", type: "construct", layer: "evidence", label: "Community activity", role: "Core signal", status: "held", grain: "asset-week", coverage: "2021–2026" },
      { id: "gdelt", type: "source", layer: "evidence", label: "GDELT news", role: "Validation", status: "queryable", grain: "event-day", coverage: "2018–present" },
    ],
    edges: [],
    proposal: null,
    execution_spec: null,
    execution: null,
  },
};

const PROPOSAL_THREAD = {
  id: "thread-proposal",
  created_at: "2026-07-19T08:01:00+00:00",
  updated_at: "2026-07-19T08:01:00+00:00",
  title: "Weekly trust panel",
  objective: "Aggregate held stablecoin evidence at weekly grain.",
  materialisation: "not_materialised",
  state: {
    title: "Weekly trust panel",
    objective: "Aggregate held stablecoin evidence at weekly grain.",
    required_grain: "asset × week",
    maturity: "review",
    maturityLabel: "Method review",
    lastActivity: "A bounded weekly aggregate was proposed.",
    nodes: [
      {
        id: "stablecoin_trust_engagement_weekly",
        type: "source",
        layer: "evidence",
        label: "Stablecoin trust and engagement",
        role: "Held input",
        status: "held",
        grain: "asset-week",
        coverage: "2021–2026",
      },
    ],
    edges: [],
    proposal: {
      id: "proposal-weekly-v1",
      proposal_hash: "sha256:proposal-weekly-v1",
      title: "Aggregate held weekly panel",
      summary: "Aggregate the held evidence by week and preserve the input identity.",
      execution_preflight: { ok: true },
      operations: [
        { op: "add_node" },
        { op: "update_spec", summary: "Use weekly aggregation and bounded metrics." },
      ],
      execution_spec: {
        input_dataset_id: "stablecoin_trust_engagement_weekly",
        output_dataset_id: "stablecoin_attention_weekly",
        group_by: ["asset_id", "week"],
        metrics: [{ field: "attention", aggregate: "mean" }],
      },
    },
    limitations: [
      "Search interest is a proxy for attention, not directly observed investor belief.",
      "Weekly aggregation can hide short-lived event reactions.",
    ],
  },
};

const REGISTERED_THREAD = {
  id: "thread-registered",
  created_at: "2026-07-19T08:02:00+00:00",
  updated_at: "2026-07-19T08:02:00+00:00",
  title: "Stablecoin attention weekly panel",
  objective: "Construct a reusable weekly public-attention panel.",
  materialisation: "registered",
  state: {
    title: "Stablecoin attention weekly panel",
    objective: "Construct a reusable weekly public-attention panel.",
    required_grain: "asset × week",
    maturity: "registered",
    maturityLabel: "Registered output",
    lastActivity: "Registered synthesis output is available in Library.",
    nodes: [],
    edges: [],
    proposal: null,
    execution_spec: {
      input_dataset_id: "stablecoin_trust_engagement_weekly",
      output_dataset_id: "stablecoin_attention_weekly",
      group_by: ["asset_id", "week"],
      metrics: [{ field: "attention", aggregate: "mean" }],
    },
    execution: {
      status: "registered",
      job_id: "job-synthesis-42",
      output_dataset_id: "stablecoin_attention_weekly",
      rows: 13827,
      drive_verified: true,
      manifest_id: "mft_s04_0726",
    },
  },
};

const QUERY_READY_THREAD = {
  ...structuredClone(REGISTERED_THREAD),
  id: "thread-query-ready",
  title: "Query-ready stablecoin attention panel",
  materialisation: "query_ready",
  state: {
    ...structuredClone(REGISTERED_THREAD.state),
    title: "Query-ready stablecoin attention panel",
    maturity: "query_ready",
    maturityLabel: "Query-ready output",
    lastActivity: "Registered output passed query-engine readiness checks.",
    execution: {
      ...structuredClone(REGISTERED_THREAD.state.execution),
      status: "query_ready",
      job_id: "job-synthesis-43",
      output_dataset_id: "stablecoin_attention_query_ready",
    },
  },
};

async function capture(page, name) {
  mkdirSync(renderDir, { recursive: true });
  await page.screenshot({ path: `${renderDir}/${name}.png`, fullPage: true });
}

async function installSynthesisThreadMock(page) {
  const threads = new Map(
    [EXPLORING_THREAD, PROPOSAL_THREAD, REGISTERED_THREAD, QUERY_READY_THREAD].map((thread) => [thread.id, structuredClone(thread)]),
  );

  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const threadIndex = parts.lastIndexOf("threads");
    const threadId = parts[threadIndex + 1] || "";
    const suffix = parts.slice(threadIndex + 2).join("/");
    const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (!threadId && method === "GET") return respond({ threads: [...threads.values()], total: threads.size });
    if (!threadId && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      const id = `thread-${threads.size + 1}`;
      const thread = {
        id,
        created_at: "2026-07-19T09:00:00+00:00",
        updated_at: "2026-07-19T09:00:00+00:00",
        title: body.title || body.objective,
        objective: body.objective,
        materialisation: "not_materialised",
        state: { title: body.title || body.objective, objective: body.objective, required_grain: body.required_grain || "", maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.", nodes: [], edges: [], proposal: null },
      };
      threads.set(id, thread);
      return respond(thread);
    }

    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);
    if (suffix === "evidence-map" && method === "GET") {
      const mappedIds = new Set((thread.state.nodes || []).map((node) => node.dataset_id || node.id));
      return respond({
        thread_id: thread.id,
        objective: thread.objective,
        nodes: mappedIds.has(EVIDENCE_MAP_NODE.dataset_id) ? [] : [structuredClone(EVIDENCE_MAP_NODE)],
        reason: mappedIds.has(EVIDENCE_MAP_NODE.dataset_id) ? "all held matches are already mapped to this construction" : "",
        review_required: true,
        writes: false,
      });
    }
    if (suffix === "evidence-map" && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      const ids = Array.isArray(body.dataset_ids) ? body.dataset_ids : [];
      if (!ids.includes(EVIDENCE_MAP_NODE.dataset_id)) {
        return respond({ error: "Only inputs in the current held-evidence proposal can be added to this map." }, 400);
      }
      const exists = (thread.state.nodes || []).some((node) => (node.dataset_id || node.id) === EVIDENCE_MAP_NODE.dataset_id);
      if (!exists) thread.state.nodes = [...(thread.state.nodes || []), structuredClone(EVIDENCE_MAP_NODE)];
      thread.state.maturity = "exploring";
      thread.state.maturityLabel = "Evidence mapping";
      thread.state.lastActivity = "Added 1 reviewed held input to the evidence map.";
      thread.updated_at = "2026-07-19T09:00:30+00:00";
      return respond({ thread, added: exists ? [] : [structuredClone(EVIDENCE_MAP_NODE)] });
    }
    if (suffix === "patches" && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      const proposal = thread.state.proposal;
      if (!proposal || body.proposal_id !== proposal.id || body.proposal_hash !== proposal.proposal_hash) {
        return respond({ error: "Synthesis proposal changed; refresh before accepting" }, 409);
      }
      if (body.decision === "accept") {
        thread.state.execution_spec = proposal.execution_spec;
        thread.state.proposal = null;
        thread.state.maturity = "planned";
        thread.state.maturityLabel = "Accepted method";
        thread.state.lastActivity = "Accepted proposal: Aggregate held weekly panel.";
      } else {
        thread.state.proposal = null;
        thread.state.lastActivity = "Proposal rejected.";
      }
      thread.updated_at = "2026-07-19T09:01:00+00:00";
      return respond(thread);
    }
    if (suffix === "conversation" && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      thread.session_id = body.session_id || "";
      return respond(thread);
    }
    if (suffix === "execute" && method === "POST") {
      thread.state.execution = {
        status: "pending_approval",
        job_id: "job-synthesis-pending",
        output_dataset_id: thread.state.execution_spec?.output_dataset_id || "",
      };
      thread.state.lastActivity = "Execution request is awaiting approval.";
      thread.updated_at = "2026-07-19T09:02:00+00:00";
      return respond({ job: { id: "job-synthesis-pending", status: "pending_approval" }, thread });
    }
    if (suffix === "materialisation" && method === "GET") {
      const execution = thread.state.execution || {};
      return respond({ thread_id: thread.id, materialisation: thread.materialisation, output_registered: execution.status === "registered", output_dataset_id: execution.output_dataset_id || "" });
    }
    return respond({ error: "unsupported mock route" }, 400);
  });

  await page.route("**/api/library/chat/synthesis-session-attention", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session_id: "synthesis-session-attention",
        messages: [
          {
            role: "user",
            content: "[context: Historical stablecoin attention] Keep the primary horizon weekly.\n\nSynthesis thread: Historical stablecoin attention\nObjective: Construct a historical attention panel.\nDurable status: Evidence mapping.",
            artifacts: {},
          },
          {
            role: "assistant",
            content: "The weekly horizon is attached to this project; daily evidence still requires an explicit aggregation rule.",
            artifacts: { action: "synthesis_reasoning" },
          },
        ],
      }),
    }),
  );
}

test.describe("v2 Synthesis durable thread surface", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await installSynthesisThreadMock(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("renders the selected durable thread in the workspace and Detail rail", async ({ page }) => {
    await expect(page.getByTestId("synthesis-evidence-state")).toContainText("Historical stablecoin attention");
    await expect(page.getByTestId("synthesis-evidence-state")).toContainText("Search intent");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Historical stablecoin attention");
    // S-04's rail leads with the thread's interpretation and unresolved
    // questions; it no longer claims a fabricated aggregate input count.
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Your intent");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Quick questions");
    await expect(page.getByTestId("rail-pane-ask")).toBeHidden();
    await expect(page.getByText("Nothing registered", { exact: true })).toBeVisible();
    await capture(page, "01-durable-evidence-desktop");
  });

  test("researcher reviews held evidence before it becomes a durable map input", async ({ page }) => {
    await page.route("**/api/library/chat/test-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ messages: [] }),
      }),
    );
    await page.getByRole("button", { name: "+ New synthesis" }).click();
    const objective = page.getByPlaceholder(/Build a weekly measure/i);
    await objective.fill("Test whether Indonesian microstructure predicts later analyst revisions.");
    await page.getByRole("button", { name: "Start project in Ask" }).click();

    const evidence = page.getByTestId("synthesis-evidence-state");
    const next = page.getByLabel("What happens next");
    const findHeldEvidence = next.getByRole("button", { name: "Find held evidence" });
    await expect(findHeldEvidence).toBeVisible();
    const findBox = await findHeldEvidence.boundingBox();
    expect(findBox?.y || Infinity).toBeLessThan(900);
    await findHeldEvidence.click();

    const proposal = page.getByTestId("synthesis-evidence-proposal");
    await expect(proposal).toContainText("Indonesia daily cross-section");
    await expect(proposal).toContainText("Not mapped yet");
    // The result is below the opening fold. An explicit search should reveal
    // its review result rather than leaving the successful request invisible.
    await expect(proposal).toBeInViewport();
    await expect(evidence).toContainText("No inputs mapped");
    await capture(page, "02b-held-evidence-review-desktop");

    await proposal.getByRole("button", { name: "Add 1 reviewed input" }).click();
    await expect(evidence).toContainText("1 mapped inputs");
    await expect(evidence).toContainText("Indonesia daily cross-section");
    await expect(page.getByTestId("synthesis-evidence-proposal")).toHaveCount(0);
    await capture(page, "02c-held-evidence-mapped-desktop");
  });

  test("accepts a revision-bound proposal, then requests but does not fabricate execution", async ({ page }) => {
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Weekly trust panel" }).click();
    const proposal = page.getByTestId("synthesis-proposal-state");
    await expect(proposal).toContainText("Aggregate held weekly panel");
    await expect(proposal).toContainText("Held input");
    await expect(proposal).toContainText("Proposed output");
    await expect(proposal).toContainText("Nothing is materialised yet");
    await expect(proposal).toContainText("Still not established");
    await expect(proposal).toContainText("Add evidence or a derived construct");
    await capture(page, "02-proposal-review-desktop");
    await page.getByRole("button", { name: "Accept proposal" }).click();
    await expect(page.getByTestId("synthesis-execution-state")).toContainText("stablecoin_attention_weekly");
    await page.getByRole("button", { name: "Request execution" }).click();
    const pending = page.getByTestId("synthesis-execution-state");
    await expect(pending).toContainText("pending approval");
    await expect(pending.getByRole("button", { name: "Review approval" })).toBeVisible();
    await expect(pending.getByRole("button", { name: "Request execution" })).toHaveCount(0);
    await expect(pending).toContainText("Researcher approval");
    await expect(pending).toContainText("Archive + registry");
    await expect(pending.getByText("Query ready", { exact: true })).toHaveCount(0);
    await capture(page, "03-execution-request-desktop");
    await pending.getByRole("button", { name: "Review approval" }).click();
    await expect(page).toHaveURL(/tab=discover/);
    await expect(page).toHaveURL(/mode=history/);
  });

  test("does not create a second execution job when a prior request's response was lost", async ({ page }) => {
    // Simulate: a first "Request execution" click reached the server and
    // created a job, but the response never reached this client (dropped
    // connection, backgrounded tab). The button is still showing "Request
    // execution" from stale local state. Clicking it again must not create a
    // duplicate job — it must discover the durable state and self-correct.
    let executeCalls = 0;
    await page.route("**/api/library/synthesis/threads/thread-proposal/execute", async (route) => {
      executeCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ job: { id: "job-should-not-exist", status: "pending_approval" } }),
      });
    });
    const baseState = {
      title: "Weekly trust panel",
      objective: "Aggregate held stablecoin evidence at weekly grain.",
      required_grain: "asset × week",
      maturity: "planned",
      maturityLabel: "Accepted method",
      lastActivity: "Accepted proposal: Aggregate held weekly panel.",
      nodes: [],
      edges: [],
      proposal: null,
      execution_spec: {
        input_dataset_id: "stablecoin_trust_engagement_weekly",
        output_dataset_id: "stablecoin_attention_weekly",
        group_by: ["asset_id", "week"],
        metrics: [{ field: "attention", aggregate: "mean" }],
      },
    };
    let getCalls = 0;
    await page.route("**/api/library/synthesis/threads/thread-proposal", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      getCalls += 1;
      // First load shows no execution yet, so "Request execution" renders.
      // From the second GET onward (the idempotency guard's own pre-flight
      // refetch, triggered by the click below) the durable job already
      // exists — simulating that the first attempt's response was lost
      // even though the server had already created it.
      const state =
        getCalls === 1
          ? baseState
          : {
              ...baseState,
              execution: {
                status: "pending_approval",
                job_id: "job-already-created",
                output_dataset_id: "stablecoin_attention_weekly",
              },
            };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "thread-proposal",
          title: "Weekly trust panel",
          objective: "Aggregate held stablecoin evidence at weekly grain.",
          materialisation: "not_materialised",
          state,
        }),
      });
    });

    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Weekly trust panel" }).click();
    const execution = page.getByTestId("synthesis-execution-state");
    await expect(execution).toContainText("stablecoin_attention_weekly");
    await expect(execution.getByRole("button", { name: "Request execution" })).toBeVisible();

    await execution.getByRole("button", { name: "Request execution" }).click();

    await expect(execution.getByRole("button", { name: "Review approval" })).toBeVisible();
    await expect(execution.getByRole("button", { name: "Request execution" })).toHaveCount(0);
    expect(executeCalls).toBe(0);
    expect(getCalls).toBeGreaterThanOrEqual(2);
  });

  test("rail Evidence field does not contradict an accepted execution record with empty evidence nodes", async ({ page }) => {
    // A thread can reach "accepted method, awaiting execution" with its
    // evidence graph nodes still empty (the accept step sets execution_spec
    // without ever populating state.nodes) — the same gap a freshly created
    // thread sits in. The rail must not say "No inputs mapped" beside an
    // execution record that names a specific accepted input.
    await page.route("**/api/library/synthesis/threads/thread-proposal", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "thread-proposal",
          title: "Weekly trust panel",
          objective: "Aggregate held stablecoin evidence at weekly grain.",
          materialisation: "not_materialised",
          state: {
            title: "Weekly trust panel",
            objective: "Aggregate held stablecoin evidence at weekly grain.",
            required_grain: "asset × week",
            maturity: "planned",
            maturityLabel: "Accepted method",
            lastActivity: "Accepted proposal: Aggregate held weekly panel.",
            nodes: [],
            edges: [],
            proposal: null,
            execution_spec: {
              input_dataset_id: "stablecoin_trust_engagement_weekly",
              output_dataset_id: "stablecoin_attention_weekly",
              group_by: ["asset_id", "week"],
              metrics: [{ field: "attention", aggregate: "mean" }],
            },
          },
        }),
      });
    });
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Weekly trust panel" }).click();
    await expect(page.getByTestId("synthesis-execution-state")).toContainText("stablecoin_attention_weekly");
    // An accepted method with empty evidence nodes falls into the same gap a
    // brand-new thread sits in — the execution record must be the only card
    // shown, never stacked with the draft/interpreting canvas underneath it.
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("Declared input · accepted: stablecoin_trust_engagement_weekly");
    await expect(rail).not.toContainText("No inputs mapped");
    await capture(page, "09-rail-evidence-fixed-desktop");
  });

  test("renders registered output only from thread registration evidence", async ({ page }) => {
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Stablecoin attention weekly panel" }).click();
    const registered = page.getByTestId("synthesis-registered-state");
    await expect(registered).toContainText("13,827");
    await expect(registered).toContainText("mft_s04_0726");
    await expect(registered).toContainText("Reported verified");
    await expect(registered.getByText("Registered", { exact: true })).toBeVisible();
    await expect(registered.getByText("Query ready", { exact: true })).toHaveCount(0);
    await expect(registered.getByRole("button", { name: "Open in Library" })).toBeVisible();
    await expect(registered).toContainText("Library handoff");
    await expect(registered).toContainText("Registered");
    await capture(page, "04-registered-desktop");
  });

  test("renders query-ready only from an explicit query-ready lifecycle", async ({ page }) => {
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Query-ready stablecoin attention panel" }).click();
    const ready = page.getByTestId("synthesis-query-ready-state");
    await expect(ready.getByText("Query ready", { exact: true })).toBeVisible();
    await expect(ready).toContainText("Query-ready output reported");
    await expect(ready.getByRole("button", { name: "Open in Library" })).toBeVisible();
  });

  test("sends the selected durable thread to the shared Ask rail", async ({ page }) => {
    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("Ask · synthesis thread");
    await expect(rail).toContainText("Keep the primary horizon weekly.");
    await expect(rail).not.toContainText("[context:");
    await expect(rail).not.toContainText("Durable status:");
    await expect(rail).toContainText("Provisionally, Historical stablecoin attention");
    await expect(rail).toContainText("construct validity and time alignment");
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("rail-pane-detail")).toBeHidden();
    await expect(rail.getByTestId("ask-composer")).toHaveAttribute(
      "placeholder",
      "Correct the interpretation, add a constraint, or ask…",
    );
    await capture(page, "05-shared-ask-desktop");
  });

  test("starts reviewable method reasoning from an empty construction", async ({ page }) => {
    const updated = structuredClone(EXPLORING_THREAD);
    updated.updated_at = "2026-07-19T09:03:00+00:00";
    updated.state.maturity = "review";
    updated.state.maturityLabel = "Method review";
    updated.state.proposal = structuredClone(PROPOSAL_THREAD.state.proposal);

    await page.route("**/api/library/synthesis/threads/thread-attention", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      }),
    );
    let prompt = "";
    const proposalReply = (route) => {
      prompt = String(route.request().postDataJSON?.()?.message || "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "synthesis-session-attention",
          reply: "A review proposal was recorded. Nothing was executed.",
          artifacts: {
            action: "synthesis_proposal_recorded_response_error",
            proposal_recorded: true,
            synthesis_thread_id: "thread-attention",
            synthesis_proposal: updated.state.proposal,
          },
        }),
      });
    };
    await page.route("**/api/library/chat/stream", proposalReply);
    await page.route("**/api/library/chat", proposalReply);

    await page.getByRole("button", { name: "Start method reasoning" }).click();

    await expect.poll(() => prompt).toContain("create one reviewable Synthesis proposal");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · synthesis thread");
    await expect(page.getByTestId("synthesis-proposal-state")).toContainText(
      "Aggregate held weekly panel",
    );
    await expect(page.getByTestId("ask-agent-card").last()).toContainText(
      "Nothing was executed",
    );
  });

  test("refreshes the canvas in the same Ask turn that records a proposal", async ({ page }) => {
    const updated = structuredClone(EXPLORING_THREAD);
    updated.updated_at = "2026-07-19T09:03:00+00:00";
    updated.state.maturity = "review";
    updated.state.maturityLabel = "Method review";
    updated.state.proposal = structuredClone(PROPOSAL_THREAD.state.proposal);

    await page.route("**/api/library/synthesis/threads/thread-attention", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      }),
    );
    const proposalReply = (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "synthesis-session-attention",
          reply: "A review proposal was recorded. Nothing was executed.",
          artifacts: {
            action: "synthesis_proposal_recorded_response_error",
            proposal_recorded: true,
            synthesis_thread_id: "thread-attention",
            synthesis_proposal: updated.state.proposal,
          },
        }),
      });
    await page.route("**/api/library/chat/stream", proposalReply);
    await page.route("**/api/library/chat", proposalReply);

    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();
    await page.getByTestId("ask-composer").fill("Persist the review proposal.");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(page.getByTestId("synthesis-proposal-state")).toContainText(
      "Aggregate held weekly panel",
    );
    await expect(page.getByTestId("ask-agent-card").last()).toContainText(
      "Nothing was executed",
    );
  });

  test("creates a durable thread before handing the objective to Ask", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    await expect(page.locator(".s04-intent-contract")).toHaveCount(0);
    await expect(page.getByText("No method exists yet.")).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Synthesis studio");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Historical stablecoin attention");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Keep the primary horizon weekly.");
    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(250);
    await capture(page, "06-new-project-entry-desktop");
    const objective = "Construct a weekly issuer attention panel for Taiwan filings.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(objective);
    await page.getByRole("button", { name: "Start project in Ask" }).click();
    await expect(page.getByText(objective, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly issuer attention panel for Taiwan filings" })).toBeVisible();
    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();
    await expect(page.getByRole("button", { name: "Method reasoning in Ask" })).toBeDisabled();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · synthesis thread");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Interpret this research objective");
    await expect(page.locator("aside.rd-v2-rail")).toContainText(
      "Provisionally, Weekly issuer attention panel for Taiwan filings",
    );
    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(250);
    await capture(page, "07-new-project-ask-desktop");
  });

  test("the draft canvas yields to evidence mapping once the agent's turn lands, without a manual reload", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    const objective = "Construct a weekly issuer attention panel for Taiwan filings.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(objective);

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/library/synthesis/threads") && res.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Start project in Ask" }).click(),
    ]);
    const created = await createResponse.json();
    const threadId = created.id;

    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();

    // Simulate the agent's server-side turn landing: the next poll of this
    // thread now returns mapped evidence.
    await page.route(`**/api/library/synthesis/threads/${threadId}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: threadId,
          title: objective,
          objective,
          state: {
            title: objective,
            objective,
            nodes: [
              { id: "trends", type: "construct", layer: "evidence", label: "Search intent", role: "Core signal", status: "held" },
            ],
            edges: [],
            proposal: null,
          },
        }),
      });
    });

    await expect(page.getByTestId("synthesis-evidence-state")).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);
  });

  test("stops polling silently and admits it when the agent's turn never lands, then recovers on retry", async ({ page }) => {
    await page.clock.install();

    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill("Unresolved objective for stall coverage.");
    await page.getByRole("button", { name: "Start project in Ask" }).click();

    const card = page.getByTestId("synthesis-draft-state");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
    await expect(card).toContainText("Interpretation in progress");

    // Nothing overrides this thread's GET route, so it keeps returning the
    // same unresolved state on every poll — a genuine stall.
    await page.clock.fastForward(65000);

    await expect(card).toContainText("Taking longer than expected");
    await expect(card).toContainText("The agent hasn't responded yet");
    const retry = card.getByTestId("synthesis-draft-retry");
    await expect(retry).toBeVisible();

    await retry.click();
    await expect(card).toContainText("Interpretation in progress");
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
  });

  test("a stalled thread does not make the next new thread look stalled", async ({ page }) => {
    await page.clock.install();

    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill("First unresolved objective.");
    await page.getByRole("button", { name: "Start project in Ask" }).click();
    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();
    await page.clock.fastForward(65000);
    await expect(page.getByTestId("synthesis-draft-state")).toContainText("Taking longer than expected");

    await page.getByRole("button", { name: "+ New" }).click();
    const secondObjective = "Second unresolved objective.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(secondObjective);
    await page.getByRole("button", { name: "Start project in Ask" }).click();

    const card = page.getByTestId("synthesis-draft-state");
    await expect(card).toContainText("Interpretation in progress");
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
  });

  test("routes a backend-declared evidence gap to Discover, then returns to the exact thread with evidence intact", async ({ page }) => {
    const modifiedExploring = {
      ...EXPLORING_THREAD,
      state: {
        ...EXPLORING_THREAD.state,
        nodes: [
          ...EXPLORING_THREAD.state.nodes,
          {
            id: "filings",
            type: "source",
            layer: "evidence",
            label: "Regulatory filings",
            role: "Direct measure gap",
            status: "missing",
            grain: "issuer-quarter",
            coverage: "Not held",
          },
        ],
      },
    };
    await page.route("**/api/library/synthesis/threads**", async (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/").filter(Boolean);
      const threadIndex = parts.lastIndexOf("threads");
      const threadId = parts[threadIndex + 1] || "";
      const suffix = parts.slice(threadIndex + 2).join("/");
      const method = route.request().method();
      if (!threadId && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ threads: [modifiedExploring, PROPOSAL_THREAD, REGISTERED_THREAD, QUERY_READY_THREAD], total: 4 }),
        });
      }
      if (threadId === "thread-attention" && !suffix && method === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modifiedExploring) });
      }
      if (threadId === "thread-attention" && suffix === "discover-handoff" && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            thread_id: "thread-attention",
            objective: EXPLORING_THREAD.objective,
            required_grain: "asset × week",
            held_evidence: [],
            missing_evidence: [{ id: "filings", label: "Regulatory filings", source_identity: "regulatory filings" }],
            collect_intents: [],
            fake_collection: false,
          }),
        });
      }
      return route.fallback();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await page.getByRole("button", { name: /Regulatory filings/ }).click();
    await expect(page.getByTestId("synthesis-selected-field")).toContainText("Regulatory filings");
    await capture(page, "10-evidence-selected-desktop");
    await page.getByRole("button", { name: "Route to Discover" }).click();
    await expect(page).toHaveURL(/tab=discover/);
    await expect(page.getByTestId("synthesis-discover-handoff")).toContainText("Regulatory filings");
    await capture(page, "11-discover-handoff-desktop");

    await page.getByRole("button", { name: "Return to Synthesis" }).click();
    await expect(page).toHaveURL(/tab=synthesis/);
    await expect(page.getByTestId("synthesis-evidence-state")).toContainText("Historical stablecoin attention");
    await expect(page.getByTestId("synthesis-evidence-state")).toContainText("4 mapped inputs");
    await capture(page, "12-returned-to-synthesis-desktop");
  });

  test("keeps a node whose status looks like a gap from routing unless the backend handoff names it", async ({ page }) => {
    // "needs_access" is exactly the kind of string a local regex used to
    // treat as a gap on its own. The durable handoff explicitly does NOT
    // name this node, so it must not be routable no matter what its own
    // status text says — proves the backend, not the frontend, decides.
    const modifiedExploring = {
      ...EXPLORING_THREAD,
      state: {
        ...EXPLORING_THREAD.state,
        nodes: [
          ...EXPLORING_THREAD.state.nodes,
          {
            id: "restricted_api",
            type: "source",
            layer: "evidence",
            label: "Restricted vendor API",
            role: "Candidate",
            status: "needs_access",
            grain: "event-day",
            coverage: "Unknown",
          },
        ],
      },
    };
    await page.route("**/api/library/synthesis/threads**", async (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/").filter(Boolean);
      const threadIndex = parts.lastIndexOf("threads");
      const threadId = parts[threadIndex + 1] || "";
      const suffix = parts.slice(threadIndex + 2).join("/");
      const method = route.request().method();
      if (!threadId && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ threads: [modifiedExploring, PROPOSAL_THREAD, REGISTERED_THREAD, QUERY_READY_THREAD], total: 4 }),
        });
      }
      if (threadId === "thread-attention" && !suffix && method === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modifiedExploring) });
      }
      if (threadId === "thread-attention" && suffix === "discover-handoff" && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            thread_id: "thread-attention",
            objective: EXPLORING_THREAD.objective,
            required_grain: "asset × week",
            held_evidence: [],
            missing_evidence: [],
            collect_intents: [],
            fake_collection: false,
          }),
        });
      }
      return route.fallback();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await page.getByRole("button", { name: /Restricted vendor API/ }).click();
    await expect(page.getByTestId("synthesis-selected-field")).toContainText("Restricted vendor API");
    await expect(page.getByRole("button", { name: "Route to Discover" })).toHaveCount(0);
  });

  test("keeps the right rail usable on mobile while the workspace remains source-backed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("synthesis-evidence-state")).toBeVisible();
    await expect(page.locator(".rd-v2-sidebar-foot-nav")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    await capture(page, "08-durable-evidence-mobile");
    await page.getByRole("button", { name: /Show Detail.*Ask|Hide panel/ }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toBeVisible();
    await expect.poll(async () => (await rail.boundingBox())?.height || 0).toBeGreaterThan(600);
    await expect(rail.getByTestId("rail-pane-detail")).toBeVisible();
    await expect(rail).toContainText("Your intent");
    await expect(rail).toContainText("Quick questions");
    await capture(page, "09-detail-sheet-mobile");
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.getByTestId("rail-pane-detail")).toBeHidden();
    await expect(rail.getByTestId("ask-composer")).toBeVisible();
    await page.waitForTimeout(250);
    await capture(page, "10-ask-sheet-mobile");
  });

  test("keeps proposal review legible on mobile without flattening the method flow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    // The desktop thread list is intentionally hidden on a narrow screen;
    // select the same durable thread through the mobile picker a researcher
    // can actually use.
    await page.getByRole("combobox", { name: "Choose Synthesis thread" }).selectOption({
      label: "Weekly trust panel",
    });
    const proposal = page.getByTestId("synthesis-proposal-state");
    await expect(proposal).toContainText("Held input");
    await expect(proposal).toContainText("Construction");
    await expect(proposal).toContainText("Proposed output");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    await capture(page, "11-proposal-review-mobile");
  });
});

// The two panels were written, tested in isolation, and imported by nothing — so
// the desk rendered exactly what it did before. These assert they are reachable:
// absent when the thread carries no profile, present the moment it does.
test.describe("v2 Synthesis evidence panels", () => {
  const withFields = (extra) => ({
    id: "thread-fields",
    created_at: "2026-07-19T09:00:00+00:00",
    updated_at: "2026-07-19T09:00:00+00:00",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity",
    materialisation: "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity",
      maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.",
      nodes: [], edges: [], proposal: null,
      spec: { input_dataset_id: "idn_fry_daily_cross_section" },
      ...extra,
    },
  });

  async function mount(page, thread) {
    // These panels exercise only a durable Synthesis payload. Keep the shell
    // deterministic too: without the common desk mocks, a local Vite run
    // silently proxies bootstrap requests to whatever happens to be on :8765.
    await mockV2Api(page);
    await page.route("**/api/library/synthesis/threads**", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(route.request().url().includes("thread-fields")
          ? thread : { threads: [thread], total: 1 }),
      }));
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByTestId("synthesis-thread-item").first().click();
  }

  test("neither panel appears while the thread carries no profile", async ({ page }) => {
    await mount(page, withFields({}));
    await expect(page.getByTestId("synthesis-method-surface")).toHaveCount(0);
    await expect(page.getByTestId("synthesis-join-decision")).toHaveCount(0);
  });

  test("the evidence panel appears and names what was resolved", async ({ page }) => {
    await mount(page, withFields({
      columns_in_use: ["date", "return_1d"],
      column_profiles: [
        { column: "date", kind: "date", rows: 100, blanks: 0, distinct: 90, flags: [] },
        { column: "return_1d", kind: "measurement", rows: 100, blanks: 0, distinct: 90, flags: [] },
        { column: "fwd_5d", kind: "measurement", rows: 100, blanks: 0, distinct: 90, flags: ["lookahead"] },
      ],
    }));
    const panel = page.getByTestId("synthesis-method-surface");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("2 of 3 columns in use");
    await expect(panel).toContainText("they tell you the future");
  });

  test("the join panel shows both sides of the intersection, not one bar", async ({ page }) => {
    await mount(page, withFields({
      join_candidate_dataset_id: "refinitiv_entity_market_spine_expanded",
      join_candidate_rows: 570,
      join_candidates: [
        { left_key: "yahoo_symbol", right_key: "yahoo_symbol", matched: 50, left_distinct: 635,
          match_rate_pct: 7.874, right_duplicate_rows: 0, usable: true, reason: null },
        { left_key: "yahoo_symbol", right_key: "isin", matched: 0, left_distinct: 635,
          match_rate_pct: 0, right_duplicate_rows: 0, usable: false,
          reason: "the column is empty on the right side" },
      ],
    }));
    const panel = page.getByTestId("synthesis-join-decision");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("synthesis-join-intersection")).toBeVisible();
    await expect(panel).toContainText("520 on the right match nothing here");
    await expect(panel).toContainText("a different population");
    await expect(panel).toContainText("the column is empty on the right side");
  });
});

// The remaining four panels, same contract: absent without their field, present
// with it. Every payload here is the shape the desk will have to produce.
test.describe("v2 Synthesis decision and record panels", () => {
  const thread = (extra) => ({
    id: "thread-panels",
    created_at: "2026-07-19T09:00:00+00:00",
    updated_at: "2026-07-19T09:00:00+00:00",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity",
    materialisation: "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity",
      maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.",
      nodes: [], edges: [], proposal: null, ...extra,
    },
  });

  async function mount(page, payload) {
    await mockV2Api(page);
    await page.route("**/api/library/synthesis/threads**", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(route.request().url().includes("thread-panels")
          ? payload : { threads: [payload], total: 1 }),
      }));
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByTestId("synthesis-thread-item").first().click();
  }

  test("the scope block recommends the smallest cut that clears", async ({ page }) => {
    await mount(page, thread({
      scope_block: {
        rows: 1043042, limit: 1000000,
        options: [
          { id: "2020", from: "2020-01-01", rows: 969392 },
          { id: "2023", from: "2023-01-01", rows: 506163 },
        ],
      },
    }));
    const panel = page.getByTestId("synthesis-scope-block");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("1,043,042 rows");
    await expect(panel).toContainText("least evidence discarded");
    await expect(panel).toContainText("−7.1%");
  });

  test("a block no cut can clear says the join shape is wrong instead of offering slices", async ({ page }) => {
    await mount(page, thread({
      scope_block: {
        rows: 206432820, limit: 1000000,
        options: [{ id: "2020", from: "2020-01-01", rows: 191899616 }],
      },
    }));
    await expect(page.getByTestId("synthesis-scope-block")).toContainText("join shape is the problem");
  });

  test("the unit conflict shows both answers, not the recommended one alone", async ({ page }) => {
    await mount(page, thread({
      unit_conflict: {
        left: { column: "return_1d", typical: 0.0006 },
        right: { column: "rf", typical: 0.012 },
        outcomes: [
          { id: "rescale", label: "rescale rf ÷100", result: -0.0002, recommended: true },
          { id: "asis", label: "leave them as they are", result: -0.02 },
        ],
      },
    }));
    const panel = page.getByTestId("synthesis-unit-conflict");
    await expect(panel).toContainText("20× apart");
    await expect(panel).toContainText("-0.0002");
    await expect(panel).toContainText("-0.02");
    await expect(panel).toContainText("differ by 100×");
  });

  test("settled decisions separate what the data established from what the desk chose", async ({ page }) => {
    await mount(page, thread({
      settled_decisions: [
        { id: "grain", authority: "observed", summary: "target grain asset × week" },
        { id: "asof", authority: "desk", summary: "as-of backward 5D", evidence: "100.0% matched" },
      ],
    }));
    const panel = page.getByTestId("synthesis-settled-decisions");
    await expect(panel).toContainText("2 decisions · 1 you can reopen");
    await expect(panel.getByRole("button", { name: "contest this" })).toHaveCount(1);
  });

  test("an excursion that found nothing is still recorded", async ({ page }) => {
    await mount(page, thread({
      excursions: [
        { id: "e1", at: "2026-08-18", searched: "regulatory filings", found: 1,
          verdict: "grain incompatible" },
      ],
    }));
    const panel = page.getByTestId("synthesis-excursion-record");
    await expect(panel).toContainText("1 searched · 1 still open");
    await expect(panel).toContainText("grain incompatible");
  });

  test("provenance shows the method as something a reviewer could re-run", async ({ page }) => {
    await mount(page, thread({
      provenance: {
        method_hash: "sha256:dd997b185c521d70e38557b", built_at: "2026-08-18 19:43 UTC",
        job_id: "job-synthesis-42", archive_verified: true,
        inputs: [{ dataset_id: "idn_fry_daily_cross_section", fingerprint: "aa312a7412", files: 1, bytes: 35388 }],
        code_excerpt: "frame = pd.merge_asof(frame, ff, on='date', direction='backward')",
      },
    }));
    const panel = page.getByTestId("synthesis-provenance");
    await expect(panel).toContainText("sha256:dd997b18…");
    await expect(panel).toContainText("archive verified");
    await expect(page.getByTestId("synthesis-provenance-code")).toContainText("merge_asof");
  });

  test("reuse carries the settled decisions and only asks about the difference", async ({ page }) => {
    await mount(page, thread({
      reuse_from: {
        method_hash: "sha256:dd997b185c521d70", output_dataset_id: "idn_weekly_factor_exposure",
        decisions: [
          { id: "grain", authority: "observed", summary: "asset × week" },
          { id: "asof", authority: "desk", summary: "as-of backward 5D" },
        ],
      },
      reuse_changes: [
        { id: "metrics", label: "metrics", before: "5 defined", after: "7 defined" },
        { id: "scope", label: "scope", before: "2020-01-01", after: "2020-01-01" },
      ],
    }));
    const panel = page.getByTestId("synthesis-reuse");
    await expect(panel).toContainText("revision, not an overwrite");
    await expect(panel).toContainText("5 defined → 7 defined");
    await expect(panel).toContainText("unchanged · 2020-01-01");
  });

  test("none of the six appear on a thread that carries none of their fields", async ({ page }) => {
    await mount(page, thread({}));
    for (const id of ["synthesis-scope-block", "synthesis-unit-conflict",
                      "synthesis-settled-decisions", "synthesis-excursion-record",
                      "synthesis-provenance", "synthesis-reuse"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });
});
