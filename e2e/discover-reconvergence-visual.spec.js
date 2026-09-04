import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_ASSESSMENT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-reconvergence";
const DATACITE_DATASET_ID = "datacite_10.5281_zenodo.58938";

function source({ id, title, description, provider, collectVia = "http_manifest", reference = false, accessMode = "procurement_catalog", coverage, refresh }) {
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
            coverage: "Research datasets and DOI metadata",
            refresh: "live catalogue",
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
        }),
        source({
          id: "zenodo_stablecoin",
          title: "Zenodo stablecoin research deposits",
          description: "Public research deposits containing reproducible stablecoin datasets and code artifacts.",
          provider: "Zenodo",
          collectVia: "zenodo",
          coverage: "Deposited datasets · methods · code",
          refresh: "repository updates",
        }),
        source({
          id: "coingecko_market",
          title: "CoinGecko market-history endpoints",
          description: "Historical prices, market capitalization, volume, exchange metadata, and asset identifiers.",
          provider: "CoinGecko",
          coverage: "Crypto markets · exchanges · asset history",
          refresh: "daily / intraday",
        }),
        source({
          id: "defillama_stablecoins",
          title: "DefiLlama stablecoin supply history",
          description: "Chain and issuer-level stablecoin supply observations for cross-chain market structure.",
          provider: "DefiLlama",
          coverage: "Stablecoin supply · chains · issuers",
          refresh: "daily",
        }),
        source({
          id: "fred_macro",
          title: "FRED macro-financial series",
          description: "Macroeconomic and financial time series for rates, liquidity, risk, and market controls.",
          provider: "Federal Reserve Bank of St. Louis",
          coverage: "Rates · liquidity · macro controls",
          refresh: "series dependent",
        }),
        source({
          id: "worldbank_indicators",
          title: "World Bank indicator catalogue",
          description: "Country and economy indicators that can supply macro and institutional covariates.",
          provider: "World Bank",
          coverage: "Country indicators · long panels",
          refresh: "annual / periodic",
        }),
        source({
          id: "imf_data",
          title: "IMF Data API catalogue",
          description: "International financial statistics and macroeconomic series for country-level controls.",
          provider: "IMF",
          coverage: "IFS · macroeconomic panels",
          refresh: "periodic",
        }),
        source({
          id: "sec_edgar",
          title: "SEC EDGAR issuer filings",
          description: "Official filings that can contribute issuer disclosures and event timestamps.",
          provider: "SEC",
          coverage: "US issuer filings · event dates",
          refresh: "filing stream",
        }),
        source({
          id: "twse_market",
          title: "TWSE market data route",
          description: "Official Taiwan market records for listed-company trading and issuer reference data.",
          provider: "TWSE",
          coverage: "Taiwan listed firms · market records",
          refresh: "trading day",
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
          coverage: "DOI metadata · publication links",
        }),
        source({
          id: "twse_reference",
          title: "TWSE market reference",
          description: "Official market reference context for Taiwan-listed issuers.",
          provider: "TWSE",
          reference: true,
          coverage: "Issuer and market reference",
        }),
        source({
          id: "coingecko_reference",
          title: "CoinGecko market-data reference",
          description: "Reference context for market history and exchange-volume endpoints.",
          provider: "CoinGecko",
          reference: true,
          coverage: "Endpoint and asset reference",
        }),
      ],
      total: 14,
    },
  };
}

async function openDiscover(page, path = "/?tab=browse") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
}

async function runSearch(page, query = "stablecoin market evidence") {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
  await expect(page.getByTestId("discover-ranked-results")).toBeVisible();
  await expect(page.getByTestId("discover-evidence-field")).toContainText(/10 candidates/i);
  await expect(page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate")).toHaveCount(10);
}

async function assertNoOverflow(page) {
  const dims = await page.locator("main.yzu-main").evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(dims.scroll).toBeLessThanOrEqual(dims.client + 2);
}

test.describe("Discover reconvergence visual review", () => {
  test.beforeEach(async () => {
    await mkdir(OUT, { recursive: true });
  });

  for (const viewport of [
    { width: 1440, height: 900, name: "1440x900" },
    { width: 1920, height: 1080, name: "1920x1080" },
  ]) {
    test(`resting retrieval workspace ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);

      await expect(page.getByTestId("discover-query-composer")).toBeVisible();
      await expect(page.getByTestId("discover-coverage")).toBeVisible();
      await expect(page.locator(".rd-v2-discover-evidence-path")).toHaveCount(0);
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
      const fieldBox = await page.getByTestId("discover-evidence-field").boundingBox();
      const resultsBox = await page.getByTestId("discover-ranked-results").boundingBox();
      expect(fieldBox).not.toBeNull();
      expect(resultsBox).not.toBeNull();
      expect(resultsBox.y - (fieldBox.y + fieldBox.height)).toBeLessThan(38);
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-results-${viewport.name}.png`, fullPage: false });
    });

    test(`selected evidence evaluation ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, resultFixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page);

      const best = page.getByTestId("discover-ranked-results");
      await best.getByRole("button", { name: /DataCite live catalogue/i }).first().click();
      await expect(page.locator(".rd-v2-discover-candidate.selected")).toBeVisible();
      await expect(page.locator("aside.rd-v2-rail").getByRole("region", { name: "Can I use this" })).toBeVisible();
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-selected-${viewport.name}.png`, fullPage: false });
    });

    test(`research-question assembly field ${viewport.name}`, async ({ page }) => {
      await mockV2Api(page, {
        ...resultFixture(),
        assessmentBody: MOCK_DISCOVER_ASSESSMENT,
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDiscover(page);
      await runSearch(page, "Do we hold issuer-quarter governance data for Taiwan?");

      const workspace = page.locator(".rd-v2-evidence-brief.is-workspace");
      await expect(workspace).toBeVisible();
      await expect(workspace).toContainText(/Partially covered/i);
      await expect(workspace).toContainText(/Board-governance variables/i);
      await expect(page.getByTestId("discover-assembly-path")).toBeVisible();
      await expect(page.getByTestId("discover-assembly-path")).toContainText(/No single source has to be the answer/i);
      const details = workspace.locator(".rd-v2-evidence-detail-disclosure.is-workspace");
      await expect(details).toBeVisible();
      expect(await details.evaluate((node) => node.open)).toBe(false);
      const firstCandidateBox = await page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate").first().boundingBox();
      expect(firstCandidateBox).not.toBeNull();
      expect(firstCandidateBox.y).toBeLessThan(viewport.height);
      await assertNoOverflow(page);
      await page.screenshot({ path: `${OUT}/discover-investigation-${viewport.name}.png`, fullPage: false });
    });
  }

  test("raw DataCite Discover deep link binds the named source", async ({ page }) => {
    await mockV2Api(page, resultFixture());
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openDiscover(page, `/?tab=discover&dataset=${encodeURIComponent(DATACITE_DATASET_ID)}`);

    await expect(page.locator(".rd-v2-discover-candidate.selected")).toContainText("DataCite live catalogue");
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("DataCite live catalogue");
    await expect(rail).not.toContainText("No candidate selected");
    await assertNoOverflow(page);
    await page.screenshot({ path: `${OUT}/discover-deeplink-datacite-1920x1080.png`, fullPage: false });
  });
});
