import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-serp-capture";

function source(id, title, provider, extra = {}) {
  return {
    kind: "source",
    source_id: id,
    candidate_key: `source:${id}`,
    title,
    provider,
    description: extra.description || `${title} research-data source.`,
    access_mode: extra.reference ? "catalog_reference" : (extra.access_mode || "procurement_catalog"),
    status: extra.reference ? "example_reference" : undefined,
    collect_via: extra.collect_via || "http_manifest",
    query_relevance: extra.reference ? undefined : (extra.query_relevance ?? 2),
    coverage: extra.coverage,
    refresh_frequency: extra.refresh,
    grain: extra.grain,
    recommended_use: extra.recommended_use,
    ...extra,
  };
}

function resultFixture() {
  return {
    discoverBody: {
      sections: [{
        id: "library",
        rows: [{
          kind: "registry_dataset",
          dataset_id: "stablecoin_local",
          candidate_key: "dataset:stablecoin_local",
          title: "Stablecoin transfer event sample",
          description: "Held event-level evidence for historical stablecoin transfer activity.",
          local_ready: true,
          query_ready: true,
          collect_via: "local_open",
          coverage: "Ethereum transfer events · 2021–2025",
          grain: "transfer event",
        }],
      }],
      total: 1,
    },
    discoverSourcesBody: {
      results: [
        source("datacite_live", "DataCite live catalogue", "DataCite", {
          dataset_id: "datacite_10.5281_zenodo.58938",
          candidate_key: "source:datacite:live",
          access_mode: "live_connector",
          collect_via: "datacite",
          query_relevance: 4,
          description: "Searchable scholarly and research-data catalogue with DOI-level records.",
          coverage: "Research datasets · DOI metadata",
          refresh: "live catalogue",
          grain: "dataset / DOI record",
          recommended_use: "Find citable research datasets and trace identifiers, creators, repositories, and related metadata.",
          format: "JSON API",
          capabilities: ["Search DOI metadata", "Filter dataset records", "Resolve DOI records", "Page through results"],
        }),
        source("mops_governance", "MOPS governance disclosures", "MOPS", {
          query_relevance: 2,
          description: "Official issuer disclosures for governance and board variables.",
          coverage: "Taiwan issuers · governance filings",
          refresh: "filing cycle",
          grain: "issuer × filing / period",
          recommended_use: "Build board, ownership, governance, and disclosure variables for Taiwan-listed issuers.",
        }),
        source("zenodo_stablecoin", "SoK: Stablecoins for Digital Transformation v1.0.0", "Zenodo", {
          kind: "artifact",
          collect_via: "zenodo",
          query_relevance: 4,
          description: "Replication bundle with datasets, notebooks, figures, and analysis scripts published as a citable research deposit.",
          coverage: "Stablecoin research replication · datasets · notebooks · figures · scripts",
          refresh: "versioned deposit",
          grain: "replication bundle / file",
          recommended_use: "Reuse a citable stablecoin replication package and inspect the exact files behind published analysis.",
          format: "ZIP",
          file_count: 1,
          size_label: "8.4 MB",
          version: "v1.0.0",
          license: "MIT",
        }),
        source("coingecko_market", "CoinGecko market-history endpoints", "CoinGecko", {
          query_relevance: 3,
          description: "Historical prices, market capitalization, volume, exchange metadata, and asset identifiers.",
          coverage: "Prices · market cap · volume · exchanges · asset IDs",
          refresh: "daily / intraday",
          grain: "asset × timestamp / exchange",
          recommended_use: "Construct crypto market histories and join assets consistently across exchanges and time.",
        }),
        source("kaggle_stablecoin_snapshot", "Stablecoin Market Daily Snapshot", "Kaggle", {
          kind: "dataset",
          query_relevance: 5,
          description: "Daily USD-pegged stablecoin snapshot with market, peg-status, liquidity, and trading measures.",
          coverage: "USD-pegged stablecoins · daily market and peg state",
          refresh: "published snapshot",
          grain: "stablecoin × day",
          recommended_use: "Compare peg stability, market capitalization, liquidity, and trading conditions across stablecoins.",
          format: "CSV",
          file_count: 1,
          column_count: 23,
          columns: ["symbol", "price_usd", "peg_deviation", "peg_status", "market_cap_usd", "volume_24h_usd"],
          license: "CC BY-NC-SA 4.0",
          preview_supported: true,
        }),
        source("fred_macro", "FRED macro-financial series", "Federal Reserve Bank of St. Louis", {
          query_relevance: 2,
          coverage: "Rates · liquidity · risk · macro controls",
          refresh: "series dependent",
          grain: "series × observation date",
          recommended_use: "Add macro-financial controls and event-window context to empirical panels.",
        }),
        source("worldbank_indicators", "World Bank indicator catalogue", "World Bank", {
          kind: "dataset",
          query_relevance: 2,
          description: "Country and economy indicators that can supply macro and institutional covariates.",
          coverage: "Country indicators · long panels",
          refresh: "annual / periodic",
          grain: "economy × indicator × period",
          recommended_use: "Build long-run country panels and institutional or development controls.",
          temporal_coverage: "1960–2025",
          geographic_coverage: "200+ countries and territories",
          variables: ["1,500+ development indicators"],
          format: "CSV · Excel · API",
          size_label: "CSV 269.7 MB · Excel 77.9 MB",
          periodicity: "Annual",
          license: "CC BY 4.0",
          preview_supported: true,
        }),
        source("hf_stablecoin_flows", "Stablecoin Flows", "Hugging Face", {
          kind: "artifact",
          collect_via: "huggingface",
          query_relevance: 4,
          description: "Machine-readable stablecoin flow dataset distributed as Parquet with repository manifest and schema metadata.",
          coverage: "Stablecoin transfer and flow records",
          refresh: "nightly repository update",
          grain: "transfer / flow record",
          recommended_use: "Analyze stablecoin movement and flow structure from a directly inspectable machine-readable package.",
          format: "Parquet",
          files: ["flows/date=YYYY-MM-DD/part-0000.parquet", "_manifest.json", "_schema.json"],
          size_label: "30.3 MB",
          row_count: 278922,
          column_count: 16,
          columns: ["amount", "block_time", "flow_type", "stablecoin", "from_address", "to_address", "tx_hash"],
          temporal_coverage: "2026-05-09 – 2026-08-28",
          geographic_coverage: "Ethereum",
          license: "CC BY 4.0",
          preview_supported: true,
        }),
        source("sec_edgar", "SEC EDGAR issuer filings", "SEC", {
          query_relevance: 2,
          coverage: "US issuer filings · disclosures · event dates",
          refresh: "filing stream",
          grain: "issuer × filing",
          recommended_use: "Recover official disclosure text, filing dates, and issuer-level events.",
        }),
        source("twse_market", "TWSE market data route", "TWSE", {
          query_relevance: 2,
          coverage: "Taiwan listed firms · trading · issuer reference",
          refresh: "trading day",
          grain: "security × trading day",
          recommended_use: "Build Taiwan security-level market panels and issuer-reference joins.",
        }),
        source("openalex_reference", "OpenAlex literature graph", "OpenAlex", { reference: true, coverage: "Papers · authors · concepts · citations" }),
        source("crossref_reference", "Crossref DOI metadata", "Crossref", { reference: true, coverage: "DOI metadata · publication context" }),
        source("twse_reference", "TWSE market reference", "TWSE", { reference: true, coverage: "Market structure · issuer context" }),
        source("coingecko_reference", "CoinGecko market-data reference", "CoinGecko", { reference: true, coverage: "Asset IDs · exchange context" }),
      ],
    },
  };
}

async function openAndSearch(page) {
  await mockV2Api(page, resultFixture());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?tab=discover");
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  const composer = page.getByLabel("Search or describe a research need");
  await composer.fill("stablecoin market evidence");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.locator(".rd-v2-discover-ranked-results")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".rd-v2-discover-ranked-results .rd-v2-discover-candidate")).toHaveCount(10, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

test.describe("Discover SERP pixel capture", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  test("results 1920", async ({ page }) => {
    await openAndSearch(page);
    await page.screenshot({ path: `${OUT}/discover-serp-results-1920.png`, fullPage: false });
  });

  test("selected 1920", async ({ page }) => {
    await openAndSearch(page);
    const row = page.locator(".rd-v2-discover-ranked-results").getByRole("button", { name: /DataCite live catalogue/i });
    await row.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/discover-serp-selected-1920.png`, fullPage: false });
  });
});
