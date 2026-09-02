import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  MOCK_CATALOG,
  MOCK_JOBS,
  MOCK_DISCOVER_ASSESSMENT,
  MOCK_STABLECOIN_ASSESSMENT,
  mockV2Api,
} from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-reconvergence";
const DATACITE_DATASET_ID = "datacite_10.5281_zenodo.58938";

function candidate({
  title,
  source,
  kind = "dataset",
  description,
  candidateKey,
  datasetId,
  collectVia,
  accessMode,
  status,
  url,
  coverage,
  columns,
  rowCount,
  columnCount,
  fileCount,
  size,
  grain,
  temporalCoverage,
  geography,
  format,
  refresh,
  license,
  version,
  capabilities,
  recommendedUse,
  previewSupported,
  queryRelevance = 1,
}) {
  return {
    kind,
    title,
    source,
    description,
    candidate_key: candidateKey,
    dataset_id: datasetId,
    collect_via: collectVia,
    access_mode: accessMode,
    status,
    url,
    coverage,
    columns,
    row_count: rowCount,
    column_count: columnCount,
    file_count: fileCount,
    size,
    grain,
    temporal_coverage: temporalCoverage,
    geographic_coverage: geography,
    format,
    refresh_frequency: refresh,
    license,
    version,
    capabilities,
    recommended_use: recommendedUse,
    preview_supported: previewSupported,
    query_relevance: queryRelevance,
    relevance_evidence: ["fixture relevance"],
    match_mode: "fixture",
  };
}

function resultFixture() {
  return {
    catalog: MOCK_CATALOG,
    jobs: MOCK_JOBS,
    discoverAssessmentBody: MOCK_STABLECOIN_ASSESSMENT,
    discoverResults: {
      results: [
        {
          ...MOCK_CATALOG[0],
          query_relevance: 1,
          relevance_evidence: ["held stablecoin evidence"],
          match_mode: "fixture",
        },
        candidate({
          title: "Stablecoin Market Daily Snapshot",
          source: "Kaggle",
          description: "Daily USD-pegged stablecoin snapshot with market, peg-status, liquidity, and trading measures.",
          candidateKey: "kaggle:stablecoin-market-daily",
          collectVia: "direct_file",
          accessMode: "direct_file",
          status: "candidate",
          url: "https://www.kaggle.com/datasets/example/stablecoin-market-daily",
          coverage: "USD-pegged stablecoins · daily market and peg state",
          columns: ["symbol", "price_usd", "peg_deviation", "peg_status", "market_cap_usd", "volume_24h_usd"],
          columnCount: 23,
          fileCount: 1,
          grain: "stablecoin × day",
          format: "CSV",
          refresh: "published snapshot",
          license: "CC BY-NC-SA 4.0",
          recommendedUse: "Compare peg stability, market capitalization, liquidity, and trading conditions across stablecoins.",
          previewSupported: true,
        }),
        candidate({
          title: "SoK: Stablecoins for Digital Transformation v1.0.0",
          source: "Zenodo",
          description: "Replication bundle with datasets, notebooks, figures, and analysis scripts published as a citable research deposit.",
          candidateKey: "zenodo:stablecoin-sok-v1",
          collectVia: "direct_file",
          accessMode: "direct_file",
          status: "candidate",
          url: "https://zenodo.org/records/0000000",
          coverage: "Stablecoin research replication · datasets · notebooks · figures · scripts",
          capabilities: ["Stablecoin research replication", "datasets", "notebooks", "figures", "scripts"],
          fileCount: 1,
          size: "8.4 MB",
          grain: "replication bundle / file",
          format: "ZIP",
          refresh: "versioned deposit",
          license: "MIT",
          version: "1.0.0",
          recommendedUse: "Reuse a citable stablecoin replication package and inspect the exact files behind published analysis.",
        }),
        candidate({
          title: "Stablecoin Flows",
          source: "Hugging Face",
          description: "Machine-readable stablecoin flow dataset distributed as Parquet with repository manifest and schema metadata.",
          candidateKey: "hf:stablecoin-flows",
          collectVia: "direct_file",
          accessMode: "direct_file",
          status: "candidate",
          url: "https://huggingface.co/datasets/example/stablecoin-flows",
          coverage: "Stablecoin transfer and flow records",
          columns: ["amount", "block_time", "flow_type", "stablecoin", "from_address", "to_address"],
          rowCount: 279000,
          columnCount: 16,
          fileCount: 3,
          size: "30.3 MB",
          grain: "transfer / flow record",
          temporalCoverage: "2026-05-09 – 2026-08-28",
          geography: "Ethereum",
          format: "Parquet",
          refresh: "nightly repository update",
          license: "CC BY 4.0",
          recommendedUse: "Analyze stablecoin movement and flow structure from a directly inspectable machine-readable package.",
          previewSupported: true,
        }),
        candidate({
          title: "DataCite live catalogue",
          source: "DataCite",
          kind: "connector",
          description: "Searchable scholarly and research-data catalogue with DOI-level records.",
          candidateKey: `dataset:${DATACITE_DATASET_ID}`,
          datasetId: DATACITE_DATASET_ID,
          collectVia: "datacite",
          accessMode: "api",
          status: "candidate",
          url: "https://api.datacite.org/dois",
          coverage: "Research datasets · DOI metadata",
          capabilities: ["Search DOI metadata", "Filter dataset records", "Resolve DOI records", "Page through results"],
          grain: "dataset / DOI record",
          format: "JSON API",
          refresh: "live catalogue",
          recommendedUse: "Find citable research datasets and trace their identifiers, creators, repositories, and related metadata.",
        }),
        candidate({
          title: "MOPS governance disclosures",
          source: "MOPS",
          kind: "connector",
          description: "Official issuer disclosures for governance and board variables.",
          candidateKey: "connector:mops-governance",
          collectVia: "mops",
          accessMode: "api",
          status: "candidate",
          url: "https://mops.twse.com.tw/",
          coverage: "Taiwan issuers · governance filings",
          capabilities: ["Taiwan issuers", "board composition", "governance filings"],
          grain: "issuer × filing / period",
          refresh: "filing cycle",
          recommendedUse: "Build board, ownership, governance, and disclosure variables for Taiwan-listed issuers.",
        }),
        candidate({
          title: "CoinGecko market-history endpoints",
          source: "CoinGecko",
          kind: "connector",
          description: "Historical crypto market series and coin metadata through declared API endpoints.",
          candidateKey: "connector:coingecko-history",
          collectVia: "coingecko",
          accessMode: "api",
          status: "candidate",
          url: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
          coverage: "Crypto assets · price · market cap · volume",
          capabilities: ["historical price", "market cap", "volume", "coin metadata"],
          grain: "asset × timestamp",
          format: "JSON API",
          refresh: "provider endpoint",
          recommendedUse: "Retrieve historical market measures and asset metadata for crypto-market research.",
        }),
        candidate({
          title: "DefiLlama stablecoin supply history",
          source: "DefiLlama",
          kind: "connector",
          description: "Stablecoin supply and chain distribution histories from public DeFi data routes.",
          candidateKey: "connector:defillama-stables",
          collectVia: "defillama",
          accessMode: "api",
          status: "candidate",
          url: "https://stablecoins.llama.fi/stablecoins",
          coverage: "Stablecoins · supply · chains",
          capabilities: ["stablecoin supply", "chain distribution", "historical balances"],
          grain: "stablecoin × chain × date",
          format: "JSON API",
          refresh: "live provider route",
          recommendedUse: "Study supply changes and chain distribution across stablecoins.",
        }),
        candidate({
          title: "FRED macro-financial series",
          source: "FRED",
          kind: "connector",
          description: "Federal Reserve economic time-series catalogue for rates, prices, and financial conditions.",
          candidateKey: "connector:fred-series",
          collectVia: "fred",
          accessMode: "api",
          status: "candidate",
          url: "https://fred.stlouisfed.org/",
          coverage: "Macro-financial time series",
          capabilities: ["interest rates", "inflation", "financial conditions", "macro controls"],
          grain: "series × date",
          format: "JSON / CSV API",
          refresh: "series-specific",
          recommendedUse: "Add macro-financial controls to stablecoin and market-event research.",
        }),
        candidate({
          title: "World Bank indicator catalogue",
          source: "World Bank",
          kind: "connector",
          description: "Country and indicator catalogue for macroeconomic and development variables.",
          candidateKey: "connector:world-bank-indicators",
          collectVia: "world_bank",
          accessMode: "api",
          status: "candidate",
          url: "https://api.worldbank.org/",
          coverage: "Countries · indicators · annual and periodic series",
          capabilities: ["country indicators", "macroeconomics", "development variables"],
          grain: "country × indicator × period",
          format: "JSON / XML API",
          refresh: "indicator-specific",
          recommendedUse: "Join country-level macro controls to cross-market research designs.",
        }),
        candidate({
          title: "IMF Data API catalogue",
          source: "IMF",
          kind: "connector",
          description: "International macroeconomic datasets and series metadata through IMF data routes.",
          candidateKey: "connector:imf-data",
          collectVia: "imf",
          accessMode: "api",
          status: "candidate",
          url: "https://www.imf.org/en/Data",
          coverage: "International macroeconomic series",
          capabilities: ["macroeconomic series", "country data", "financial statistics"],
          grain: "economy × series × period",
          format: "API response",
          refresh: "dataset-specific",
          recommendedUse: "Supply international macroeconomic controls and financial-system context.",
        }),
        candidate({
          title: "SEC EDGAR issuer filings",
          source: "SEC EDGAR",
          kind: "connector",
          description: "Issuer filing and disclosure route for US-listed companies and registrants.",
          candidateKey: "connector:sec-edgar",
          collectVia: "sec_edgar",
          accessMode: "api",
          status: "candidate",
          url: "https://www.sec.gov/edgar/sec-api-documentation",
          coverage: "US issuers · filing metadata · disclosures",
          capabilities: ["filings", "issuer metadata", "disclosures"],
          grain: "issuer × filing",
          format: "JSON / filing documents",
          refresh: "filing cycle",
          recommendedUse: "Trace issuer disclosures and regulatory filings for stablecoin-linked public companies.",
        }),
        candidate({
          title: "TWSE market data route",
          source: "TWSE",
          kind: "connector",
          description: "Taiwan exchange market-data route for listed securities and official market observations.",
          candidateKey: "connector:twse-market",
          collectVia: "twse",
          accessMode: "api",
          status: "candidate",
          url: "https://openapi.twse.com.tw/",
          coverage: "Taiwan listed securities · market observations",
          capabilities: ["market observations", "listed securities", "issuer identifiers"],
          grain: "security × date",
          format: "JSON API",
          refresh: "market day",
          recommendedUse: "Add Taiwan market observations and issuer identifiers to listed-company research.",
        }),
        candidate({
          title: "OpenAlex research context",
          source: "OpenAlex",
          kind: "paper",
          description: "Research-literature context for interpreting stablecoin and governance evidence.",
          candidateKey: "reference:openalex-stablecoin",
          accessMode: "catalog_reference",
          status: "example_reference",
          url: "https://openalex.org/",
          coverage: "Scholarly works · citations · concepts",
        }),
        candidate({
          title: "Crossref DOI context",
          source: "Crossref",
          kind: "paper",
          description: "DOI and publication metadata useful for tracing related research outputs.",
          candidateKey: "reference:crossref-doi",
          accessMode: "catalog_reference",
          status: "example_reference",
          url: "https://api.crossref.org/",
          coverage: "DOI metadata · publications",
        }),
        candidate({
          title: "TWSE market reference",
          source: "TWSE",
          kind: "web_hit",
          description: "Official market reference material related to the Taiwan exchange route.",
          candidateKey: "reference:twse-market",
          accessMode: "catalog_reference",
          status: "example_reference",
          url: "https://www.twse.com.tw/",
          coverage: "Taiwan market reference",
        }),
        candidate({
          title: "CoinGecko market-data reference",
          source: "CoinGecko",
          kind: "web_hit",
          description: "Asset and exchange reference context that can help interpret market-data candidates.",
          candidateKey: "reference:coingecko-market",
          accessMode: "catalog_reference",
          status: "example_reference",
          url: "https://www.coingecko.com/",
          coverage: "Asset IDs · exchange context",
        }),
      ],
    },
  };
}

async function openDiscover(page, suffix = "") {
  await page.goto(`/?tab=discover${suffix}`);
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
}

async function runSearch(page, query = "stablecoin") {
  const composer = page.getByTestId("discover-composer-input");
  await composer.fill(query);
  await composer.press("Enter");
  await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
  await expect(page.getByTestId("discover-evidence-field")).toContainText(/10 candidates/i);
  await expect(page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate")).toHaveCount(10);
}

async function assertNoOverflow(page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
}

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

test.describe("Discover reconvergence visual review", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  for (const viewport of viewports) {
    test(`resting retrieval workspace ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await expect(page.locator(".rd-v2-discover-composer-examples")).toBeHidden();
      await expect(page.getByText("Sources the desk already knows how to investigate", { exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-resting-${viewport.name}.png`, fullPage: false });
    });

    test(`large active evidence field ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page);
      const resultsBox = await page.getByTestId("discover-ranked-results").boundingBox();
      expect(resultsBox).not.toBeNull();
      if (viewport.width >= 1680) {
        await expect(page.getByTestId("discover-evidence-field")).toBeHidden();
        await expect(page.getByTestId("discover-interpreting")).toBeVisible();
        await expect(page.getByTestId("discover-sort-menu")).toBeVisible();
        const firstResultBox = await page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate").first().boundingBox();
        expect(firstResultBox).not.toBeNull();
        expect(firstResultBox.y).toBeLessThan(430);
      } else {
        const fieldBox = await page.getByTestId("discover-evidence-field").boundingBox();
        expect(fieldBox).not.toBeNull();
        expect(resultsBox.y - (fieldBox.y + fieldBox.height)).toBeLessThan(38);
      }
      const profiles = page.getByTestId("discover-ranked-results").locator(".rd-v2-dataset-profile");
      await expect(profiles).toHaveCount(10);
      await expect(page.getByTestId("discover-ranked-results").locator('.rd-v2-dataset-profile.is-dataset').first()).toContainText(/variables|contents|fields|stablecoin/i);
      await expect(page.getByTestId("discover-ranked-results").locator('.rd-v2-dataset-profile.is-route').first()).toContainText(/data source|return|inspect|metadata|record/i);
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-results-${viewport.name}.png`, fullPage: false });
    });

    test(`selected evidence evaluation ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page);
      const dataciteRow = page.getByTestId("discover-ranked-results").getByRole("button", { name: /DataCite live catalogue/i });
      await dataciteRow.click();
      await expect(dataciteRow).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("heading", { name: "DataCite live catalogue", exact: true }).last()).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-selected-${viewport.name}.png`, fullPage: false });
    });

    test(`research-question assembly field ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, {
        ...resultFixture(),
        discoverAssessmentBody: MOCK_DISCOVER_ASSESSMENT,
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page, "Do we hold issuer-quarter governance data for Taiwan?");

      const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
      const assembly = page.getByTestId("discover-assembly-path");
      if (viewport.width >= 1680) {
        const assessmentRail = page.getByRole("region", { name: "Evidence assessment summary" });
        await expect(assessmentRail).toBeVisible();
        await expect(assessmentRail).toContainText(/Partially covered/i);
        await expect(assessmentRail).toContainText(/Board-governance variables/i);
        await expect(assessmentRail).toContainText(/Held evidence/i);
        await expect(assembly).toBeHidden();
      } else {
        await expect(workspace).toBeVisible();
        await expect(workspace).toContainText(/Partially covered/i);
        await expect(workspace).toContainText(/Board-governance variables/i);
        await expect(assembly).toBeVisible();
        await expect(assembly).toContainText(/Board-governance variables/i);
        const details = workspace.locator(".rd-v2-evidence-detail-disclosure.is-workspace");
        await expect(details).toBeVisible();
        expect(await details.evaluate((node) => node.open)).toBe(false);
      }
      const firstResult = page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate").first();
      const firstResultBox = await firstResult.boundingBox();
      expect(firstResultBox).not.toBeNull();
      expect(firstResultBox.y).toBeLessThan(viewport.height);
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-investigation-${viewport.name}.png`, fullPage: false });
    });
  }

  test("raw DataCite Discover deep link binds the named source", async ({ page }) => {
    await mockV2Api(page, resultFixture());
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openDiscover(page, `&dataset=${DATACITE_DATASET_ID}`);
    await expect(page.getByRole("heading", { name: "DataCite live catalogue", exact: true }).last()).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-deeplink-datacite-1920x1080.png`, fullPage: false });
  });
});
