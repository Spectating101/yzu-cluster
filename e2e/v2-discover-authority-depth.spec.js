import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_ASSESSMENT,
  MOCK_DISCOVER_HIT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

const correctedAssessment = {
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

function routePayload(label = "MOPS governance disclosures", sourceId = "mops_governance") {
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

async function installSequencedAssessment(page, responses) {
  await page.unroute("**/library/discover/assessment");
  let calls = 0;
  await page.route("**/library/discover/assessment", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    if (response?.status && response.status >= 400) {
      return route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({ error: response.error || "assessment unavailable" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return () => calls;
}

test.describe("Discover authority depth", () => {
  test("failed reassessment revokes the previous verdict, held evidence, and sourcing authority", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      gapRoutesBody: routePayload(),
    });
    const assessmentCalls = await installSequencedAssessment(page, [
      MOCK_DISCOVER_ASSESSMENT,
      { status: 503, error: "assessment service unavailable" },
    ]);

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "Do we hold issuer-quarter governance data for Taiwan?");

    const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(workspace.getByTestId("discover-verdict")).toHaveText("Partially covered");
    await expect(workspace).toContainText("MOPS governance disclosures");

    await workspace.locator("details.rd-v2-evidence-edit > summary").click();
    await workspace.getByLabel("Fields value").fill("director_tenure, independent_director_ratio");
    await workspace.getByRole("button", { name: "Apply & reassess" }).click();

    await expect(workspace).toContainText("Assessment is unavailable");
    await expect(workspace).toContainText("No current evidence verdict is established");
    await expect(workspace.getByTestId("discover-verdict")).toHaveCount(0);
    await expect(workspace.getByTestId("discover-held-evidence")).toHaveCount(0);
    await expect(workspace).not.toContainText("MOPS governance disclosures");
    await expect(workspace).not.toContainText("Partially covered");
    expect(assessmentCalls()).toBe(2);
  });

  test("one research need survives correction through reviewed acquisition, pending approval, History, and reload", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      gapRoutesBody: routePayload(),
    });
    const assessmentCalls = await installSequencedAssessment(page, [
      MOCK_DISCOVER_ASSESSMENT,
      correctedAssessment,
    ]);

    await page.unroute("**/library/discover/routes");
    let routeCalls = 0;
    await page.route("**/library/discover/routes", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      routeCalls += 1;
      const body = routeCalls === 1
        ? routePayload("MOPS governance disclosures", "mops_governance")
        : routePayload("TWSE director roster", "twse_directors");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "Do we hold issuer-quarter governance data for Taiwan?");

    const evidence = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(evidence.getByTestId("discover-verdict")).toHaveText("Partially covered");
    await expect(page.getByTestId("discover-query-composer")).toHaveCount(1);

    await evidence.locator("details.rd-v2-evidence-edit > summary").click();
    await evidence.getByLabel("Fields value").fill("director_tenure, independent_director_ratio");
    await evidence.getByRole("button", { name: "Apply & reassess" }).click();

    await expect(evidence).toContainText("Director-tenure and independent-director ratio are not evidenced");
    await expect(evidence).toContainText("TWSE director roster");
    await expect(evidence).not.toContainText("MOPS governance disclosures");

    await page.getByRole("button", { name: "Review sourcing strategy" }).click();
    const comparison = page.getByTestId("discover-route-comparison");
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText("Observed");
    await expect(comparison).toContainText("Proposed");
    await expect(comparison).toContainText("Unknown");
    await expect(comparison).toContainText("cannot submit procurement");
    // The downstream decision surface must use the corrected App-level assessment,
    // not the original question assessment that happened to mount the workspace.
    await expect(comparison).toContainText("director_tenure");
    await expect(comparison).toContainText("independent_director_ratio");
    await expect(comparison).not.toContainText("board_composition, governance_score");

    await comparison.getByRole("button", { name: /MOPS financial statements/ }).click();
    const acquisition = page.getByTestId("discover-intent-workspace");
    await expect(acquisition).toBeVisible();
    await expect(acquisition).toContainText("Proposed routes · review required");
    await expect(acquisition.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);

    await acquisition.getByRole("button", { name: "Continue to route selection" }).click();
    await expect(acquisition).toContainText("Reviewed routes");
    await expect(acquisition.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    await acquisition.getByRole("button", { name: "Submit for approval" }).click();

    const lifecycle = acquisition.getByTestId("discover-intent-collection");
    await expect(lifecycle).toContainText("pending approval");
    await expect(lifecycle).toContainText("collection remains governed by History");
    await expect(acquisition).not.toContainText(/approved collection|collection complete|registered in library/i);

    await lifecycle.getByRole("button", { name: /Open in History/ }).click();
    const history = page.getByTestId("discover-history");
    await expect(history).toBeVisible();
    await expect(page.getByRole("tab", { name: /History/ })).toHaveAttribute("aria-selected", "true");
    await expect(history).toContainText("MOPS financial statements");
    await expect(history).toContainText(/pending approval|needs approval/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const restoredHistory = page.getByTestId("discover-history");
    await expect(restoredHistory).toBeVisible();
    await expect(restoredHistory).toContainText("MOPS financial statements");
    await expect(restoredHistory).toContainText(/pending approval|needs approval/i);

    expect(assessmentCalls()).toBe(2);
    expect(routeCalls).toBeGreaterThanOrEqual(2);
  });
});
