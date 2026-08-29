import { test, expect } from "@playwright/test";
import { MOCK_HEALTH, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

function emptyHealth() {
  return {
    ...MOCK_HEALTH,
    datasets: 0,
    desk: {
      ...MOCK_HEALTH.desk,
      jobs: { running: 0, pending_approval: 0 },
    },
  };
}

async function coldHome(page, seed) {
  await mockV2Api(page, {
    datasetsBody: { datasets: [] },
    jobsBody: { jobs: [] },
    healthBody: emptyHealth(),
    profileBody: {
      found: false,
      profile: {
        email: "researcher@example.test",
        unknown: true,
        starter_prompts: [],
      },
    },
  });
  await page.route("**/library/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seed),
    }),
  );
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test("cold researcher gets a useful seed without connected storage", async ({ page }) => {
  await coldHome(page, {
    version: 1,
    principal: { id: "researcher-1", display_name: "Researcher One" },
    bootstrap_mode: "yzu_profile_fallback",
    research_context: {
      profile_bound: true,
      profile_unknown: true,
      name: null,
      discipline: null,
      specialties: [],
      research_tracks: [],
      method_tags: [],
    },
    starter_prompts: [
      "Describe the research question you want to investigate",
      "Find evidence for my current research question",
    ],
    reference_holdings: [],
    procurement_recommendations: [],
    connected_sources: [],
    source_summary: { connected_sources: 0, reference_holdings: 0, procurement_candidates: 0 },
    policy: {
      connected_storage_optional: true,
      seed_without_connected_storage: true,
      automatic_byte_copy: false,
      automatic_recursive_cloud_index: false,
      materialization_requires_explicit_operation: true,
    },
  });

  const seed = page.getByTestId("home-research-seed");
  await expect(seed).toBeVisible();
  await expect(seed).toHaveAttribute("data-bootstrap-mode", "yzu_profile_fallback");
  await expect(seed).toContainText("Research desk ready");
  await expect(page.getByTestId("home-research-seed-sources")).toContainText("No connected storage required");
  await expect(seed.getByText("Describe the research question you want to investigate")).toBeVisible();
  await expect(seed).not.toContainText("Lab Drive");
});

test("verified connected storage is additive to the same cold-start seed", async ({ page }) => {
  await coldHome(page, {
    version: 1,
    principal: { id: "researcher-1", display_name: "Researcher One" },
    bootstrap_mode: "generic_cold_start",
    research_context: {
      profile_bound: false,
      profile_unknown: true,
      name: null,
      discipline: null,
      specialties: [],
      research_tracks: [],
      method_tags: [],
    },
    starter_prompts: ["Start from a research question"],
    reference_holdings: [],
    procurement_recommendations: [],
    connected_sources: [
      {
        id: "lab-drive",
        kind: "connected_storage",
        provider: "google_drive",
        label: "Lab Drive",
        access_mode: "index",
        status: "verified",
        capabilities: { metadata_index: true, read: false, write: false },
      },
    ],
    source_summary: { connected_sources: 1, reference_holdings: 0, procurement_candidates: 0 },
    policy: {
      connected_storage_optional: true,
      seed_without_connected_storage: true,
      automatic_byte_copy: false,
      automatic_recursive_cloud_index: false,
      materialization_requires_explicit_operation: true,
    },
  });

  const seed = page.getByTestId("home-research-seed");
  await expect(seed).toBeVisible();
  await expect(seed).toHaveAttribute("data-bootstrap-mode", "generic_cold_start");
  await expect(page.getByTestId("home-research-seed-sources")).toContainText("1 verified connected source");
  await expect(page.getByTestId("home-research-seed-connected-labels")).toHaveText("Lab Drive");
  await expect(seed.getByText("Start from a research question")).toBeVisible();
  await expect(seed).not.toContainText("upstream-");
  await expect(seed).not.toContainText("rd_internal_");
});
