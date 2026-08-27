import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
}

test.describe("Discover offering inspector", () => {
  test("shows declared product structure without inventing preview evidence", async ({ page }) => {
    const candidate = {
      kind: "artifact",
      source_id: "governance_panel",
      candidate_key: "source:governance_panel",
      title: "Taiwan governance issuer-quarter panel",
      description: "Issuer-quarter governance observations for empirical research.",
      provider: "Taiwan Governance Data Lab",
      url: "https://example.com/governance.parquet",
      access_mode: "public_http",
      acquisition_available: true,
      collect_via: ["http_manifest"],
      grain: "issuer-quarter",
      temporal_coverage: "2018–2026",
      geographic_coverage: "Taiwan listed issuers",
      format: "parquet",
      row_count: 18420,
      schema: {
        properties: {
          issuer_id: { type: "string" },
          quarter: { type: "string" },
          board_independence: { type: "number" },
          governance_score: { type: "number" },
        },
      },
      query_relevance: 2,
    };

    await mockV2Api(page, {
      discoverBody: { sections: [], total: 0 },
      discoverSourcesBody: { results: [candidate], total: 1 },
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "Taiwan governance issuer quarter panel");

    await page.getByTestId("discover-ranked-results").locator("button.rd-v2-discover-candidate").click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("tab", { name: "Detail" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Offering profile");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Data product");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("issuer-quarter");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("2018–2026");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Taiwan listed issuers");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("parquet");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("18,420 rows declared");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("issuer_id");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("governance_score");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Access & source");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Taiwan Governance Data Lab");
    await expect(rail.getByTestId("discover-strategy-card")).toContainText("Acquisition path");

    // Declared schema is not an observed data preview. Discover must keep that
    // boundary explicit until a real preview/sample route exists.
    await expect(rail).toContainText(/Schema not inspected|Schema not fully inspected|source endpoint not probed/i);
    await expect(rail).not.toContainText(/sample row observed|preview rows observed/i);
  });

  test("uses bound probe file evidence without upgrading it to schema or clearance", async ({ page }) => {
    const candidate = {
      kind: "artifact",
      source_id: "observed_files",
      candidate_key: "source:observed_files",
      title: "Observed public research files",
      description: "Public research artifacts with an observed endpoint.",
      provider: "Example Research Archive",
      url: "https://example.com/archive/",
      access_mode: "public_http",
      acquisition_available: true,
      collect_via: ["http_manifest"],
      probe_snapshot: {
        candidate_key: "source:observed_files",
        resolved_url: "https://example.com/archive/",
        http_status: 200,
        connector: {
          connector_id: "http_manifest",
          spec: {
            content_type: "text/html",
            access_mode: "public_http",
            discovered_files: [
              { name: "panel-2025.csv", url: "https://example.com/archive/panel-2025.csv" },
              { name: "dictionary.json", url: "https://example.com/archive/dictionary.json" },
            ],
          },
        },
      },
      query_relevance: 2,
    };

    await mockV2Api(page, {
      discoverBody: { sections: [], total: 0 },
      discoverSourcesBody: { results: [candidate], total: 1 },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "observed public research files");

    await page.getByTestId("discover-ranked-results").locator("button.rd-v2-discover-candidate").click();
    const card = page.getByTestId("discover-strategy-card");
    await expect(card).toContainText("2 files observed");
    await expect(card).toContainText("Access & source");
    await expect(card).toContainText("observed");
    await expect(card).toContainText("Inspect schema / fields");
    await expect(page.locator("aside.rd-v2-rail")).toContainText(/Schema not fully inspected|Schema details not shown/i);
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText(/legal clearance confirmed|schema verified|preview rows observed/i);
  });
});
