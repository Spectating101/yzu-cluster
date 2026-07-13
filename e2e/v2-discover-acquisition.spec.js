import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function openAcquisitionWorkspace(page, jobsBody) {
  await mockV2Api(page, { jobsBody });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("tab", { name: "Collection routes", exact: true }).click();
  return page.getByTestId("discover-routes-mode");
}

test.describe("Discover acquisition engineering", () => {
  test("presents acquisition design before operational detail", async ({ page }) => {
    const routes = await openAcquisitionWorkspace(page, {
      jobs: [
        {
          id: "job-plan-1",
          status: "pending_approval",
          title: "Historical stablecoin attention evidence",
          plan: { connector_id: "gdelt_events", refresh_strategy: "Weekly backfill, then daily refresh" },
          request: {
            candidate_key: "source:gdelt-events",
            connector_id: "gdelt_events",
            limit: 500,
            dataset_id: "gdelt_stablecoin_attention",
          },
          created_at: "2026-07-13T14:00:00Z",
        },
      ],
    });

    await expect(routes).toContainText("Acquisition plan");
    await expect(routes).toContainText("Decision");
    await expect(routes).toContainText("Acquisition decision");
    await page.screenshot({ path: "test-results/discover-acquisition-overview.png" });

    await routes.getByRole("button", { name: /Historical stablecoin attention evidence/i }).click();
    await expect(routes).toContainText("Access checkpoint");
    await expect(routes).toContainText("Collection scope");
    await expect(routes).toContainText("Refresh design");
    await expect(routes).toContainText("Weekly backfill, then daily refresh");
    await page.screenshot({ path: "test-results/discover-acquisition-detail.png" });
  });

  test("does not promote archive or unknown evidence into registered state", async ({ page }) => {
    const routes = await openAcquisitionWorkspace(page, {
      jobs: [
        {
          id: "job-archive-1",
          status: "completed",
          title: "Archived external panel",
          plan: { connector_id: "public_dump" },
          result: {
            drive_finalize: {
              archives: [{ remote_suffix: "collection/derived/archived_external_panel" }],
            },
          },
          updated_at: "2026-07-13T14:30:00Z",
        },
        {
          id: "job-unknown-1",
          status: "mystery_state",
          title: "Unclassified route",
          updated_at: "2026-07-13T14:31:00Z",
        },
      ],
    });

    const archivedRow = routes.getByRole("button", { name: /Archived external panel/i });
    await expect(archivedRow).toContainText("Archived · registration pending");
    await expect(routes.getByRole("button", { name: /Unclassified route/i })).toContainText("State unverified");

    await archivedRow.click();
    await expect(routes).toContainText("Drive archive");
    await expect(routes).toContainText("registration is not claimed");
  });
});
