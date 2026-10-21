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
  await workspace.getByRole("button", { name: /^(Use this route|Continue to route selection)$/ }).click();
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

async function installLostSubmit(page, { durable = "committed", refusal = "", status = 400 } = {}) {
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
    if (refusal) {
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: refusal }) });
    }
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

    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("Waiting for your approval");
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
    await expect(unconfirmed).toContainText("Wait until the saved request can be read before submitting again");
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

    await expect(workspace).toContainText("The saved status confirms no approval request was created. You can retry.");
    await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    await expect.poll(calls.submitCalls).toBe(1);
    await expect.poll(calls.getCalls).toBe(1);
  });

  test("a refused submit shows the server's reason", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { durable: "unavailable", refusal: "Please clarify the unknown county name and its state." });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    await expect(workspace).toContainText("Not requested: Please clarify the unknown county name and its state.");
    await expect(workspace).not.toContainText("The saved status confirms no approval request was created.");
    await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    expect(calls.submitCalls()).toBe(1);
    expect(calls.getCalls()).toBe(0);
  });

  test("a specificity refusal keeps a reason starting with a number", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { durable: "unavailable", status: 422, refusal: "100 series is the maximum" });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    await expect(workspace).toContainText("Not requested: 100 series is the maximum.");
    await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    expect(calls.getCalls()).toBe(0);
  });

  test("a specificity refusal hides the transport fallback message", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    const workspace = await readyForSubmit(page);
    const calls = await installLostSubmit(page, { refusal: "400 /library/discover/intents/request/submit" });

    await workspace.getByRole("button", { name: "Submit for approval" }).click();

    await expect(workspace).toContainText("Not requested: The server declined this request.");
    await expect(workspace).not.toContainText("400 /library/");
    expect(calls.getCalls()).toBe(0);
  });

  for (const [status, message] of [
    [401, "Sign in to submit this request."],
    [403, "You do not have permission to submit this request."],
    [409, "This request conflicts with another collection."],
    [429, "Too many requests. Try again later."],
  ]) {
    test(`${status} reconciles and shows the server error without specificity advice`, async ({ page }) => {
      await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
      const workspace = await readyForSubmit(page);
      const calls = await installLostSubmit(page, { durable: "not_committed", status, refusal: message });

      await workspace.getByRole("button", { name: "Submit for approval" }).click();

      await expect(workspace.locator(".rd-v2-intent-error")).toHaveText(message);
      await expect(workspace).not.toContainText("Not requested:");
      await expect(workspace).not.toContainText("search with those specifics");
      await expect(workspace.getByTestId("discover-submit-unconfirmed")).toHaveCount(0);
      await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
      expect(calls.submitCalls()).toBe(status === 401 ? 2 : 1);
      expect(calls.getCalls()).toBe(1);
    });
  }
});
