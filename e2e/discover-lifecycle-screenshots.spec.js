/**
 * Discover Acquisition Lifecycle screenshots.
 * Run: CI=true YZU_PAGES=false TMPDIR=$PWD/.tmp-pw npx playwright test e2e/discover-lifecycle-screenshots.spec.js
 */
import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, MOCK_PROBE_RESULT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import path from "node:path";
import fs from "node:fs";

const OUT = "docs/screenshots-review/discover-lifecycle";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, label) {
  await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 6000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
}

const KEY = "dataset:mops_financial_statements_ext";

function job(status, extra = {}) {
  return {
    id: `job-${status}`,
    status,
    candidate_key: KEY,
    connector_id: "example_com_data",
    registered_dataset_id: extra.registered_dataset_id ?? null,
    output_manifest_id: extra.output_manifest_id ?? null,
    error: extra.error || "",
    updated_at: extra.updated_at || "2026-07-10T14:32:00Z",
    result: extra.result || {},
    plan: { title: "MOPS financial statements (Taiwan)" },
    request: { candidate_key: KEY, connector_id: "example_com_data" },
  };
}

async function openMops(page, jobsBody, { probe = false } = {}) {
  await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT, jobsBody });
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.locator(".rd-v2-search-pill input").fill("mops");
  await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
  if (probe) {
    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Probe source" }).click();
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator(".rd-v2-eval-verified")).toBeVisible();
    await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 6000 }).catch(() => {});
  }
}

test.describe("Discover lifecycle screenshots", () => {
  test("desktop / tablet / mobile lifecycle states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 01 pre-submit
    await openMops(page, { jobs: [] }, { probe: true });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface")).toContainText("Acquisition available");
    await shot(page, "01-desktop-pre-submit-acquisition-available");

    // 02 submitting — intercept collect to delay; then fulfill jobs list with the new job
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    await page.unroute("**/library/discover/collect");
    await page.route("**/library/discover/collect", async (route) => {
      await gate;
      const body = JSON.parse(route.request().postData() || "{}");
      const created = {
        ...job("pending_approval"),
        id: "job-discover-collect-1",
        candidate_key: body.candidate_key || KEY,
        connector_id: body.connector_id || "example_com_data",
        request: body,
      };
      await page.unroute("**/library/jobs*");
      await page.route("**/library/jobs*", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobs: [created] }),
        }),
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ job: created }),
      });
    });
    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Add to lab" }).click();
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Submitting");
    await shot(page, "02-desktop-submitting");
    release();
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Approval required");

    // 03 approval
    await shot(page, "03-desktop-approval-required");

    // 04 queued
    await openMops(page, { jobs: [job("queued")] });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Queued");
    await expect(page.locator('.rd-v2-eval-lifecycle-path [data-stage="approval"]')).toHaveAttribute(
      "data-reached",
      "false",
    );
    await expect(page.locator('.rd-v2-eval-lifecycle-path [data-stage="queue"]')).toHaveAttribute(
      "data-reached",
      "true",
    );
    await shot(page, "04-desktop-queued");

    // 05 running
    await openMops(page, {
      jobs: [job("running", { result: { stage: "Downloading files" } })],
    });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Running");
    await expect(page.locator('.rd-v2-eval-lifecycle-path [data-stage="approval"]')).toHaveAttribute(
      "data-reached",
      "false",
    );
    await expect(page.locator('.rd-v2-eval-lifecycle-path [data-stage="running"]')).toHaveAttribute(
      "data-reached",
      "true",
    );
    await shot(page, "05-desktop-running");

    // 06 failed
    await openMops(page, {
      jobs: [job("failed", { error: "HTTP 403 from source" })],
    });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Failed");
    await shot(page, "06-desktop-failed");

    // 07 registration pending
    await openMops(page, { jobs: [job("completed")] });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Registration pending");
    await shot(page, "07-desktop-registration-pending");

    // 08 registered — has dataset id, no query-readiness evidence
    await openMops(page, {
      jobs: [job("completed", { registered_dataset_id: "mops_financial_statements_2026" })],
    });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Registered in lab");
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).not.toContainText("Query ready");
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator('[aria-label="Can I use this"]')).toContainText(
      "Registered in lab",
    );
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator('[aria-label="Can I use this"]')).not.toContainText(
      "Acquisition available",
    );
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface")).toContainText("In lab · Registered");
    await shot(page, "08-desktop-registered");
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await expect(page.locator(".rd-v2-discover-candidate")).toContainText("In lab · Registered");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("1 in lab");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("0 query ready");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("0 external");

    // 09 query ready — registered + explicit readiness on job.result (catalog may lag)
    await openMops(page, {
      jobs: [
        job("completed", {
          registered_dataset_id: "mops_financial_statements_2026",
          result: { query_ready: true, analysis_readiness: "instant" },
        }),
      ],
    });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toContainText("Query ready");
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator('[aria-label="Can I use this"]')).toContainText(
      "In lab · Query ready",
    );
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator('[aria-label="Can I use this"]')).not.toContainText(
      "Acquisition available",
    );
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator('[aria-label="Still unknown"]')).not.toContainText(
      "Source endpoint not probed",
    );
    await shot(page, "09-desktop-query-ready");
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await expect(page.locator(".rd-v2-discover-candidate")).toContainText("In lab · Query ready");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("1 query ready");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("1 in lab");
    await expect(page.locator(".rd-v2-discover-pipeline-counts")).toContainText("0 external");

    // 10 Resources deep-link
    await openMops(page, { jobs: [job("pending_approval")] });
    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Review approval" }).click();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("MOPS");
    await shot(page, "10-desktop-resources-deep-link");

    // 11–12 tablet
    await page.setViewportSize({ width: 900, height: 1200 });
    await openMops(page, {
      jobs: [job("running", { result: { stage: "Downloading files" } })],
    });
    await shot(page, "11-tablet-running");
    await openMops(page, { jobs: [job("failed", { error: "HTTP 403 from source" })] });
    await shot(page, "12-tablet-failed");

    // 13–16 mobile — evaluation lives in the focused main workspace
    await page.setViewportSize({ width: 390, height: 1200 });
    await openMops(page, { jobs: [job("pending_approval")] });
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-lifecycle")).toBeVisible();
    await shot(page, "13-mobile-approval-required");

    await openMops(page, {
      jobs: [job("running", { result: { stage: "Downloading files" } })],
    });
    await shot(page, "14-mobile-running");

    await openMops(page, { jobs: [job("failed", { error: "HTTP 403 from source" })] });
    await shot(page, "15-mobile-failed");

    await openMops(page, {
      jobs: [
        job("completed", {
          registered_dataset_id: "mops_financial_statements_2026",
          result: { query_ready: true, analysis_readiness: "instant" },
        }),
      ],
    });
    await expect(page.locator('[data-testid="discover-eval-actions"] .rd-v2-btn.primary')).toContainText(
      "Open in Library",
    );
    await shot(page, "16-mobile-registered-open-library");
  });
});
