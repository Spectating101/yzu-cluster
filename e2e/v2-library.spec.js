import { test, expect } from "@playwright/test";
import { MOCK_DATASETS, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Library evidence estate", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Library root exposes evidence immediately while collections remain narrowing context", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    const estate = page.getByTestId("library-evidence-estate");
    await expect(estate).toBeVisible();
    await expect(estate).toHaveAttribute("aria-label", "Research evidence estate");
    await expect(page.getByTestId("library-auto-catalog")).toHaveCount(0);
    await expect(page.getByTestId("library-evidence-row").first()).toBeVisible();
    await expect(page.getByTestId("library-collection-filter").first()).toBeVisible();
    await expect(estate.getByText("Collections", { exact: true })).toBeVisible();
    await expect(page.getByTestId("library-type-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("name");
    await expect(page.getByTestId("research-situation")).toContainText("Library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail .rd-v2-rail-ehead")).toHaveCount(1);
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add evidence");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Branch actions");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Upload here");
  });

  test("selecting evidence inspects in place while deeper dossier detail stays progressive", async ({ page }) => {
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
    const row = page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Matched");
    await expect(row.getByTestId("library-search-match")).toContainText(/name|topic|collection/i);
    await expect(page.getByTestId("library-search-ask")).toBeVisible();
    await row.click();

    const inspector = page.getByTestId("library-asset-inspector");
    const workspace = page.getByTestId("library-asset-workspace");
    const preview = page.getByTestId("library-data-preview");
    const facts = page.getByTestId("library-asset-facts");
    await expect(inspector).toBeVisible();
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Selected Library asset");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Dataset inspection");
    await expect(preview).toContainText("Observed table");
    await expect(preview).toContainText("Coverage:");
    await expect(preview).toContainText("Grain:");
    await expect(preview).toContainText("Keys:");
    await expect(facts.getByText("Research details", { exact: true })).toBeVisible();
    expect(await facts.evaluate((element) => element.open)).toBe(false);
    await expect(workspace.getByLabel("Evidence claims")).toContainText("Readiness");
    await expect(workspace.getByLabel("Evidence claims")).toContainText("Verification");
    await expect(workspace.getByRole("button", { name: "Open query" })).toBeVisible();
    await expect(workspace.getByRole("button", { name: "Inspect schema" })).toHaveCount(1);
    await expect(workspace.getByRole("button", { name: "Full preview" })).toHaveCount(1);
    await expect(page.getByTestId("library-observation-receipt")).toContainText("1 row");

    const order = await Promise.all([preview.boundingBox(), facts.boundingBox()]);
    expect(order[0]).not.toBeNull();
    expect(order[1]).not.toBeNull();
    expect(order[0].y).toBeLessThan(order[1].y);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.getByTestId("research-situation")).toContainText("Asia daily news-risk panel");
    await expect(rail).toContainText("Can I use this?");
    await expect(rail).toContainText("Query ready");
    await expect(rail).toContainText("Source & reproduce");
    await expect(rail).toContainText("Exact source URL not recorded");
    await expect(rail).toContainText("Reproduction method not recorded");
    await expect(rail).toContainText("Verification");
    await expect(rail).not.toContainText("Useful for");
    await expect(rail).not.toContainText("Coverage & grain");
    await expect(rail).not.toContainText("Join keys");
    await expect(rail.getByRole("button", { name: "Preview rows" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "Ask about this →" })).toBeVisible();
    await expect(page.getByTestId("library-evidence-estate")).toBeVisible();

    await facts.getByText("Research details", { exact: true }).click();
    expect(await facts.evaluate((element) => element.open)).toBe(true);
    await expect(facts).toContainText("Asset facts");
    await expect(facts).toContainText("Research use");
    await expect(facts).toContainText("Boundary");
    await expect(workspace.locator(".rd-v2-library-evidence-facts")).toContainText("ScopeNot declared");

    await workspace.getByRole("button", { name: "Inspect schema" }).click();
    const fields = page.getByRole("dialog", { name: "Declared structure" });
    await expect(fields).toBeVisible();
    await expect(fields).toContainText("country_iso3");
    await fields.getByRole("button", { name: "Close inspection" }).click();
    await expect(fields).toHaveCount(0);

    await workspace.getByRole("button", { name: "Source record" }).click();
    const provenance = page.getByRole("dialog", { name: "Source and provenance" });
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText("Exact source URL");
    await expect(provenance).toContainText("Acquisition method");
    await expect(provenance.getByText("Not recorded", { exact: true })).toHaveCount(2);
    await expect(page.getByTestId("library-source-verification")).toContainText("Not checked");
    await expect(page.getByTestId("library-source-readiness")).toContainText("Query ready");
    await provenance.getByRole("button", { name: "Close inspection" }).click();

    await page.getByRole("button", { name: "Close asset inspector" }).click();
    await expect(inspector).toHaveCount(0);
    await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  });

  test("New menu routes upload intake through the rail", async ({ page }) => {
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    await expect(page.getByRole("menu", { name: "New library item" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "New collection" })).toBeDisabled();

    await page.getByRole("menuitem", { name: "Upload file..." }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.getByRole("dialog", { name: "Upload files to library" })).toHaveCount(0);
    await expect(rail).toContainText("Upload files");
    await expect(rail).toContainText("Destination");
    await expect(rail).toContainText("Library");
    await expect(rail.getByRole("button", { name: "Send to Ask" })).toBeDisabled();

    await rail.locator('input[type="file"]').setInputFiles({
      name: "faculty-panel.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,value\n2026-01-01,1\n"),
    });
    await expect(rail).toContainText("faculty-panel.csv");
    await rail.getByRole("button", { name: "Send to Ask" }).click();
    await expect(page.getByTestId("research-situation").getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("ask-messages")).toContainText("Upload files to Library");
    await expect(page.getByTestId("ask-messages")).toContainText("faculty-panel.csv");
  });

  test("URL / DOI intake waits for a target before sending to Ask", async ({ page }) => {
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    await page.getByRole("menuitem", { name: "Add URL / DOI..." }).click();

    const rail = page.locator("aside.rd-v2-rail");
    await expect(page.getByRole("dialog", { name: "Add URL or DOI to library" })).toHaveCount(0);
    await expect(rail).toContainText("Add URL / DOI");
    await expect(rail.getByRole("button", { name: "Send to Ask" })).toBeDisabled();

    await rail.locator("#rd-v2-rail-url-input").fill("https://doi.org/10.1234/example");
    await rail.getByRole("button", { name: "Send to Ask" }).click();
    await expect(page.getByTestId("research-situation").getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("ask-messages")).toContainText("https://doi.org/10.1234/example");
  });
});

test.describe("v2 Library navigation", () => {
  test("Library holds assets while registered references remain in Discover", async ({ page }) => {
    await mockV2Api(page, {
      datasetsBody: {
        datasets: [
          ...MOCK_DATASETS.datasets,
          {
            dataset_id: "registered_reference_only",
            name: "Registered reference only",
            source_access_mode: "catalog_reference",
            registered: true,
            registry_id: "registered_reference_only",
            local_path: "data_lake/catalogue/registered_reference_only.json",
          },
        ],
      },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.locator(".rd-v2-header-meta-count")).toContainText("Library asset");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("1 registry reference stays in Discover until acquired");
    const outside = page.getByTestId("library-available-evidence");
    await expect(outside).toContainText("1 known record");
    await expect(outside).toContainText("outside your Library");
    await expect(outside.getByRole("button", { name: "Review in Discover" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Registered reference only");
    await expect(page.getByTestId("library-evidence-estate")).toContainText("No held evidence matches");
    await expect(page.getByRole("button", { name: "Search wider in Discover" })).toBeVisible();
  });

  test("shows owned evidence while research taxonomy is still organizing", async ({ page }) => {
    await mockV2Api(page, {
      libraryNavDelayMs: 5_000,
      libraryNavBody: {
        nav_mode: "professor_shelves",
        shelves: [
          { id: "markets", label: "Markets", partition_ids: ["markets.asia"] },
          { id: "news", label: "News", partition_ids: ["news.gdelt"] },
        ],
        partitions: [
          {
            partition_id: "markets.asia",
            shelf_id: "markets",
            professor_label: "Asian equities",
            detail: { registry_dataset_ids: ["gdelt_asia_daily_country_panel"] },
          },
          {
            partition_id: "news.gdelt",
            shelf_id: "news",
            professor_label: "News and events",
            detail: { registry_dataset_ids: [] },
          },
        ],
        guide: { start_here: ["markets", "news"] },
      },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const estate = page.getByTestId("library-evidence-estate");
    await expect(estate).toBeVisible();
    await expect(page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" })).toBeVisible();
    await expect(page.locator(".rd-v2-toolbar-count")).toContainText("Organizing collections");
    await expect(page.getByText("ungrouped", { exact: true })).toHaveCount(0);

    await expect(page.getByTestId("library-collection-filter").filter({ hasText: "Markets" })).toBeVisible();
    await expect(page.getByTestId("library-collection-filter").filter({ hasText: "News" })).toBeVisible();
    await expect(page.locator(".rd-v2-toolbar-count")).not.toContainText("Organizing collections");
    await expect(page.getByText("ungrouped", { exact: true })).toHaveCount(0);
  });

  test("a dataset-only deep link opens the Library inspector over the estate", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?dataset=gdelt_asia_daily_country_panel", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.getByRole("heading", { name: "Library", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
    await expect(page.getByTestId("library-asset-inspector")).toBeVisible();
    await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
    await expect(page.getByTestId("library-asset-workspace")).toContainText("Asia daily news-risk panel");
    await expect(page).toHaveURL(/tab=library/);
  });

  test("entering Library from Home lands on the Library context rail", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Asia daily news-risk panel");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByTestId("research-situation")).toContainText("Library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add evidence");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Upload here");
  });

  test("leaving a Library collection for Discover does not leave a stale folder param that reopens Library on reload", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const collection = page.getByTestId("library-collection-filter").first();
    await collection.click();
    await expect(page).toHaveURL(/folder=/);

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Discover", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/folder=/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeVisible();
  });
});
