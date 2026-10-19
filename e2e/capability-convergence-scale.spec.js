import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const SOURCES = ["GDELT", "MOPS", "DataCite", "BigQuery", "OpenAlex", "Self-provided", "World Bank", "SEC EDGAR"];
const TOPICS = ["market stress", "governance", "news attention", "transactions", "firm fundamentals", "climate exposure", "exchange activity", "research references"];

const SCALE_DATASETS = Array.from({ length: 48 }, (_, index) => {
  const n = index + 1;
  const source = SOURCES[index % SOURCES.length];
  const topic = TOPICS[index % TOPICS.length];
  const isPaper = index % 11 === 0;
  const isMetadata = !isPaper && index % 9 === 0;
  const readiness = isPaper || isMetadata ? "metadata_search" : index % 7 === 0 ? "registered" : "instant";
  return {
    dataset_id: `scale_asset_${String(n).padStart(2, "0")}`,
    name: isPaper ? `Research reference ${n}: ${topic}` : isMetadata ? `${source} ${topic} catalogue ${n}` : `${topic.replace(/\b\w/g, (m) => m.toUpperCase())} evidence ${n}`,
    description: isPaper
      ? `Scholarly evidence relevant to ${topic}, retained for citation and research grounding.`
      : isMetadata
        ? `Searchable source metadata describing available ${topic} evidence and coverage.`
        : `Reusable ${topic} evidence retained for empirical research and downstream construction.`,
    source,
    source_system: source,
    analysis_readiness: readiness,
    grain: isPaper || isMetadata ? "procured_snapshot" : index % 2 ? "entity-week" : "country-day",
    access_shape: isPaper ? "scholarly_record" : isMetadata ? "metadata_index" : "table",
    doi: isPaper ? `10.5281/zenodo.${58000 + n}` : undefined,
    research_asset_kind: isPaper ? "scholarly_work" : isMetadata ? "metadata_index" : "dataset",
    join_keys: isPaper || isMetadata ? [] : index % 2 ? ["entity_id", "week"] : ["country_iso3", "date"],
    coverage: isPaper || isMetadata ? "Not declared" : `${2016 + (index % 5)}–2026`,
  };
});

test("Library remains legible as an evidence estate at inventory scale", async ({ page }) => {
  await mockV2Api(page, {
    datasetsBody: { datasets: SCALE_DATASETS },
    healthBody: {
      status: "ok",
      datasets: SCALE_DATASETS.length,
      desk: {
        jobs: { running: 1, pending_approval: 1 },
        composer_configured: true,
        storage_tiers: { canonical: { quota_tb: 5, used_tb: 2.1 } },
        gdrive: { ok: true },
      },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const estate = page.getByTestId("library-evidence-estate");
  await expect(estate).toBeVisible();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(48);
  await expect(estate).toContainText("Scholarly work");
  await expect(estate).toContainText("Metadata index");

  mkdirSync("artifacts/capability-convergence", { recursive: true });
  await page.screenshot({
    path: "artifacts/capability-convergence/library-scale-48-1440x900.png",
    fullPage: false,
  });
});
