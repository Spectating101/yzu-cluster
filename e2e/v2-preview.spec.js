import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("v2 adaptive Preview", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("owned datasets keep inspection local and open a bounded rows and fields viewer", async ({ page }) => {
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
    await page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" }).click();

    const workspace = page.getByTestId("library-asset-workspace");
    const inspectSchema = workspace.getByRole("button", { name: "Inspect schema" });
    await inspectSchema.click();
    const schemaOverlay = page.getByRole("dialog", { name: "Declared structure" });
    await expect(schemaOverlay).toBeVisible();
    await expect(schemaOverlay.getByRole("button", { name: "Close inspection" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(schemaOverlay).toHaveCount(0);
    await expect(inspectSchema).toBeFocused();

    await workspace.getByRole("button", { name: "Full preview" }).click();

    const preview = page.getByRole("dialog", { name: "Asia daily news-risk panel preview" });
    await expect(preview).toBeVisible();
    const scrim = page.locator(".rd-preview-scrim");
    const inspector = page.getByRole("complementary", { name: "Inspector" });
    const [scrimBox, inspectorBox] = await Promise.all([scrim.boundingBox(), inspector.boundingBox()]);
    expect(scrimBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(scrimBox.x + scrimBox.width).toBeLessThanOrEqual(inspectorBox.x + 1);
    await expect(inspector.getByTestId("library-preview-open-state")).toHaveText("Preview open in centre");
    await expect(inspector.getByRole("button", { name: "Preview rows" })).toHaveCount(0);
    await expect(preview).toContainText("Dataset preview");
    await expect(preview.getByRole("button", { name: "Rows", exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Fields", exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Query", exact: true })).toHaveCount(0);
    await expect(preview).toContainText("Observed sample");
    await expect(preview.locator("table")).toContainText("country");

    await preview.getByRole("button", { name: "Fields", exact: true }).click();
    await expect(preview).toContainText("Field inventory");
    await expect(preview).toContainText("database-schema guarantee");

    await preview.getByRole("button", { name: "Close preview" }).click();
    await expect(preview).toHaveCount(0);
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Asia daily news-risk panel");
  });
});
