import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_ASSESSMENT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

const PUBLIC_ARTIFACT = {
  kind: "artifact",
  source_id: "example_public",
  candidate_key: "source:example_public",
  title: "Example public research files",
  description: "Public CSV files from a source that explicitly advertises acquisition availability.",
  url: "https://example.com/data.csv",
  access_mode: "public_http",
  acquisition_available: true,
  query_relevance: 2,
};

const UPDATED_ASSESSMENT = {
  ...MOCK_DISCOVER_ASSESSMENT,
  because: "The corrected brief requires director-tenure and independence fields that are not evidenced in the held record.",
  requirement: {
    ...MOCK_DISCOVER_ASSESSMENT.requirement,
    fields: {
      value: ["director_tenure", "independent_director_ratio"],
      provenance: "explicit",
    },
  },
  gap: {
    statement: "Director-tenure and independent-director ratio are not evidenced in the held record.",
    blocks: "A board-independence analysis at issuer-quarter grain.",
    resolution_evidence: "Verified director roster fields aligned to issuer-quarter observations.",
  },
};

function sourcingRoute(label, sourceId) {
  return {
    gaps: ["fields"],
    routes: [{
      dimension: "fields",
      source_id: sourceId,
      label,
      provider: "TWSE / MOPS",
      access_mode: "live_connector",
      reason: `${label} can address the currently recorded field gap.`,
      actionable: true,
      action: "collect",
    }],
    reason: "ok",
  };
}

function compiledRoute() {
  return {
    id: "craft_primary",
    title: "Custom HTTP acquisition",
    summary: "Bounded HTTP manifest for the selected public artifact.",
    access: "http_manifest",
    destination: "data_lake/procured/example_public",
    cost: "cluster worker · researcher approval",
    limitation: "Transfer size is not measured yet.",
    url: PUBLIC_ARTIFACT.url,
    pipeline: "custom",
    crafted: true,
    collect_plan: {
      job_type: "http_manifest",
      required_capabilities: ["http"],
      resource_requirements: { cpu_cores: 0.5, memory_mb: 256 },
      cluster_execution: {
        contract_hash: "compiled-contract-e2e",
        engineering_summary: {
          status: "compiled",
          primitive: "http_manifest",
          required_capabilities: ["http"],
          capability_count: 1,
          resource_basis: "baseline_only",
          placement: "runtime",
          parallelism_hint: 1,
          preflight: "recommended",
          post_acquisition_reassessment: true,
        },
      },
    },
  };
}

function committedIntent(intentId) {
  return {
    id: intentId,
    title: PUBLIC_ARTIFACT.title,
    research_need: "Do we hold issuer-quarter governance data for Taiwan?",
    state: {
      status: "pending_approval",
      candidate: {
        candidate_key: PUBLIC_ARTIFACT.candidate_key,
        source_id: PUBLIC_ARTIFACT.source_id,
        title: PUBLIC_ARTIFACT.title,
        description: PUBLIC_ARTIFACT.description,
        url: PUBLIC_ARTIFACT.url,
      },
      routes: [compiledRoute()],
      selected_route_id: "craft_primary",
      proposal: null,
      collection: {
        job_id: "job-hostile-journey-1",
        status: "pending_approval",
        registered_dataset_id: "",
      },
    },
  };
}

const HOSTILE_JOB = {
  id: "job-hostile-journey-1",
  status: "pending_approval",
  candidate_key: PUBLIC_ARTIFACT.candidate_key,
  connector_id: null,
  registered_dataset_id: null,
  output_manifest_id: null,
  plan: { title: PUBLIC_ARTIFACT.title },
};

async function installAmbiguousCommittedSubmit(page) {
  let submitCalls = 0;
  let durableReads = 0;

  await page.route("**/library/discover/intents/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || !/\/library\/discover\/intents\/[^/]+$/.test(url.pathname)) {
      return route.fallback();
    }
    durableReads += 1;
    const intentId = decodeURIComponent(url.pathname.split("/").pop() || "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(committedIntent(intentId)),
    });
  });

  await page.route("**/library/discover/intents/*/submit", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    submitCalls += 1;
    return route.abort("connectionreset");
  });

  await page.unroute("**/library/jobs*");
  await page.route("**/library/jobs*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ jobs: [HOSTILE_JOB] }),
  }));

  return {
    submitCalls: () => submitCalls,
    durableReads: () => durableReads,
  };
}

test.describe("Discover continuous hostile researcher journey", () => {
  test("question → reassessment → sourcing → compiled acquisition → pending approval → History", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: { sections: [], total: 0 },
      discoverSourcesBody: { results: [PUBLIC_ARTIFACT], total: 1 },
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      jobsBody: { jobs: [] },
      historyBody: { items: [] },
    });

    await page.unroute("**/library/discover/assessment");
    let assessmentCalls = 0;
    await page.route("**/library/discover/assessment", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      assessmentCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(assessmentCalls === 1 ? MOCK_DISCOVER_ASSESSMENT : UPDATED_ASSESSMENT),
      });
    });

    await page.unroute("**/library/discover/routes");
    let routeCalls = 0;
    await page.route("**/library/discover/routes", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      routeCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          routeCalls === 1
            ? sourcingRoute("MOPS governance disclosures", "mops_governance")
            : sourcingRoute("TWSE director roster", "twse_directors"),
        ),
      });
    });

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const query = "Do we hold issuer-quarter governance data for Taiwan?";
    await page.getByLabel("Search or describe a research need").fill(query);
    await page.getByRole("button", { name: "Explore", exact: true }).click();

    const evidence = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(evidence).toBeVisible();
    await expect(page.getByTestId("discover-verdict")).toHaveText("Partially covered");
    await expect(evidence).toContainText("MOPS governance disclosures");
    await expect(page.getByTestId("discover-ranked-results")).toContainText(PUBLIC_ARTIFACT.title);

    // Correct the research brief. The old sourcing answer must be replaced by a
    // sourcing route grounded in the revised requirement before acquisition.
    await evidence.locator("details.rd-v2-evidence-edit > summary").click();
    await evidence.getByLabel("Fields value").fill("director_tenure, independent_director_ratio");
    await evidence.getByRole("button", { name: "Apply & reassess" }).click();
    await expect(evidence).toContainText("Director-tenure and independent-director ratio are not evidenced");
    await expect(evidence).toContainText("TWSE director roster");
    await expect(evidence).not.toContainText("MOPS governance disclosures");
    expect(assessmentCalls).toBe(2);
    expect(routeCalls).toBeGreaterThanOrEqual(2);

    // Sourcing found an explicitly acquirable artifact. Opening it must yield
    // backend-authored procurement engineering, not an operator dashboard.
    const ranked = page.getByTestId("discover-ranked-results");
    await ranked.getByRole("button", { name: "Review acquisition route" }).click();
    const workspace = page.getByTestId("discover-intent-workspace");
    await expect(workspace).toBeVisible();
    const engineering = workspace.getByTestId("discover-procurement-engineering");
    await expect(engineering).toContainText("Compiled · HTTP acquisition");
    await expect(engineering).toContainText("http · runtime placement · baseline sizing");
    await expect(engineering).toContainText("preflight recommended · single claim");
    await expect(engineering).toContainText("Evidence fit will be rechecked after collection");
    await expect(engineering).not.toContainText(/worker-[0-9]|reservation|contract hash|DAG/i);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);

    await workspace.getByRole("button", { name: "Continue to route selection" }).click();
    await expect(workspace).toContainText("Reviewed routes");
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();

    // Make the network response ambiguous after the server has durably committed
    // the approval job. The UI must reconcile, never blind-resubmit.
    const calls = await installAmbiguousCommittedSubmit(page);
    await workspace.getByRole("button", { name: "Submit for approval" }).click();
    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("pending approval");
    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("job-hostile-journey-1");
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
    await expect.poll(calls.submitCalls).toBe(1);
    await expect.poll(calls.durableReads).toBe(1);

    // Finish the same researcher journey in the durable lifecycle ledger.
    await workspace.getByRole("button", { name: "Open in History" }).click();
    await expect(page).toHaveURL(/mode=history/);
    const history = page.getByTestId("discover-history");
    await expect(history).toBeVisible();
    await expect(history.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await expect(history).toContainText(PUBLIC_ARTIFACT.title);
    await expect(page.getByTestId("header-pending-link")).toHaveText("1 pending");
  });
});
