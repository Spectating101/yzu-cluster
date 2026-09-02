import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_ASSESSMENT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-reconvergence";
const DATACITE_DATASET_ID = "datacite_10.5281_zenodo.58938";

function source({
  id,
  title,
  description,
  provider,
  collectVia = "http_manifest",
  reference = false,
  accessMode = "procurement_catalog",
  coverage,
  refresh,
  grain,
  recommendedUse,
  ...extra
}) {
  return {
    kind: "source",
    source_id: id,
    candidate_key: `source:${id}`,
    title,
    description,
    provider,
    access_mode: reference ? "catalog_reference" : accessMode,
    status: reference ? "example_reference" : undefined,
    collect_via: Array.isArray(collectVia) ? collectVia : collectVia,
    query_relevance: reference ? undefined : 2,
    coverage,
    refresh_frequency: refresh,
    grain,
    recommended_use: recommendedUse,
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
        {
          ...source({
            id: "datacite_live",
            title: "DataCite live catalogue",
            description: "Searchable scholarly and research-data catalogue with DOI-level records.",
            provider: "DataCite",
            collectVia: "datacite",
            coverage: "Research datasets · DOI metadata",
            refresh: "live catalogue",
            grain: "dataset / DOI record",
            recommendedUse: "Find citable research datasets and trace their identifiers, creators, repositories, and related metadata.",
            accessMode: "live_connector",
            format: "JSON API",
            capabilities: ["Search DOI metadata", "Filter dataset records", "Resolve DOI records", "Page through results"],
          }),
          dataset_id: DATACITE_DATASET_ID,
          candidate_key: "source:datacite:live",
        },
        source({
          id: "mops_governance",
          title: "MOPS governance disclosures",
          description: "Official issuer disclosures for governance and board variables.",
          provider: "MOPS",
          coverage: "Taiwan issuers · governance filings",
          refresh: "filing cycle",
          grain: "issuer × filing / period",
          recommendedUse: "Build board, ownership, governance, and disclosure variables for Taiwan-listed issuers.",
        }),
        source({
          id: "zenodo_stablecoin",
          title: "SoK: Stablecoins for Digital Transformation v1.0.0",
          description: "Replication bundle with datasets, notebooks, figures, and analysis scripts published as a citable research deposit.",
          provider: "Zenodo",
          collectVia: "zenodo",
          coverage: "Stablecoin research replication · datasets · notebooks · figures · scripts",
          refresh: "versioned deposit",
          grain: "replication bundle / file",
          recommendedUse: "Reuse a citable stablecoin replication package and inspect the exact files behind published analysis.",
          kind: "artifact",
          format: "ZIP",
          file_count: 1,
          size_label: "8.4 MB",
          version: "v1.0.0",
          license: "MIT",
          query_relevance: 4,
        }),
        source({
          id: "coingecko_market",
          title: "CoinGecko market-history endpoints",
          description: "Historical prices, market capitalization, volume, exchange metadata, and asset identifiers.",
          provider: "CoinGecko",
          coverage: "Prices · market cap · volume · exchanges · asset IDs",
          refresh: "daily / intraday",
          grain: "asset × timestamp / exchange",
          recommendedUse: "Construct crypto market histories and join assets consistently across exchanges and time.",
        }),
        source({
          id: "kaggle_stablecoin_snapshot",
          title: "Stablecoin Market Daily Snapshot",
          description: "Daily USD-pegged stablecoin snapshot with market, peg-status, liquidity, and trading measures.",
          provider: "Kaggle",
          coverage: "USD-pegged stablecoins · daily market and peg state",
          refresh: "published snapshot",
          grain: "stablecoin × day",
          recommendedUse: "Compare peg stability, market capitalization, liquidity, and trading conditions across stablecoins.",
          kind: "dataset",
          format: "CSV",
          file_count: 1,
          column_count: 23,
          columns: ["symbol", "price_usd", "peg_deviation", "peg_status", "market_cap_usd", "volume_24h_usd"],
          license: "CC BY-NC-SA 4.0",
          preview_supported: true,
          query_relevance: 5,
        }),
        source({
          id: "fred_macro",
          title: "FRED macro-financial series",
          description: "Macroeconomic and financial time series for rates, liquidity, risk, and market controls.",
          provider: "Federal Reserve Bank of St. Louis",
          coverage: "Rates · liquidity · risk · macro controls",
          refresh: "series dependent",
          grain: "series × observation date",
          recommendedUse: "Add macro-financial controls and event-window context to empirical panels.",
        }),
        source({
          id: "worldbank_indicators",
          title: "World Bank indicator catalogue",
          description: "Country and economy indicators that can supply macro and institutional covariates.",
          provider: "World Bank",
          coverage: "Country indicators · long panels",
          refresh: "annual / periodic",
          grain: "economy × indicator × period",
          recommendedUse: "Build long-run country panels and institutional or development controls.",
          kind: "dataset",
          temporal_coverage: "1960–2025",
          geographic_coverage: "200+ countries and territories",
          variables: ["1,500+ development indicators"],
          format: "CSV · Excel · API",
          size_label: "CSV 269.7 MB · Excel 77.9 MB",
          periodicity: "Annual",
          license: "CC BY 4.0",
          preview_supported: true,
          query_relevance: 2,
        }),
        source({
          id: "hf_stablecoin_flows",
          title: "Stablecoin Flows",
          description: "Machine-readable stablecoin flow dataset distributed as Parquet with repository manifest and schema metadata.",
          provider: "Hugging Face",
          collectVia: "huggingface",
          coverage: "Stablecoin transfer and flow records",
          refresh: "nightly repository update",
          grain: "transfer / flow record",
          recommendedUse: "Analyze stablecoin movement and flow structure from a directly inspectable machine-readable package.",
          kind: "artifact",
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
          query_relevance: 4,
        }),
        source({
          id: "sec_edgar",
          title: "SEC EDGAR issuer filings",
          description: "Official filings that can contribute issuer disclosures and event timestamps.",
          provider: "SEC",
          coverage: "US issuer filings · disclosures · event dates",
          refresh: "filing stream",
          grain: "issuer × filing",
          recommendedUse: "Recover official disclosure text, filing dates, and issuer-level events.",
        }),
        source({
          id: "twse_market",
          title: "TWSE market data route",
          description: "Official Taiwan market records for listed-company trading and issuer reference data.",
          provider: "TWSE",
          coverage: "Taiwan listed firms · trading · issuer reference",
          refresh: "trading day",
          grain: "security × trading day",
          recommendedUse: "Build Taiwan security-level market panels and issuer-reference joins.",
        }),
        source({
          id: "openalex_reference",
          title: "OpenAlex literature graph",
          description: "Scholarly literature context for methods, prior datasets, and citation-linked evidence.",
          provider: "OpenAlex",
          reference: true,
          coverage: "Papers · authors · concepts · citations",
        }),
        source({
          id: "crossref_reference",
          title: "Crossref DOI metadata",
          description: "DOI metadata and publication context for tracing source provenance and related studies.",
          provider: "Crossref",
          reference: true,
          coverage: "DOI metadata · publication context",
        }),
        source({
          id: "twse_reference",
          title: "TWSE market reference",
          description: "Market structure and issuer reference context for interpreting Taiwan securities data.",
          provider: "TWSE",
          reference: true,
          coverage: "Market structure · issuer context",
        }),
        source({
          id: "coingecko_reference",
          title: "CoinGecko market-data reference",
          description: "Asset and exchange reference context that can help interpret market-data candidates.",
          provider: "CoinGecko",
          reference: true,
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
      await expect(page.getByText("Sources the desk already knows how to investigate")).toBeVisible();
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
        await expect(page.locator(".rd-v2-discover-frozen-controls")).toBeVisible();
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
        const assessmentRail = page.getByRole('region', { name: 'Evidence assessment summary' });
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
    const dataciteRow = page.getByTestId("discover-ranked-results").getByRole("button", { name: /DataCite live catalogue/i });
    await expect(dataciteRow).toHaveAttribute("aria-pressed", "true");
    await assertNoOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-deeplink-datacite-1920x1080.png`, fullPage: false });
  });
});
