import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function clearSynthesisLocalState(page) {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem("__rd_v2_syn_cleared") === "1") return;
      sessionStorage.setItem("__rd_v2_syn_cleared", "1");
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("rd_v2_synthesis_")) localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  });
}

async function waitForAttentionThread(page) {
  await expect(page.getByTestId("synthesis-discover-handoff")).toBeVisible({ timeout: 20_000 });
}

async function installExecutionLifecycle(page, { failFirst = false } = {}) {
  const snapshot = await page.evaluate(async () => {
    const threadId = localStorage.getItem("rd_v2_synthesis_thread:stablecoin_attention_proxy");
    if (!threadId) throw new Error("Attention synthesis thread was not stored");
    const response = await fetch(`/api/library/synthesis/threads/${encodeURIComponent(threadId)}`);
    if (!response.ok) throw new Error("Could not load attention synthesis thread");
    return { threadId, thread: await response.json() };
  });

  const outputId = "synthesis_stablecoin_weekly_e2e";
  const specHash = "spec_hash_e2e_20260713";
  const executionSpec = {
    input_dataset_id: "stablecoin_trust_engagement_weekly",
    output_dataset_id: outputId,
    group_by: ["week"],
    metrics: [
      { function: "count", as: "observations" },
      { function: "mean", column: "google_trends", as: "google_trends_mean" },
    ],
  };
  const thread = structuredClone(snapshot.thread);
  thread.state = {
    ...(thread.state || {}),
    proposal: null,
    execution_spec: executionSpec,
    accepted_spec_hash: specHash,
    execution: null,
  };
  thread.materialisation = "not_materialised";

  let attempt = 0;
  let phase = "ready";
  let polls = 0;
  let activeJobId = "";

  await page.route(`**/library/synthesis/threads/${snapshot.threadId}/execute`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempt += 1;
    polls = 0;
    phase = "pending_approval";
    activeJobId = `job-synthesis-e2e-${attempt}`;
    thread.state.execution = {
      status: "pending_approval",
      job_id: activeJobId,
      output_dataset_id: outputId,
      accepted_spec_hash: specHash,
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: activeJobId,
          status: "pending_approval",
          output_dataset_id: outputId,
        },
      }),
    });
  });

  await page.route("**/library/jobs/*/approve", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    phase = "queued";
    polls = 0;
    thread.state.execution = {
      ...(thread.state.execution || {}),
      status: "queued",
      job_id: activeJobId,
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job: { id: activeJobId, status: "queued" } }),
    });
  });

  await page.route(`**/library/synthesis/threads/${snapshot.threadId}`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.pathname.endsWith("/execute")) return route.fallback();

    if (phase === "queued" || phase === "running") {
      polls += 1;
      if (polls === 1) {
        phase = "running";
        thread.state.execution = {
          ...(thread.state.execution || {}),
          status: "running",
        };
      } else if (failFirst && attempt === 1) {
        phase = "failed";
        thread.state.execution = {
          ...(thread.state.execution || {}),
          status: "failed",
          error: "Input checksum changed during execution.",
        };
      } else {
        phase = "registered";
        thread.materialisation = "registered";
        thread.state.materialisation = "registered";
        thread.state.execution = {
          ...(thread.state.execution || {}),
          status: "registered",
          rows: 263,
          manifest_id: `synthesis_manifest_${activeJobId}`,
          drive_verified: true,
          output_dataset_id: outputId,
          accepted_spec_hash: specHash,
        };
      }
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(structuredClone(thread)),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await waitForAttentionThread(page);
  return { outputId, specHash };
}

test.describe("v2 Synthesis construction workspace", () => {
  test.beforeEach(async ({ page }) => {
    await clearSynthesisLocalState(page);
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("renders a persistent construction map with the existing right rail", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Synthesis" })).toBeVisible();
    await expect(page.getByTestId("synthesis-workbench")).toBeVisible();
    await expect(page.getByText("Historical stablecoin attention", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("synthesis-construction-map")).toBeVisible();
    await expect(page.getByTestId("synthesis-proposal")).toContainText("Use GDELT as a validation signal");
    await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Historical stablecoin attention");
  });

  test("selecting GDELT drives the contextual right rail", async ({ page }) => {
    await page.getByTestId("rf__node-gdelt").getByText("GDELT crypto news", { exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("GDELT crypto news");
    await expect(rail).toContainText("Proposed");
    await expect(rail).toContainText("Candidate validation signal");
    await expect(rail).toContainText("News coverage is related to public visibility");
  });

  test("proposal review is intentional and applying it changes the construction state", async ({ page }) => {
    await waitForAttentionThread(page);
    await page.getByTestId("synthesis-proposal").click();
    const dialog = page.getByRole("dialog", { name: "Review agent proposal" });
    await expect(dialog).toContainText("GDELT measures editorial/news coverage");
    await dialog.getByRole("button", { name: "Approve proposal" }).click();
    await expect(page.getByTestId("synthesis-proposal")).toHaveCount(0);
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("GDELT crypto news");
    await expect(rail).toContainText("Queryable");
    await expect(rail).toContainText("Validation signal");
  });

  test("accepted proposal state is retained after reload", async ({ page }) => {
    await waitForAttentionThread(page);
    await expect(page.getByTestId("synthesis-proposal")).toBeVisible();
    await page.getByTestId("synthesis-proposal").click();
    await page.getByRole("dialog", { name: "Review agent proposal" }).getByRole("button", { name: "Approve proposal" }).click();
    await expect(page.getByTestId("synthesis-proposal")).toHaveCount(0);
    await page.getByTestId("rf__node-gdelt").getByText("GDELT crypto news", { exact: true }).click();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Queryable");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("synthesis-workbench")).toBeVisible();
    await expect(page.getByTestId("synthesis-proposal")).toHaveCount(0);
    await page.getByTestId("rf__node-gdelt").getByText("GDELT crypto news", { exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("GDELT crypto news");
    await expect(rail).toContainText("Queryable");
    await expect(rail).toContainText("Validation signal");
  });

  test("open sourcing context navigates to Discover without inventing a collection", async ({ page }) => {
    await waitForAttentionThread(page);
    const handoffResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/library/synthesis/threads/") &&
        response.url().includes("/discover-handoff") &&
        response.ok(),
    );
    await page.getByTestId("synthesis-discover-handoff").click();
    const handoff = await handoffResponse;
    const body = await handoff.json();
    expect(body.collection).toBeNull();
    expect(body.fake_collection).toBe(false);
    expect(Array.isArray(body.missing_evidence)).toBeTruthy();
    expect(body.missing_evidence.some((row) => row.id === "x_followers")).toBeTruthy();

    await expect(page).toHaveURL(/tab=browse/);
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
    await expect(page.getByTestId("synthesis-sourcing-brief")).toContainText("Sourcing brief from Synthesis");
    await expect(page.getByTestId("synthesis-sourcing-brief")).toContainText("evidence gap");
    const query = decodeURIComponent(new URL(page.url()).searchParams.get("q") || "");
    expect(query.toLowerCase()).toContain("follower");
  });

  test("Ask session links to the synthesis thread and restores transcript after reload", async ({ page }) => {
    await waitForAttentionThread(page);
    await page.locator("aside.rd-v2-rail").getByRole("tab", { name: "Ask", exact: true }).click();

    const chatResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/library/chat") &&
        !response.url().includes("/stream") &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    const linkResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/library/synthesis/threads/") &&
        response.url().includes("/conversation") &&
        response.request().method() === "POST" &&
        response.ok(),
    );

    const askInput = page.getByTestId("ask-composer");
    await askInput.fill("Keep this synthesis Ask thread");
    await page.locator("aside.rd-v2-rail").getByRole("button", { name: "Send", exact: true }).click();

    const chat = await chatResponse;
    const chatBody = await chat.json();
    expect(chatBody.session_id).toBeTruthy();

    const linked = await linkResponse;
    const linkedBody = await linked.json();
    expect(linkedBody.session_id).toBe(chatBody.session_id);
    expect(linkedBody.id).toBeTruthy();

    const askMessages = page.getByTestId("ask-messages");
    await expect(askMessages).toContainText("Keep this synthesis Ask thread");
    await expect(askMessages).toContainText("Resources context received.");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await waitForAttentionThread(page);
    await page.locator("aside.rd-v2-rail").getByRole("tab", { name: "Ask", exact: true }).click();
    const restored = page.getByTestId("ask-messages");
    await expect(restored).toContainText("Keep this synthesis Ask thread");
    await expect(restored).toContainText("Resources context received.");
  });

  test("research plan and evidence remain honest inspection views", async ({ page }) => {
    await page.getByRole("button", { name: "Research plan", exact: true }).click();
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Research asset specification");
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Historical X follower growth");
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Known limitations");

    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await expect(page.getByTestId("synthesis-data-view")).toContainText("no rows materialised");
    await expect(page.getByTestId("synthesis-data-view")).toContainText("Planned output schema");
    await expect(page.getByTestId("synthesis-charts-view")).toContainText("Evidence coverage");
    await expect(page.getByTestId("synthesis-charts-view")).toContainText("Ask agent to preview");
  });

  test("mobile preserves the map and opens detail for node selection", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("synthesis-construction-map")).toBeVisible();
    await page.getByTestId("rf__node-gdelt").getByText("GDELT crypto news", { exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).not.toHaveClass(/rd-v2-rail-collapsed/);
    await expect(rail).toContainText("GDELT crypto news");
  });

  test("approved execution refreshes through registration and opens the Library asset", async ({ page }) => {
    const { outputId } = await installExecutionLifecycle(page);
    const shelf = page.getByTestId("synthesis-execution-shelf");

    await expect(shelf).toContainText("Ready for review");
    await expect(shelf).toContainText("stablecoin_trust_engagement_weekly");
    await expect(shelf).toContainText(outputId);
    await expect(page.getByTestId("synthesis-execution-metrics")).toContainText("mean google_trends");

    await page.getByTestId("synthesis-submit-execution").click();
    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Approval required");
    await page.getByTestId("synthesis-approve-execution").click();

    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Registered", { timeout: 12_000 });
    await expect(page.getByTestId("synthesis-execution-proof")).toContainText("263");
    await expect(page.getByTestId("synthesis-execution-proof")).toContainText("synthesis_manifest_job-synthesis-e2e-1");
    await expect(page.getByTestId("synthesis-execution-proof")).toContainText("Verified");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Registered");
    await page.getByTestId("synthesis-open-registered-output").click();
    await expect(page).toHaveURL(new RegExp(`tab=library.*dataset=${outputId}|dataset=${outputId}.*tab=library`));
  });

  test("failed execution explains the failure and can be retried", async ({ page }) => {
    await installExecutionLifecycle(page, { failFirst: true });

    await page.getByTestId("synthesis-submit-execution").click();
    await page.getByTestId("synthesis-approve-execution").click();
    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Execution failed", { timeout: 12_000 });
    await expect(page.getByTestId("synthesis-execution-error")).toContainText("Input checksum changed");

    await page.getByTestId("synthesis-submit-execution").click();
    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Approval required");
    await page.getByTestId("synthesis-approve-execution").click();
    await expect(page.getByTestId("synthesis-execution-state")).toHaveText("Registered", { timeout: 12_000 });
    await expect(page.getByTestId("synthesis-execution-proof")).toContainText("263");
  });

  test("new objective creates a durable unformed thread that survives reload", async ({ page }) => {
    const objective =
      "Construct a weekly cross-exchange stablecoin liquidity stress indicator from held market panels.";
    const title = objective.slice(0, 72);

    await waitForAttentionThread(page);
    await page.getByRole("button", { name: "Start new synthesis" }).click();
    const dialog = page.getByTestId("synthesis-objective-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("synthesis-objective-input").fill(objective);

    const createResponse = page.waitForResponse(
      (response) =>
        /\/library\/synthesis\/threads(?:\?|$)/.test(response.url()) &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await dialog.getByTestId("synthesis-objective-submit").click();
    const created = await createResponse;
    const createdBody = await created.json();
    const createPayload = created.request().postDataJSON();
    expect(createPayload.session_id).toBeUndefined();
    expect(createdBody.id).toBeTruthy();
    expect(createdBody.state?.projectKey).toBeTruthy();
    expect(createdBody.state?.projectKey).not.toBe("stablecoin_attention_proxy");
    expect(createdBody.state?.nodes || []).toEqual([]);
    expect(createdBody.materialisation).toBe("not_materialised");

    await expect(page.getByTestId("synthesis-working-brief")).toBeVisible();
    await expect(page.getByTestId("synthesis-working-brief")).toContainText(objective);
    await expect(page.getByTestId("synthesis-working-brief")).toContainText("None mapped yet");
    await expect(page.getByTestId("synthesis-working-brief")).toContainText("Not materialised");
    await expect(page.getByTestId("synthesis-construction-map")).toHaveCount(0);
    await expect(page.getByTestId("synthesis-workbench")).not.toContainText("Google Trends weekly panel");
    await expect(page.getByTestId("synthesis-workbench")).not.toContainText("GDELT crypto news");

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Ask", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(rail).toContainText(title);
    await expect(page.getByTestId("ask-messages")).toContainText(/Ground research|Begin research|liquidity stress/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("tab", { name: title })).toBeVisible();
    await page.getByRole("tab", { name: title }).click();
    await expect(page.getByTestId("synthesis-working-brief")).toBeVisible();
    await expect(page.getByTestId("synthesis-construction-map")).toHaveCount(0);
    await expect(page.getByTestId("synthesis-workbench")).not.toContainText("Google Trends weekly panel");

    await page.locator("aside.rd-v2-rail").getByRole("tab", { name: "Ask", exact: true }).click();
    await expect(page.locator("aside.rd-v2-rail")).toContainText(`Synthesis · ${title}`);
    await expect(page.locator("aside.rd-v2-rail")).toContainText(objective.slice(0, 40));
  });
});
