import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/library-estate";

const ESTATE_DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      local_ready: true,
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      join_keys: ["date", "country_iso3"],
      coverage: "2018–2024 · 13 Asian economies",
    },
    {
      dataset_id: "refinitiv_estimate_revision_panel",
      local_ready: true,
      name: "Estimate revision panel",
      description: "Point-in-time analyst estimate revision history",
      grain: "ric_day",
      analysis_readiness: "instant",
      local_root: "research_panels/refinitiv",
      source: "Refinitiv",
      coverage: "2017–2026",
    },
    {
      dataset_id: "idn_fry_daily_cross_section",
      local_ready: true,
      name: "Indonesia FRY daily cross section",
      description: "Daily issuer-level Indonesia equity research features",
      grain: "ticker_day",
      analysis_readiness: "instant",
      local_root: "research_panels/idn",
      source: "Indonesia equity pipeline",
      coverage: "2019–2026",
    },
    {
      dataset_id: "mops_financial_statements",
      local_ready: true,
      name: "MOPS financial statements",
      description: "Collected Taiwan listed-company financial statements",
      grain: "issuer_quarter",
      analysis_readiness: "metadata_search",
      domain: "procured",
      local_path: "data_lake/procured/mops_financials.csv",
      source: "MOPS",
      coverage: "2015–2026",
    },
    {
      dataset_id: "refinitiv_entity_market_spine",
      local_ready: true,
      name: "Entity market spine",
      description: "Canonical market identifiers and RIC mapping",
      grain: "ric_snapshot",
      analysis_readiness: "instant",
      local_path: "data_lake/entity_mapping/entity_market_spine.parquet",
      source: "Refinitiv",
    },
    {
      dataset_id: "usdt_bigquery_catalogue",
      in_lab: true,
      name: "USDT BigQuery catalogue",
      description: "Query-time access to public blockchain tables",
      analysis_readiness: "dry_run_before_execution",
      backend: "bigquery_public_dataset",
      source: "Google BigQuery",
    },
    {
      dataset_id: "external_dataset_catalog",
      local_ready: true,
      name: "External dataset catalogue",
      description: "Searchable metadata cards for known acquisition targets",
      analysis_readiness: "metadata_search",
      local_path: "data_lake/dataset_catalog/curated.jsonl",
      source: "Research Drive registry",
    },
    {
      dataset_id: "unclassified_registry_asset",
      local_ready: true,
      name: "Unclassified registry asset",
      description: "Registered asset awaiting readiness classification",
      local_path: "data_lake/misc/unclassified.json",
      source: "Lab registry",
    },
  ],
};

async function setup(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, { datasetsBody: ESTATE_DATASETS });
  await page.route("**/datasets/*", (route) => {
    const id = decodeURIComponent(route.request().url().split("/datasets/")[1]?.split("?")[0] || "");
    const row = ESTATE_DATASETS.datasets.find((dataset) => dataset.dataset_id === id) || ESTATE_DATASETS.datasets[0];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

async function selectAsset(page, title) {
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search your Library" }).fill(title);
  const row = page.getByTestId("library-evidence-row").filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test("Library readiness states read correctly in the side panel", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page, { width: 1440, height: 900 });
  await page.screenshot({ path: `${OUT}/01-desktop-root.png`, fullPage: false });

  const rail = page.locator("aside.rd-v2-rail");
  const states = [
    ["Asia daily news-risk panel", ["Can I use this?", "Ready to query"], [], "03-desktop-selected-query-ready"],
    ["MOPS financial statements", ["Metadata only"], [], "04-desktop-selected-metadata-only"],
    ["USDT BigQuery catalogue", ["Connected"], ["You can preview and query this dataset now."], "05-desktop-selected-connected"],
    ["Unclassified registry asset", ["Readiness unknown"], [], "06-desktop-selected-unknown"],
  ];
  for (const [title, present, absent, shot] of states) {
    await selectAsset(page, title);
    for (const text of present) await expect(rail).toContainText(text);
    for (const text of absent) await expect(rail).not.toContainText(text);
    await expect(rail.getByRole("button", { name: "Preview rows" })).toHaveCount(0);
    await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: false });
  }
});
