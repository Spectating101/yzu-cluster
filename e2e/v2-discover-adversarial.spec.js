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

function routePayload(label, sourceId) {
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

test.describe("Discover adversarial lifecycle", () => {
  test("reassessment invalidates old sourcing immediately and fences late route responses", async ({ page }) => {
    const updatedAssessment = {
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

    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
    });

    await page.unroute("**/library/discover/assessment");
    let assessmentCalls = 0;
    await page.route("**/library/discover/assessment", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      assessmentCalls += 1;
      if (assessmentCalls === 2) await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(assessmentCalls === 1 ? MOCK_DISCOVER_ASSESSMENT : updatedAssessment),
      });
    });

    await page.unroute("**/library/discover/routes");
    let routeCalls = 0;
    await page.route("**/library/discover/routes", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      routeCalls += 1;
      if (routeCalls === 2) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(routePayload("STALE refreshed governance route", "stale_governance")),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          routeCalls === 1
            ? routePayload("MOPS governance disclosures", "mops_governance")
            : routePayload("TWSE director roster", "twse_directors"),
        ),
      });
    });

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "Do we hold issuer-quarter governance data for Taiwan?");

    const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(workspace).toContainText("MOPS governance disclosures");

    await workspace.getByRole("button", { name: "Refresh declared routes" }).click();
    await expect(workspace.getByRole("button", { name: "Comparing declared sources…" })).toBeDisabled();

    await workspace.locator("details.rd-v2-evidence-edit > summary").click();
    await workspace.getByLabel("Fields value").fill("director_tenure, independent_director_ratio");
    await workspace.getByRole("button", { name: "Apply & reassess" }).click();

    // Consequential sourcing advice belongs to the old brief and must disappear
    // synchronously, not only after the replacement model assessment returns.
    await page.waitForTimeout(50);
    const duringReassessment = await workspace.textContent();
    expect(duringReassessment).not.toContain("MOPS governance disclosures");
    expect(duringReassessment).not.toContain("STALE refreshed governance route");

    await expect(workspace).toContainText("Director-tenure and independent-director ratio are not evidenced");
    await expect(workspace).toContainText("TWSE director roster");

    // The deliberately late response from the pre-reassessment refresh must
    // never overwrite the route judgment for the corrected research brief.
    await page.waitForTimeout(800);
    await expect(workspace).not.toContainText("STALE refreshed governance route");
    await expect(workspace).toContainText("TWSE director roster");
    expect(assessmentCalls).toBe(2);
    expect(routeCalls).toBeGreaterThanOrEqual(3);
  });

  test("rapid repeated submit cannot create two approval jobs", async ({ page }) => {
    let submitCalls = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && /\/library\/discover\/intents\/[^/]+\/submit$/.test(url.pathname)) {
        submitCalls += 1;
      }
    });

    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "MOPS filings");

    await page.getByTestId("discover-ranked-results").getByRole("button", { name: "Review acquisition route" }).click();
    const workspace = page.getByTestId("discover-intent-workspace");
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);

    await workspace.getByRole("button", { name: "Continue to route selection" }).click();
    const submit = workspace.getByRole("button", { name: "Submit for approval" });
    await expect(submit).toBeEnabled();

    // Fire two activations in the same task. A React visual busy state alone is
    // not a sufficient lock because both handlers can observe the same render.
    await submit.evaluate((node) => {
      node.click();
      node.click();
    });

    await expect(workspace.getByTestId("discover-intent-collection")).toContainText("pending approval");
    await expect.poll(() => submitCalls).toBe(1);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Select route" })).toHaveCount(0);
  });

  test("route lookup failure leaves the gap unresolved without inventing a declared route", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
    });
    await page.unroute("**/library/discover/routes");
    await page.route("**/library/discover/routes", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "route registry unavailable" }),
    }));

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "What data covers Taiwan issuer-quarter governance?");

    const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
    await expect(workspace).toContainText("Declared routes are unavailable. The gap remains unresolved.");
    await expect(workspace).toContainText("Not established");
    await expect(workspace).not.toContainText("Collection can be requested for review");
  });

  test("capacity stays explicit while measurement is delayed, then converges to measured capability", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      resourcesDelayMs: 2500,
    });

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "What data covers Taiwan issuer-quarter governance?");

    const capacity = page.locator('[aria-label="Execution capacity"]');
    await expect(capacity).toBeVisible();
    await expect(capacity).toHaveAttribute("data-state", "checking");
    await expect(capacity).toContainText("Checking measured desk capacity…");
    await expect(capacity).toContainText("No worker or quota is assigned here.");
    await expect(capacity).not.toContainText(/assigned worker|assigned quota/i);

    await expect(capacity).toHaveAttribute("data-state", "measured", { timeout: 6000 });
    await expect(capacity).toContainText(/Collector fleet|BigQuery|GDrive vault/);
    await expect(capacity).not.toContainText(/assigned worker|assigned quota/i);
  });

  test("failed full capacity refresh exposes only surviving measured facts", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      resourcesStatus: 503,
    });

    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "What data covers Taiwan issuer-quarter governance?");

    const capacity = page.locator('[aria-label="Execution capacity"]');
    await expect(capacity).toBeVisible();
    await expect(capacity).toHaveAttribute("data-state", "partial");
    await expect(capacity).toContainText("Full resource refresh failed");
    await expect(capacity).toContainText("do not infer missing compute, storage, or quota");
    // /health independently measures the vault in this fixture, so it may be
    // retained. Fleet and BigQuery belong to the failed full rollup and must not
    // be invented from their absence.
    await expect(capacity).toContainText("GDrive vault");
    await expect(capacity).not.toContainText(/Collector fleet|BigQuery/);
    await expect(capacity).toContainText("No worker or quota is assigned here.");
  });
});
