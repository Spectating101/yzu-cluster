import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_HIT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

async function readyForSubmit(page) {
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await search(page, "MOPS filings");
  await page.getByTestId("discover-ranked-results").getByRole("button", { name: "Add to collection" }).click();

  const workspace = page.getByTestId("discover-intent-workspace");
  await expect(workspace).toContainText("Proposed routes · review required");
  await workspace.getByRole("button", { name: "Continue to route selection" }).click();
  await expect(workspace).toContainText("Reviewed routes");
  await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
  return workspace;
}

function durableIntent(intentId, { committed = false } = {}) {
  return {
    id: intentId,
    title: "MOPS financial statements (Taiwan)",
    research_need: "MOPS filings",
    state: {
      status: committed ? "pending_approval" : "ready_for_review",
      candidate: {
        candidate_key: "dataset:mops_financial_statements_ext",
        dataset_id: "mops_financial_statements_ext",
        connector_id: "mops_tw",
        title: "MOPS financial statements (Taiwan)",
      },
      routes: [{
        id: "connector_mops_tw",
        title: "Collect through mops_tw",
        connector_id: "mops_tw",
        candidate_key: "dataset:mops_financial_statements_ext",
        summary: "TW listed company filings",
      }],
      selected_route_id: "connector_mops_tw",
      proposal: null,
      collection: committed
        ? {
            job_id: "job-lost-response-1",
            status: "pending_approval",
            registered_dataset_id: "",
          }
        : {
            job_id: "",
            status: "not_started",
            registered_dataset_id: "",
          },
    },
  };
}

async function installLostSubmit(page, { durable = "committed" } = {}) {
  let submitCalls = 0;
  let getCalls = 0;

  await page.route("**/library/discover/intents/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || !/\/library\/discover\/intents\/[^/]+$/.test(url.pathname)) {
      return route.fallback();
    }
    getCalls += 1;
    if (durable === "unavailable") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "intent store unavailable" }),
      });
    }
    const intentId = decodeURIComponent(url.pathname.split("/").pop() || "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(durableIntent(intentId, { committed: durable === "committed" })),
    });
  });

  await page.route("**/library/discover/intents/*/submit", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    submitCalls += 1;
    return route.abort("connectionreset");
  });

  return {
    submitCalls: () => submitCalls,
    getCalls: () => getCalls,
  };
}

test.describe("Discover submit transport recovery", () => {
  test("lost submit response recovers the committed pending-approval job from durable intent", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { durable: "committed" });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("pending approval");
    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("job-lost-response-1");
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
    await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
    await expect.poll(calls.submitCalls).toBe(1);
    await expect.poll(calls.getCalls).toBe(1);
  });

  test("lost submit response fails closed when durable intent cannot be reread", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { durable: "unavailable" });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    const unconfirmed = workspace.getByTestId("discover-submit-unconfirmed");
    await expect(unconfirmed).toBeVisible();
    await expect(unconfirmed).toContainText("Submission status is unconfirmed");
    await expect(unconfirmed).toContainText("Do not resubmit");
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
    await expect.poll(calls.submitCalls).toBe(1);
    await expect.poll(calls.getCalls).toBe(1);

    await unconfirmed.getByRole("button", { name: "Check submission status" }).click();
    await expect.poll(calls.getCalls).toBe(2);
    await expect.poll(calls.submitCalls).toBe(1);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
  });

  test("retry is allowed only after durable intent confirms the submit created no job", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { durable: "not_committed" });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    await expect(workspace).toContainText("Durable status confirms no approval job was created. You can retry.");
    await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    await expect.poll(calls.submitCalls).toBe(1);
    await expect.poll(calls.getCalls).toBe(1);
  });
});
