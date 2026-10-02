import { test, expect } from "@playwright/test";
import { MOCK_ANALYSIS_DATASETS, MOCK_DATASETS, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const datasetsBody = { datasets: [...MOCK_DATASETS.datasets, ...MOCK_ANALYSIS_DATASETS.datasets] };
const warning = "few clusters (<30); cluster inference may be unreliable";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockV2Api(page, { datasetsBody, analysisThreads: true });
});

async function regressionChecks(result) {
  await expect(result.getByTestId("analysis-warnings")).toContainText(warning);
  await expect(result.getByText(warning, { exact: true })).toBeVisible();
  const row = result.getByRole("row", { name: /year/ });
  await expect(row).toContainText("−0.520");
  await expect(row).toContainText("0.119");
  await expect(row).toContainText("[−0.754, −0.286]");
  await expect(result).toContainText("Clustered by county");
  await expect(result.getByRole("img", { name: /coefficient estimates and 95% confidence intervals/ })).toBeVisible();
  await expect(result.locator("svg circle")).toHaveCount(1);
  const order = await Promise.all([result.getByTestId("analysis-warnings").boundingBox(), result.getByRole("table").boundingBox()]);
  expect(order[0].y).toBeLessThan(order[1].y);
}

test("Library dataset detail shows regression warnings, estimates and an accessible chart", async ({ page }, testInfo) => {
  await page.goto("/?tab=library&dataset=county_unemployment_ols");
  await waitForShell(page);
  const result = page.getByTestId("library-asset-workspace").getByTestId("analysis-results");
  await regressionChecks(result);
  await expect(result).toContainText("288 observations");
  await expect(result).toContainText("0.089");
  await expect(result).toContainText("19.000");
  await page.screenshot({ path: testInfo.outputPath("library-ols.png") });
});

test("Synthesis executed result uses the same analysis view and retains method export", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?tab=synthesis");
  await waitForShell(page);
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "County unemployment analysis" }).click();
  await regressionChecks(page.getByTestId("analysis-results"));
  await expect(page.getByTestId("synthesis-method-export")).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("synthesis-ols.png") });
});

test("Synthesis Preview shows its sample-only label and warnings after the sample request", async ({ page }, testInfo) => {
  await page.goto("/?tab=synthesis");
  await waitForShell(page);
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "County sample analysis" }).click();
  await page.getByRole("button", { name: "Run sample test", exact: true }).click();
  const result = page.getByTestId("synthesis-preview-state").getByTestId("analysis-results");
  await expect(result.getByTestId("analysis-sample-label")).toHaveText("sample only — not the final estimate");
  await expect(result.getByTestId("analysis-sample-label")).toBeVisible();
  await regressionChecks(result);
  await page.screenshot({ path: testInfo.outputPath("synthesis-preview.png") });
});

test("Library correlation result has a matrix, pair counts and a labelled SVG heatmap", async ({ page }, testInfo) => {
  await page.goto("/?tab=library&dataset=county_correlation");
  await waitForShell(page);
  const result = page.getByTestId("analysis-results");
  await expect(result.getByRole("table", { name: "Correlation results" })).toBeVisible();
  await expect(result.getByRole("cell", { name: "−0.298", exact: true })).toHaveCount(2);
  await expect(result.getByRole("cell", { name: "−0.298", exact: true }).first()).toHaveAttribute("title", "n = 288");
  await expect(result.getByRole("img", { name: /correlation heatmap from −1 to 1/ })).toBeVisible();
  await expect(result.locator("svg rect")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("library-correlation.png") });
});

test("ordinary aggregate dataset detail adds no analysis surface", async ({ page }) => {
  await page.goto("/?tab=library&dataset=gdelt_asia_daily_country_panel");
  await waitForShell(page);
  await expect(page.getByTestId("library-data-preview")).toBeVisible();
  await expect(page.getByTestId("analysis-results")).toHaveCount(0);
});
