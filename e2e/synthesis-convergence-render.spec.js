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

async function installSynthesisMocks(page) {
  const threads = new Map([[THREAD.id, structuredClone(THREAD)]]);

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
          nodes: [],
          edges: [],
          proposal: null,
        },
      };
      threads.set(created.id, created);
      return respond(created);
    }

    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);
    if (suffix === "measurements" && method === "GET") {
      return respond({
        thread_id: thread.id,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: ["trends", "reddit", "gdelt"],
        measured_inputs: 3,
        unmeasured: [],
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

test("captures the converged Synthesis thread and integrated new-entry state", async ({ page }) => {
  await mockV2Api(page);
  await installSynthesisMocks(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await expect(page.getByTestId("synthesis-studio")).toBeVisible();
  const situation = page.getByTestId("research-situation");
  const openingRail = page.getByTestId("synthesis-opening-rail");
  await expect(situation).toContainText("Synthesis");
  await expect(situation).toContainText("Method");
  await expect(situation).toContainText("Historical stablecoin attention");
  await expect(situation).toContainText("3 mapped evidence");
  await expect(situation).toContainText("2 measured");
  await expect(openingRail).toBeVisible();
  await expect(openingRail.locator(".rd-v2-rail-ehead")).toHaveCount(0);
  await expect(openingRail).not.toContainText("Historical stablecoin attention");
  await expect(openingRail).not.toContainText(THREAD.objective);
  await expect(openingRail).toContainText("Evidence measured");
  await expect(openingRail).toContainText("Review measured evidence");
  await expect(openingRail).toContainText("1 sparse / flagged column");
  await expect(openingRail).toContainText("Request one reviewable construction");
  await expect(openingRail).toContainText("asset × week");
  await expect(openingRail).toContainText("3 mapped");
  await expect(openingRail).toContainText("2 columns");
  await expect(openingRail).toContainText("Not accepted");
  await expect(openingRail).toContainText("Not registered");
  await capture(page, "01-thread-detail-1440x1000");

  await page.getByRole("button", { name: "+ New synthesis" }).click();
  const entry = page.getByTestId("synthesis-intent-state");
  await expect(entry).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New synthesis" })).toHaveAttribute("aria-pressed", "true");
  await expect(entry.getByRole("button", { name: /Back to Historical stablecoin attention/ })).toBeVisible();
  await expect(page.getByTestId("research-situation").locator(".rd-v2-situation-state")).toHaveText("Draft");
  await expect(page.getByTestId("research-situation")).toContainText("Not saved");
  await expect(page.getByTestId("rail-pane-detail")).toContainText("Draft entry");
  await expect(page.getByTestId("rail-pane-detail")).toContainText("Nothing is saved yet");
  await expect(page.getByTestId("rail-pane-detail").locator(".rd-v2-rail-ehead")).toHaveCount(0);
  await capture(page, "02-new-entry-1440x1000");

  await page.setViewportSize({ width: 1920, height: 961 });
  await capture(page, "03-new-entry-1920x961");

  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "04-new-entry-390x844");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await entry.getByRole("button", { name: /Back to Historical stablecoin attention/ }).click();
  await expect(page.getByTestId("research-situation")).toContainText("Historical stablecoin attention");
  await expect(page.getByTestId("research-situation")).toContainText("2 measured");
  await capture(page, "05-returned-thread-1440x1000");

  // Replace the two legacy S-04 rail tests with the actual converged mobile
  // contract: the sheet opens on decision intelligence, then Ask takes over
  // without losing the scoped thread identity above it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show research context" }).click();
  const mobileRail = page.locator("aside.rd-v2-rail");
  await expect(mobileRail.getByTestId("rail-pane-detail")).toBeVisible();
  await expect(mobileRail.getByTestId("research-situation")).toContainText("Historical stablecoin attention");
  await expect(mobileRail.getByTestId("synthesis-opening-rail")).toContainText("Evidence measured");
  await expect(mobileRail.getByTestId("synthesis-opening-rail")).toContainText("Review measured evidence");
  await capture(page, "06-thread-detail-390x844");

  await mobileRail.getByRole("tab", { name: "Ask" }).click();
  await expect(mobileRail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  await expect(mobileRail.getByTestId("rail-pane-detail")).toBeHidden();
  await expect(mobileRail.getByTestId("rail-pane-ask")).toBeVisible();
  await expect(mobileRail.getByTestId("ask-composer")).toBeVisible();
  await expect(mobileRail.getByTestId("research-situation")).toContainText("Historical stablecoin attention");
  await capture(page, "07-thread-ask-390x844");
});
