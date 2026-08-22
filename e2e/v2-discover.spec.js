import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  MOCK_DISCOVER_HIT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

/**
 * Discover feature E2E (main composition + Explore|History converge).
 * Authority: docs/UI_PRODUCT_AUTHORITY.md
 * Classify via docs/DISCOVER_E2E_AUTHORITY_AUDIT.md before product fixes.
 */

async function searchDiscover(page, query = "MOPS") {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

async function captureWorkflow(page, name) {
  const dir = "artifacts/frontend-workflow";
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test.describe("v2 Discover tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("empty state offers one adaptive entrance and quiet intake", async ({ page }) => {
    await expect(page.getByTestId("discover-empty")).toBeVisible();
    await expect(page.getByLabel("Search or describe a research need")).toBeVisible();
    await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /mode/i })).toHaveCount(0);
    await expect(page.getByLabel("Public URL or DOI")).toBeVisible();
    // VC-5: two compact examples teach the one-composer behaviour, and the
    // curated-source block collapses to a single quiet line when it has no
    // routes rather than filling the canvas with an empty section.
    const examples = page.getByTestId("discover-composer-examples");
    await expect(examples).toBeVisible();
    await expect(examples.getByText("Try a keyword")).toBeVisible();
    await expect(examples.getByText("Ask a research need")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sources the desk already knows how to investigate" }),
    ).toHaveCount(0);
    await expect(page.getByText("No curated source routes yet")).toBeVisible();
  });

  test("keyword search renders the external result composition", async ({ page }) => {
    await searchDiscover(page, "TWSE governance");
    await expect(page.locator('button.rd-v2-discover-candidate').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button.rd-v2-discover-candidate')).not.toHaveCount(0);
    // BEST FIT was a ranking with no measured score behind it and is withdrawn;
    // the candidates themselves carry the composition now.
    await expect(page.locator(".rd-v2-catalog")).toContainText(/TWSE Open\s*API|TWSE|MOPS|candidate/i);
    await expect(page.getByTestId("discover-best-fit")).toHaveCount(0);
    await expect(page.getByTestId("discover-interpreting")).toBeVisible();
    // "N results" was replaced by the chrome row plus an offering breakdown:
    //   Available · N   Library evidence · N   Web context · N
    await expect(page.getByTestId("discover-result-summary")).toContainText(/Available\s*·\s*\d+/i);
    await expect(page.getByTestId("discover-result-summary")).toContainText(/Library evidence\s*·\s*\d+/i);
    await expect(page.getByLabel("Discover next actions")).toContainText(/available to add|Search wider/i);
    await expect(page.getByTestId("discover-rank-foot")).toContainText(/Ranked using active research/i);
    await expect(page.getByTestId("discover-filter-menu")).toBeVisible();
    await expect(page.getByTestId("discover-browse-mode")).not.toContainText(/process overview/i);
  });

  test("Search wider retains held evidence and trusts the federator's semantic relevance", async ({ page }) => {
    const localBody = {
      sections: [{
        id: "discover",
        rows: [{
          kind: "registry_dataset",
          dataset_id: "stablecoin_local",
          candidate_key: "dataset:stablecoin_local",
          title: "Stablecoin transfer event sample",
          local_ready: true,
          collect_via: "local_open",
        }],
      }],
      total: 1,
    };
    const semanticSources = {
      results: [{
        kind: "source",
        source_id: "bigquery_public",
        candidate_key: "source:google_cloud:bigquery_public",
        provider: "Google Cloud",
        title: "Google BigQuery (public datasets)",
        access_mode: "live_connector",
        collect_via: ["bigquery"],
        capabilities: ["onchain_crypto"],
        query_relevance: 2,
        relevance_evidence: [{ type: "preferred_source_capability", concept: "stablecoin_onchain_transactions" }],
      }],
      total: 1,
    };
    await mockV2Api(page, {
      discoverBody: localBody,
      discoverSourcesBody: { results: [] },
      discoverLiveSourcesBody: semanticSources,
      discoverLiveSourcesDelayMs: 1_000,
    });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "stablecoin");

    const summary = page.getByTestId("discover-result-summary");
    await expect(summary).toContainText("Available · 0");
    await expect(summary).toContainText("Library evidence · 1");
    await page.getByRole("button", { name: "Search wider", exact: true }).click();
    await expect(summary).toContainText("Searching wider sources…");
    await expect(summary).toContainText("Available · 1");
    await expect(summary).toContainText("Library evidence · 1");
    await expect(summary).toContainText("Web context · 0");
    await expect(page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate")).toHaveCount(1);
  });

  test("paints held evidence while the slower source-route lookup continues", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: {
        sections: [{
          id: "library",
          rows: [{
            kind: "registry_dataset",
            dataset_id: "issuer_weekly_panel",
            candidate_key: "dataset:issuer_weekly_panel",
            title: "Issuer weekly fundamentals",
            local_ready: true,
            collect_via: "local_open",
          }],
        }],
        total: 1,
      },
      discoverSourcesBody: {
        results: [{
          kind: "source",
          source_id: "mops_route",
          candidate_key: "source:mops_route",
          title: "MOPS filings route",
          provider: "MOPS",
          url: "https://mops.twse.com.tw/",
          access_mode: "public",
          collect_via: ["http_manifest"],
        }],
      },
      discoverSourcesDelayMs: 5_000,
    });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "issuer fundamentals");

    const progress = page.getByTestId("discover-lookup-progress");
    await expect(progress).toContainText("Current evidence is visible");
    await expect(progress).toContainText("Library evidence · checked");
    await expect(progress).toContainText("Known source routes · checking");
    await expect(page.getByTestId("discover-result-summary")).toContainText("Library evidence · 1");
    await captureWorkflow(page, "discover-progressive-1440x900");
    await page.setViewportSize({ width: 390, height: 844 });
    await captureWorkflow(page, "discover-progressive-390x844");
    await page.getByTestId("discover-library-evidence").locator("summary").click();
    await expect(page.getByText("Issuer weekly fundamentals", { exact: true })).toBeVisible();

    await expect(page.getByText("MOPS filings route", { exact: true })).toBeVisible();
    await expect(progress).toHaveCount(0);
  });

  test("does not report zero held evidence while the registry is still loading", async ({ page }) => {
    let releaseCatalog;
    const catalogReady = new Promise((resolve) => {
      releaseCatalog = resolve;
    });
    await page.route("**/datasets", async (route) => {
      await catalogReady;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ datasets: [] }),
      });
    });

    const catalogRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith("/datasets"),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await catalogRequest;
    await waitForShell(page);

    try {
      await searchDiscover(page, "stablecoin");
      const summary = page.getByTestId("discover-result-summary");
      await expect(summary).toContainText("Library evidence · Checking…");
      await expect(summary).not.toContainText("Library evidence · 0");
    } finally {
      releaseCatalog();
    }
  });

  test("selecting a discover row keeps Explore visible and updates the Detail rail", async ({ page }) => {
    await searchDiscover(page);
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate').first().click();
    const surface = page.locator("aside.rd-v2-rail").getByTestId("discover-eval-surface");
    await expect(surface).toBeVisible();
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-candidate.selected")).toHaveCount(1);
    await expect(page.locator(".rd-v2-shell")).not.toHaveClass(/no-rail/);
    await expect(surface.locator(".rd-v2-eval-title")).toContainText(/MOPS|Taiwan/i);
    await expect(surface).toContainText("Can I use this?");
    await expect(surface).toContainText("Useful for");
    await expect(surface).toContainText("Still unknown");
    await expect(surface.locator(".rd-v2-eval-tech")).toBeVisible();
    await expect(surface.locator(".rd-v2-eval-tech")).not.toHaveAttribute("open");
    await expect(
      page.locator('[data-testid="discover-eval-actions"] .rd-v2-btn.primary', {
        hasText: /Request this evidence|Open in Library/,
      }),
    ).toBeVisible();
    await expect(surface).not.toContainText("What we know");
    await expect(surface).not.toContainText("Possession");
  });

  test("mobile selection preserves Explore and opens Ask deliberately", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();

    const shell = page.locator(".rd-v2-shell");
    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-candidate.selected")).toHaveCount(1);
    await expect(shell).not.toHaveClass(/no-rail/);
    await expect(rail).toHaveClass(/rd-v2-rail-collapsed/);
    await rail.getByRole("button", { name: /Show Detail/ }).click();
    await expect(rail).not.toHaveClass(/rd-v2-rail-collapsed/);
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(shell).not.toHaveClass(/no-rail/);
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  });

  test("mobile filter and sort controls remain fully reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "stablecoin");

    const filterBox = await page.getByTestId("discover-filter-menu").boundingBox();
    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();
    expect(filterBox).not.toBeNull();
    expect(sortBox).not.toBeNull();
    expect(filterBox.x).toBeGreaterThanOrEqual(0);
    expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(390);
    expect(sortBox.x).toBeGreaterThanOrEqual(0);
    expect(sortBox.x + sortBox.width).toBeLessThanOrEqual(390);
  });

  test("Discover candidate Ask actions carry candidate context", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(/MOPS|Taiwan/i);
    await page.getByTestId("ask-messages").getByRole("button", { name: /Assess this source/i }).click();
    await expect(page.getByTestId("ask-messages")).toContainText("Assess this");
    await expect(page.getByTestId("ask-messages")).toContainText(/MOPS|Taiwan/i);
  });

  test("Probe source shows verified facts; technical evidence stays collapsed", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Probe source" }).click();
    const surface = page.locator("aside.rd-v2-rail").getByTestId("discover-eval-surface");
    await expect(surface.locator(".rd-v2-eval-verified")).toContainText("text/csv");
    await expect(surface.locator(".rd-v2-eval-verified")).toContainText(/domain observed/i);
    await expect(surface.locator(".rd-v2-eval-verified")).not.toContainText("MOPS publisher");
    await expect(surface.locator(".rd-v2-eval-inferred")).toContainText(/direct file|machine-readable/i);
    await expect(surface.locator(".rd-v2-eval-tech")).not.toHaveAttribute("open");
    await surface.locator(".rd-v2-eval-tech > summary").click();
    await expect(surface.locator(".rd-v2-eval-tech")).toHaveAttribute("open");
  });

  test("an internal mechanism marker in source never renders as a raw ribbon token", async ({ page }) => {
    const body = {
      sections: [
        {
          title: "Registry",
          rows: [
            {
              dataset_id: "etherscan_stablecoin_probe",
              candidate_key: "dataset:etherscan_stablecoin_probe",
              title: "Etherscan Stablecoin Probe Snapshot",
              source: "collection_index",
              collect_via: "collection_intake",
              coverage: "2024-2026",
              grain: "token-day",
              description: "Etherscan stablecoin token snapshot",
            },
          ],
        },
      ],
      total: 1,
    };
    await mockV2Api(page, { discoverBody: body });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "stablecoin");
    const row = page.locator(".rd-v2-catalog button.row.rd-v2-discover-candidate", { hasText: "Etherscan" });
    await expect(row).toBeVisible();
    await expect(row.locator(".rd-v2-source-ribbon")).not.toContainText("COLLECTION_I");
    await expect(row.locator(".rd-v2-source-ribbon")).toHaveText("SOURCE");
  });

  test("Other external matches does not restate the top result breakdown", async ({ page }) => {
    const body = {
      sections: [
        {
          title: "Registry",
          rows: [
            {
              dataset_id: "mops_financial_statements_ext",
              candidate_key: "dataset:mops_financial_statements_ext",
              title: "MOPS financial statements (Taiwan)",
              source: "MOPS",
              collect_via: "mops_tw",
              url: "https://mops.twse.com.tw/example",
              coverage: "2015-2026",
              grain: "issuer-quarter",
              description: "TW listed company filings",
            },
            {
              dataset_id: "coingecko_market_history",
              candidate_key: "dataset:coingecko_market_history",
              title: "CoinGecko market history",
              source: "CoinGecko",
              url: "https://coingecko.com/example",
              coverage: "2018-2026",
              grain: "asset-day",
              description: "Public crypto market API",
            },
          ],
        },
      ],
      total: 2,
    };
    await mockV2Api(page, { discoverBody: body });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await searchDiscover(page, "market");
    // This used to assert an "Other external matches" section did not restate the
    // breakdown. That section is withdrawn along with BEST FIT, so the guarantee
    // is now structural: neither ranking section may come back.
    await expect(page.locator('[aria-label="Other external matches"]')).toHaveCount(0);
    await expect(page.getByTestId("discover-other-matches")).toHaveCount(0);
    await expect(page.getByTestId("discover-best-fit")).toHaveCount(0);
    await expect(page.getByTestId("discover-result-summary")).toContainText(/Available\s*·\s*\d+/i);
  });
});
