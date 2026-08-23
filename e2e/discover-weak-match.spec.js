import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const weakHeldRows = [
  ["nhanes_demographics", "NHANES 2017–2018 Demographics"],
  ["mops_governance", "Taiwan listed-company governance misconduct events"],
  ["nhanes_health", "NHANES Health Survey Data Files"],
].map(([dataset_id, title], index) => ({
  kind: "registry_dataset",
  dataset_id,
  candidate_key: `dataset:${dataset_id}`,
  title,
  local_ready: true,
  collect_via: "local_open",
  score: 0.26 - index * 0.01,
}));

const clinicalRoute = {
  kind: "live_candidate",
  source_id: "clinical_trials_hub",
  candidate_key: "source:hugging_face:clinical-trial-outcomes",
  provider: "Hugging Face",
  title: "Clinical Trial Outcomes",
  url: "https://huggingface.co/datasets/example/clinical-trial-outcomes",
  access_mode: "public_hub",
  collect_via: ["huggingface"],
  live_hit: true,
  query_relevance: 3,
  relevance_evidence: [{ type: "distinctive_token_overlap", score: 3 }],
};

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
}

test.describe("Discover weak-match continuation", () => {
  test("weak held neighbours stay visible while a direct source route is found", async ({ page }) => {
    await mockV2Api(page, {
      datasetsBody: { datasets: weakHeldRows },
      discoverBody: {
        sections: [{ id: "discover", rows: weakHeldRows }],
        total: weakHeldRows.length,
        index_miss: true,
        weak_match: true,
        retrieval: { keyword: 0, semantic: weakHeldRows.length, semantic_top_score: 0.26 },
      },
      discoverSourcesBody: { results: [], total: 0 },
      discoverLiveSourcesBody: { results: [clinicalRoute], total: 1 },
      discoverLiveSourcesDelayMs: 1_000,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await search(page, "clinical trial outcomes");

    const summary = page.getByTestId("discover-result-summary");
    await expect(summary).toContainText("Library evidence · 3");
    await expect(summary.getByRole("status")).toContainText("Checking broader sources");
    await expect(page.getByLabel("Discover next actions")).toContainText(
      "Related Library evidence remains visible",
    );

    await expect(page.getByText("Clinical Trial Outcomes", { exact: true })).toBeVisible();
    await expect(summary).toContainText("Available · 1");
    await expect(summary).toContainText("Library evidence · 3");
    await expect(summary.getByRole("status")).toHaveCount(0);
  });

  test("a strong short Library match does not fan out automatically", async ({ page }) => {
    let liveRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.endsWith("/library/discover/sources")
        && (url.searchParams.get("live") === "1" || url.searchParams.get("semantic") === "1")
      ) liveRequests += 1;
    });
    const held = [{
      kind: "registry_dataset",
      dataset_id: "stablecoin_weekly",
      candidate_key: "dataset:stablecoin_weekly",
      title: "Weekly stablecoin trust and engagement panel",
      local_ready: true,
      collect_via: "local_open",
      score: 0.49,
    }];
    await mockV2Api(page, {
      datasetsBody: { datasets: held },
      discoverBody: {
        sections: [{ id: "discover", rows: held }],
        total: 1,
        index_miss: false,
        weak_match: false,
      },
      discoverSourcesBody: { results: [], total: 0 },
      discoverLiveSourcesBody: { results: [clinicalRoute], total: 1 },
    });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await search(page, "stablecoin");
    await expect(page.getByTestId("discover-result-summary")).toContainText("Library evidence · 1");
    await page.waitForTimeout(1_000);
    expect(liveRequests).toBe(0);
  });
});
