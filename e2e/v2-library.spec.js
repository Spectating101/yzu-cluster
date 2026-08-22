import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Library directory", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("Library root renders as a folder-first directory", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    const directory = page.getByTestId("library-directory");
    await expect(directory).toBeVisible();
    await expect(page.locator(".rd-v2-library-pathbar")).toContainText("Library root");
    await expect(page.getByRole("list", { name: "Catalog" })).toBeVisible();
    await expect(page.locator('.rd-v2-catalog-list button[data-kind="folder"]').first()).toBeVisible();
    await expect(page.locator(".rd-v2-rail-selection")).toHaveText("Library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add data");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Branch actions");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Upload here");
  });

  test("selecting a dataset opens a Library workspace while the rail remains contextual", async ({ page }) => {
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
    const row = page.locator('.rd-v2-catalog-list button[data-kind="dataset"]', { hasText: "Asia daily news-risk panel" });
    await expect(row).toBeVisible();
    await row.click();

    const workspace = page.getByTestId("library-asset-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Selected Library asset");
    await expect(workspace).toContainText("What you have");
    await expect(workspace).toContainText("What this supports");
    await expect(workspace).toContainText("What this does not establish");
    await expect(workspace).toContainText("Observed local sample");
    await expect(workspace.locator(".rd-v2-library-evidence-facts")).toContainText("ScopeNot declared");
    await expect(workspace.getByRole("button", { name: "Open query" })).toBeVisible();
    await expect(workspace.getByRole("button", { name: "View fields" })).toBeVisible();
    await expect(workspace.getByRole("button", { name: "Preview rows" })).toHaveCount(1);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("Asia daily news-risk panel");
    await expect(rail).toContainText("Can I use this?");
    await expect(rail).toContainText("Query ready");
    await expect(rail).toContainText("Useful for");
    await expect(rail).toContainText("Coverage & grain");
    await expect(rail).toContainText("Join keys");
    await expect(rail.getByRole("button", { name: "Preview rows" })).toBeVisible();
    await expect(page.getByTestId("library-directory")).toHaveCount(0);

    await workspace.getByRole("button", { name: "View fields" }).click();
    const fields = page.getByRole("dialog", { name: "Fields and operations" });
    await expect(fields).toBeVisible();
    await expect(fields).toContainText("country_iso3");
    await fields.getByRole("button", { name: "Close inspection" }).click();
    await expect(fields).toHaveCount(0);

    await page.getByRole("button", { name: "← All Library assets" }).click();
    await expect(page.getByTestId("library-directory")).toBeVisible();
  });

  test("New menu routes upload intake through the rail", async ({ page }) => {
    await page.getByRole("button", { name: "Open new library item menu" }).click();
    await expect(page.getByRole("menu", { name: "New library item" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "New folder" })).toBeDisabled();

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
    await expect(page.locator(".rd-v2-rail-toggle button.on", { hasText: "Ask" })).toBeVisible();
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
    await expect(page.locator(".rd-v2-rail-toggle button.on", { hasText: "Ask" })).toBeVisible();
    await expect(page.getByTestId("ask-messages")).toContainText("https://doi.org/10.1234/example");
  });
});

test.describe("v2 Library navigation", () => {
  test("waits for the research taxonomy instead of presenting cluster lanes as shelves", async ({ page }) => {
    await mockV2Api(page, {
      libraryNavDelayMs: 1_200,
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

    const location = page.getByLabel("Library location status");
    await expect(location).toHaveAttribute("data-navigation-state", "loading");
    await expect(page.getByRole("status")).toContainText("Organizing Library shelves");
    await expect(page.getByText("ungrouped", { exact: true })).toHaveCount(0);

    await expect(location).toHaveAttribute("data-navigation-state", "ready");
    const directory = page.getByTestId("library-directory");
    await expect(directory.getByText("Markets", { exact: true })).toBeVisible();
    await expect(directory.getByText("News", { exact: true })).toBeVisible();
    await expect(location).toContainText("3 shelves");
    await expect(page.getByText("ungrouped", { exact: true })).toHaveCount(0);
  });

  test("a dataset-only deep link opens the Library workspace", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?dataset=gdelt_asia_daily_country_panel", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
    await expect(page.getByTestId("library-asset-workspace")).toContainText("Asia daily news-risk panel");
    await expect(page).toHaveURL(/tab=library/);
  });

  test("entering Library from Home lands on the branch rail", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Asia daily news-risk panel");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.locator(".rd-v2-rail-selection")).toHaveText("Library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add data");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Upload here");
  });

  test("leaving a Library folder for Discover does not leave a stale folder param that reopens Library on reload", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const folder = page.locator('.rd-v2-catalog-list button[data-kind="folder"]').first();
    await folder.click();
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
