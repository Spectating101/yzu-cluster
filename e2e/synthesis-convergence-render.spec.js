import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const renderDir = "artifacts/synthesis-convergence";

const THREAD = {
  id: "thread-attention",
  session_id: "synthesis-session-attention",
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  title: "Historical stablecoin attention",
  objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
  materialisation: "not_materialised",
  state: {
    title: "Historical stablecoin attention",
    objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
    required_grain: "asset × week",
    maturity: "exploring",
    maturityLabel: "Evidence mapping",
    lastActivity: "Review the mapped evidence before method reasoning.",
    nodes: [
      { id: "target", type: "target", layer: "target", label: "Historical stablecoin attention", interpretation: "A longitudinal public-attention signal.", grain: "asset-week", coverage: "2021–2026" },
      { id: "trends", dataset_id: "trends", type: "construct", layer: "evidence", label: "Search intent", role: "Core signal", status: "held", grain: "asset-week", coverage: "2021–2026" },
      { id: "reddit", dataset_id: "reddit", type: "construct", layer: "evidence", label: "Community activity", role: "Core signal", status: "held", grain: "asset-week", coverage: "2021–2026" },
      { id: "gdelt", dataset_id: "gdelt", type: "source", layer: "evidence", label: "GDELT news", role: "Validation", status: "queryable", grain: "event-day", coverage: "2018–present" },
    ],
    edges: [],
    proposal: null,
    execution_spec: null,
    execution: null,
  },
};

const REVIEW_THREAD = {
  id: "thread-trust",
  created_at: "2026-08-24T04:00:00Z",
  updated_at: "2026-08-25T02:00:00Z",
  title: "Stablecoin trust deterioration",
  objective: "Separate security incidents, liquidity stress, and attention into one reviewable trust-deterioration panel.",
  materialisation: "not_materialised",
  state: {
    title: "Stablecoin trust deterioration",
    objective: "Separate security incidents, liquidity stress, and attention into one reviewable trust-deterioration panel.",
    required_grain: "asset × week",
    maturity: "exploring",
    maturityLabel: "Exploring",
    lastActivity: "A method proposal needs review.",
    nodes: [{ id: "market", dataset_id: "market", type: "source", layer: "evidence", label: "Market stress", status: "held" }],
    proposal: {
      id: "proposal-trust",
      proposal_hash: "sha256:trust",
      title: "Weekly trust deterioration index",
      summary: "Combine held stress and incident evidence at asset-week grain.",
      operations: [{ op: "append_activity", message: "Review trust construction." }],
    },
  },
};

const BUILD_THREAD = {
  id: "thread-flow",
  created_at: "2026-08-23T04:00:00Z",
  updated_at: "2026-08-25T03:00:00Z",
  title: "Exchange flow stress panel",
  objective: "Construct weekly exchange-flow stress features from registered transaction evidence.",
  materialisation: "planned",
  state: {
    title: "Exchange flow stress panel",
    objective: "Construct weekly exchange-flow stress features from registered transaction evidence.",
    required_grain: "exchange × week",
    maturity: "accepted",
    maturityLabel: "Accepted method",
    nodes: [],
    execution_spec: {
      input_dataset_id: "exchange_flows_daily",
      output_dataset_id: "exchange_flow_stress_weekly",
      group_by: ["exchange_id", "week"],
      metrics: [{ function: "mean", column: "net_flow", as: "net_flow_mean" }],
    },
    execution: { status: "running", job_id: "job-flow-7", output_dataset_id: "exchange_flow_stress_weekly" },
  },
};

const RESULT_THREAD = {
  id: "thread-result",
  created_at: "2026-08-20T04:00:00Z",
  updated_at: "2026-08-25T01:00:00Z",
  title: "Issuer liquidity weekly panel",
  objective: "Build an issuer-week liquidity panel from registered market evidence.",
  materialisation: "query_ready",
  state: {
    title: "Issuer liquidity weekly panel",
    objective: "Build an issuer-week liquidity panel from registered market evidence.",
    required_grain: "issuer × week",
    maturity: "registered",
    maturityLabel: "Registered",
    nodes: [],
    execution_spec: {
      input_dataset_id: "issuer_liquidity_daily",
      output_dataset_id: "issuer_liquidity_weekly",
      group_by: ["issuer_id", "week"],
      metrics: [{ function: "mean", column: "spread", as: "spread_mean" }],
    },
    execution: {
      status: "query_ready",
      job_id: "job-liquidity-2",
      output_dataset_id: "issuer_liquidity_weekly",
      rows: 18240,
      manifest_id: "manifest-liquidity",
      drive_verified: true,
    },
  },
};

const RECOMMENDED_THREAD = {
  id: "thread-recommended",
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  title: "Historical stablecoin attention",
  objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
  materialisation: "not_materialised",
  state: {
    title: "Historical stablecoin attention",
    objective: "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
    durable_state: "exploration_ready",
    brief: "A reusable longitudinal measure of observable public attention to individual stablecoins, constructed from held and reachable evidence.",
    required_grain: "asset × week",
    target_period: "2021 onward",
    intended_use: "Reusable input for later empirical studies",
    maturity: "exploring",
    maturityLabel: "Exploring",
    lastActivity: "A reviewable construction is available.",
    nodes: [],
    edges: [],
    proposal: null,
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
        ideal_direct_measure: { label: "Historical X follower growth", unavailable_because: "no verified history" },
        expected_output: { label: "Stablecoin attention weekly panel", grain: "asset-week", period: "2021–2026" },
        ai_resolved: ["source roles", "target grain", "validation role"],
        method_will_resolve: ["component weighting", "missing-component rule"],
      },
      { title: "Event-only attention panel" },
      { title: "Single-source visibility proxy" },
    ],
  },
};

const PROFILES = [
  {
    id: "event-study-panel",
    title: "Event-study panel",
    description: "Reuse a registered event-window construction and review any changes before execution.",
    sources: [{ id: "news", label: "News events" }, { id: "market", label: "Market panel" }],
    join_keys: ["asset_id", "date"],
  },
  {
    id: "weekly-cross-section",
    title: "Weekly cross-section",
    description: "Reuse a weekly issuer-level construction with explicit point-in-time evidence handling.",
    sources: [{ id: "fundamentals", label: "Fundamentals" }],
    join_keys: ["issuer_id", "week"],
  },
];

async function installSynthesisMocks(page, initialThreads = [THREAD, REVIEW_THREAD, BUILD_THREAD, RESULT_THREAD]) {
  const seed = Array.isArray(initialThreads) ? initialThreads : [initialThreads];
  const threads = new Map(seed.map((thread) => [thread.id, structuredClone(thread)]));

  await page.route("**/library/chat/synthesis-session-attention", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ session_id: "synthesis-session-attention", messages: [] }),
  }));

  await page.route("**/library/synthesis/profiles**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ profiles: PROFILES }),
  }));

  await page.route("**/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const threadId = parts[index + 1] || "";
    const suffix = parts.slice(index + 2).join("/");
    const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (!threadId && method === "GET") return respond({ threads: [...threads.values()], total: threads.size });
    if (!threadId && method === "POST") {
      const body = route.request().postDataJSON?.() || {};
      const created = {
        id: "thread-created",
        created_at: "2026-08-25T00:10:00Z",
        updated_at: "2026-08-25T00:10:00Z",
        title: body.title || body.objective || "New construction",
        objective: body.objective || "",
        materialisation: "not_materialised",
        state: {
          title: body.title || body.objective || "New construction",
          objective: body.objective || "",
          required_grain: body.required_grain || "",
          maturity: "exploring",
          maturityLabel: "Exploring",
          lastActivity: "Thread created.",
          nodes: [], edges: [], proposal: null,
        },
      };
      threads.set(created.id, created);
      return respond(created);
    }

    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);
    if (suffix === "measurements" && method === "GET") {
      if (thread.id === RECOMMENDED_THREAD.id || thread.id !== THREAD.id) {
        return respond({
          thread_id: thread.id,
          writes: false,
          measurement_basis: "mapped_evidence",
          input_dataset_ids: [],
          measured_inputs: 0,
          unmeasured: [],
          column_profiles: [],
        });
      }
      return respond({
        thread_id: thread.id,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: ["trends", "reddit", "gdelt"],
        measured_inputs: 2,
        unmeasured: [{ dataset_id: "gdelt", reason: "Queryable validation source; held bytes were not measured." }],
        column_profiles: [
          { dataset_id: "trends", column: "attention", kind: "measurement", rows: 12000, blanks: 0, distinct: 5000, flags: [] },
          { dataset_id: "reddit", column: "posts", kind: "measurement", rows: 12000, blanks: 30, distinct: 2400, flags: ["sparse"] },
        ],
      });
    }
    if (suffix === "discover-handoff" && method === "GET") {
      return respond({ thread_id: thread.id, missing_evidence: [], collect_intents: [] });
    }
    return respond({ error: "unsupported mock route" }, 400);
  });
}

async function capture(page, name) {
  mkdirSync(renderDir, { recursive: true });
  await page.screenshot({ path: `${renderDir}/${name}.png`, fullPage: true });
}

function threadItem(page, title) {
  return page.getByTestId("synthesis-thread-item").filter({ hasText: title }).first();
}

test("captures Synthesis home, thread work, and new-entry navigation", async ({ page }) => {
  await mockV2Api(page);
  await installSynthesisMocks(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const home = page.getByTestId("synthesis-home-state");
  await expect(home).toBeVisible();
  await expect(home).toContainText("Synthesis workspace");
  await expect(home).toContainText("Stablecoin trust deterioration");
  await expect(home).toContainText("Exchange flow stress panel");
  await expect(home).toContainText("Issuer liquidity weekly panel");
  await expect(home).toContainText("Event-study panel");
  await expect(page.getByRole("button", { name: /Synthesis workspace All constructions/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state")).toHaveText("Workspace");
  await capture(page, "00-home-multi-workflow-1440x1000");

  await threadItem(page, "Historical stablecoin attention").click();
  const situation = page.getByTestId("research-situation");
  const openingRail = page.getByTestId("synthesis-opening-rail");
  await expect(situation).toContainText("Method");
  await expect(situation).toContainText("Historical stablecoin attention");
  await expect(situation).toContainText("3 mapped evidence");
  await expect(situation).toContainText("2 measured");
  await expect(openingRail).toContainText("Evidence measured");
  await expect(openingRail).toContainText("Review measured evidence");
  await expect(openingRail).toContainText("1 sparse / flagged column");
  await expect(openingRail).toContainText("Request one reviewable construction");
  await expect(openingRail).toContainText("3 mapped");
  await expect(openingRail).toContainText("2 columns");
  await expect(openingRail).toContainText("Not accepted");
  await expect(openingRail).toContainText("Not registered");
  await capture(page, "01-thread-detail-1440x1000");

  await page.getByRole("button", { name: "+ New synthesis" }).click();
  const entry = page.getByTestId("synthesis-intent-state");
  await expect(entry).toBeVisible();
  await expect(entry.getByRole("button", { name: /Back to Synthesis home/ })).toBeVisible();
  await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state")).toHaveText("Draft");
  await expect(page.getByTestId("rail-pane-detail")).toContainText("Draft entry");
  await capture(page, "02-new-entry-1440x1000");

  await page.setViewportSize({ width: 1920, height: 961 });
  await capture(page, "03-new-entry-1920x961");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "04-new-entry-390x844");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await entry.getByRole("button", { name: /Back to Synthesis home/ }).click();
  await expect(home).toBeVisible();
  await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state")).toHaveText("Workspace");
  await capture(page, "05-returned-home-1440x1000");

  await threadItem(page, "Historical stablecoin attention").click();
  await expect(page.getByTestId("research-situation")).toContainText("2 measured");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show research context" }).click();
  const mobileRail = page.locator("aside.rd-v2-rail");
  await expect(mobileRail.getByTestId("rail-pane-detail")).toBeVisible();
  await expect(mobileRail.getByTestId("research-situation")).toContainText("Historical stablecoin attention");
  await expect(mobileRail.getByTestId("synthesis-opening-rail")).toContainText("Evidence measured");
  await capture(page, "06-thread-detail-390x844");

  await mobileRail.getByRole("tab", { name: "Ask" }).click();
  await expect(mobileRail.getByTestId("rail-pane-ask")).toBeVisible();
  await expect(mobileRail.getByTestId("ask-composer")).toBeVisible();
  await capture(page, "07-thread-ask-390x844");
});

test("keeps the current recommended opening complete after explicit selection", async ({ page }) => {
  await mockV2Api(page);
  await installSynthesisMocks(page, RECOMMENDED_THREAD);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await expect(page.getByTestId("synthesis-home-state")).toBeVisible();
  await threadItem(page, "Historical stablecoin attention").click();

  const situation = page.getByTestId("research-situation");
  await expect(situation.locator(".rd-v2-situation-state")).toHaveText("Method");
  const openingRail = page.getByTestId("synthesis-opening-rail");
  await expect(openingRail).toContainText("Construction recommended");
  await expect(openingRail).toContainText("Review the recommendation");
  await expect(openingRail).toContainText("3 evidence roles");
  await expect(openingRail).toContainText("Not measured");
  await expect(openingRail).toContainText("Recommended · not accepted");

  const main = page.locator(".s04-main");
  await expect(main.getByText("Construction recommendation", { exact: true })).toBeVisible();
  await expect(main.getByRole("region", { name: "Research brief" })).toBeVisible();
  await expect(main.getByRole("region", { name: "Recommended construction" })).toBeVisible();
  await expect(main.getByRole("region", { name: "What happens next" })).toBeVisible();
  await expect(main.getByTestId("synthesis-workflow-next")).not.toBeVisible();
  await expect(main.getByTestId("synthesis-evidence-state")).not.toBeVisible();
  await expect(main.locator(':text-is("asset × week"):visible')).toHaveCount(1);
  await expect(main.getByText("Composite weekly attention index", { exact: true })).toHaveCount(1);
  const accept = main.getByRole("button", { name: "Accept & design method" });
  await expect(accept).toBeEnabled();
  const acceptBox = await accept.boundingBox();
  expect(acceptBox, "the opening decision must be reachable without desktop scroll").not.toBeNull();
  expect(acceptBox.y + acceptBox.height).toBeLessThanOrEqual(900);
  await capture(page, "08-opening-recommended-1440x900");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".s04-main h1")).toBeVisible();
  const mobileGrip = page.getByRole("button", { name: "Show research context" });
  const mobileGripBox = await mobileGrip.boundingBox();
  expect(mobileGripBox, "the compact inspector affordance should remain available").not.toBeNull();
  expect(mobileGripBox.height).toBeGreaterThanOrEqual(44);
  await capture(page, "09-opening-recommended-390x844");
});