import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-object-context";
const SPEC = {
  input_dataset_id: "idn_fry_daily_cross_section",
  output_dataset_id: "idn_weekly_factor_exposure",
  grain: "asset × week",
  group_by: ["asset", "week"],
  metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
};

function threadFor() {
  return {
    id: "thread-object-context",
    created_at: "2026-09-04T10:00:00Z",
    updated_at: "2026-09-04T10:00:00Z",
    title: "IDN weekly factor exposure",
    objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
    materialisation: "not_materialised",
    state: {
      title: "IDN weekly factor exposure",
      objective: "Weekly excess return per Indonesian listed equity, against Fama-French factors.",
      required_grain: "asset × week",
      nodes: [
        { id: "idn", type: "source", layer: "evidence", label: "IDN daily cross-section", role: "Held input", grain: "asset-day", coverage: "2020–2026" },
        { id: "ff", type: "source", layer: "evidence", label: "Fama-French factors", role: "Validation", grain: "day", coverage: "1963–2026" },
      ],
      edges: [],
      spec: SPEC,
      proposal: {
        id: "proposal-object-context",
        proposal_hash: "sha256:proposal-object-context",
        title: "Weekly factor exposure",
        summary: "Aggregate the daily cross-section to asset × week.",
        operations: [{ op: "update_spec", patch: { grain: "asset × week" } }],
        execution_spec: SPEC,
      },
    },
  };
}

async function mount(page) {
  const thread = threadFor();
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/measurements")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: thread.id,
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
        body: JSON.stringify({ thread_id: thread.id, missing_evidence: [], collect_intents: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.pathname.endsWith(`/${thread.id}`) ? thread : { threads: [thread], total: 1 }),
    });
  });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await page.locator("button:visible").filter({ hasText: thread.title }).first().click();
  await expect(page.getByTestId("synthesis-proposal-state")).toBeVisible();
  return thread;
}

test("centre object selection grounds Ask and native backend targets drive the exact durable surface", async ({ page }) => {
  mkdirSync(outDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const thread = await mount(page);

  let submittedMessage = "";
  let submittedRailContext = null;
  await page.route("**/api/library/chat/stream", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const posted = route.request().postDataJSON() || {};
    submittedMessage = posted.message || "";
    submittedRailContext = posted.rail_context || null;
    const events = [
      {
        type: "activity",
        text: "Checking current recorded state",
        // Deliberately contradict the semantic fallback. If the client drops
        // target metadata this would incorrectly focus Evidence, not Proposal.
        action: "evidence",
        target: {
          kind: "proposal",
          object_id: "proposal-object-context",
          label: "Method proposal",
          thread_id: thread.id,
          surface: "synthesis-proposal-state",
        },
      },
      {
        type: "complete",
        result: {
          session_id: "object-context-session",
          reply: "This refers to the selected exact method proposal.",
          action: "answer",
          activity_target: {
            kind: "proposal",
            object_id: "proposal-object-context",
            label: "Method proposal",
            thread_id: thread.id,
            surface: "synthesis-proposal-state",
          },
        },
      },
    ];
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });

  const proposal = page.getByTestId("synthesis-proposal-state");
  await proposal.locator("p").first().click();

  await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  const context = page.getByTestId("synthesis-ask-object-context");
  await expect(context).toBeVisible();
  await expect(context).toContainText("proposal");
  await expect(context).toContainText("proposal-object-context");
  await expect(proposal).toHaveAttribute("data-synthesis-context-selected", "true");

  await page.getByTestId("ask-composer").fill("Why this?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("This refers to the selected exact method proposal.")).toBeVisible();

  expect(submittedMessage).toContain("Why this?");
  expect(submittedMessage).toContain("Selected Synthesis object context:");
  expect(submittedMessage).toContain("Kind: proposal.");
  expect(submittedMessage).toContain("Object id: proposal-object-context.");
  expect(submittedRailContext?.synthesis_object_context).toMatchObject({
    kind: "proposal",
    object_id: "proposal-object-context",
    surface: "synthesis-proposal-state",
  });
  await expect(page.getByTestId("ask-messages")).not.toContainText("Selected Synthesis object context:");

  const run = page.getByTestId("synthesis-agent-run");
  await expect(run).toContainText("Checking current recorded state");
  await expect(run).toContainText("proposal-object-context");
  await run.getByRole("button", { name: /Checking current recorded state/ }).click();
  await expect(proposal).toHaveAttribute("data-synthesis-agent-focus", "true");
  await expect(context).toContainText("proposal-object-context");

  await context.getByRole("button", { name: "Clear" }).click();
  await expect(context).not.toBeVisible();
  await expect(proposal).not.toHaveAttribute("data-synthesis-context-selected", "true");

  await page.screenshot({ path: `${outDir}/bidirectional-object-context-1440.png`, fullPage: true });
});
