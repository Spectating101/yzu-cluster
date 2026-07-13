import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 Synthesis construction workspace", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("renders a persistent construction map with the existing right rail", async ({ page }) => {
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Synthesis" })).toBeVisible();
    await expect(page.getByTestId("synthesis-workbench")).toBeVisible();
    await expect(page.getByText("Historical stablecoin attention", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("synthesis-construction-map")).toBeVisible();
    await expect(page.getByTestId("synthesis-proposal")).toContainText("Use GDELT as a validation signal");
    await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Historical stablecoin attention");
  });

  test("selecting GDELT drives the contextual right rail", async ({ page }) => {
    await page.getByText("GDELT crypto news", { exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("GDELT crypto news");
    await expect(rail).toContainText("Proposed");
    await expect(rail).toContainText("Candidate validation signal");
    await expect(rail).toContainText("News coverage is related to public visibility");
  });

  test("proposal review is intentional and applying it changes the construction state", async ({ page }) => {
    await page.getByTestId("synthesis-proposal").click();
    const dialog = page.getByRole("dialog", { name: "Review agent proposal" });
    await expect(dialog).toContainText("GDELT measures editorial/news coverage");
    await dialog.getByRole("button", { name: "Approve proposal" }).click();
    await expect(page.getByTestId("synthesis-proposal")).toHaveCount(0);
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toContainText("GDELT crypto news");
    await expect(rail).toContainText("Queryable");
    await expect(rail).toContainText("Validation signal");
  });

  test("research plan and evidence remain honest inspection views", async ({ page }) => {
    await page.getByRole("button", { name: "Research plan", exact: true }).click();
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Research asset specification");
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Historical X follower growth");
    await expect(page.getByTestId("synthesis-spec-view")).toContainText("Known limitations");

    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await expect(page.getByTestId("synthesis-data-view")).toContainText("no rows materialised");
    await expect(page.getByTestId("synthesis-data-view")).toContainText("Planned output schema");
    await expect(page.getByTestId("synthesis-charts-view")).toContainText("Evidence coverage");
    await expect(page.getByTestId("synthesis-charts-view")).toContainText("Ask agent to preview");
  });

  test("mobile preserves the map and opens detail for node selection", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("synthesis-construction-map")).toBeVisible();
    await page.getByText("GDELT crypto news", { exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).not.toHaveClass(/rd-v2-rail-collapsed/);
    await expect(rail).toContainText("GDELT crypto news");
  });
});
