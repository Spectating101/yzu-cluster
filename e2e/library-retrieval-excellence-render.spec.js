import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

async function openLibrary(page, width = 1440) {
  mkdirSync(OUT, { recursive: true });
  await mockV2Api(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test.describe("Library retrieval excellence", () => {
  test("file-browser controls stay coherent and slash focuses search", async ({ page }) => {
    await openLibrary(page);

    await expect(page.getByTestId("library-auto-catalog")).toHaveCount(0);
    await expect(page.getByTestId("library-type-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("name");

    await page.locator(".rd-v2-page-head h1").focus();
    await page.keyboard.press("/");
    await expect(page.getByRole("textbox", { name: "Search library holdings" })).toBeFocused();

    await page.screenshot({ path: `${OUT}/17-retrieval-controls-1440.png`, fullPage: true });
  });

  test("exact field recall is explainable and keyboard rows behave like a file list", async ({ page }) => {
    await openLibrary(page);
    const search = page.getByRole("textbox", { name: "Search library holdings" });
    await search.fill("country_iso3");

    const rows = page.getByTestId("library-evidence-row");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByTestId("library-search-match")).toContainText("field · country_iso3");
    await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("relevance");

    await rows.first().focus();
    if ((await rows.count()) > 1) {
      await page.keyboard.press("ArrowDown");
      await expect(rows.nth(1)).toBeFocused();
      await page.keyboard.press("Home");
      await expect(rows.first()).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("library-asset-inspector")).toBeVisible();
    await page.getByRole("button", { name: "Close asset inspector" }).click();

    await page.screenshot({ path: `${OUT}/18-retrieval-field-1440.png`, fullPage: true });
  });

  test("vague memory and source-plus-coverage queries remain evidence-grounded", async ({ page }) => {
    await openLibrary(page);
    const search = page.getByRole("textbox", { name: "Search library holdings" });

    await search.fill("daily Asia news");
    await expect(page.getByTestId("library-evidence-row").first()).toContainText("Asia daily news-risk panel");
    await page.screenshot({ path: `${OUT}/19-retrieval-vague-memory-1440.png`, fullPage: true });

    await search.fill("GDELT 2018");
    const top = page.getByTestId("library-evidence-row").first();
    await expect(top).toContainText("Asia daily news-risk panel");
    await expect(top.getByTestId("library-search-match")).toContainText(/source · GDELT|coverage · 2018/i);
    await page.screenshot({ path: `${OUT}/20-retrieval-source-coverage-1440.png`, fullPage: true });
  });

  test("true search miss stays inside the possession boundary and offers explicit widening", async ({ page }) => {
    await openLibrary(page);
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("zzqvjjk_nonexistent_measure");

    const empty = page.getByTestId("library-evidence-empty");
    await expect(empty).toContainText("No held evidence matches");
    await expect(empty.getByRole("button", { name: "Ask Library" })).toBeVisible();
    await expect(empty.getByRole("button", { name: "Search wider in Discover" })).toBeVisible();
    await expect(page.getByTestId("library-evidence-row")).toHaveCount(0);

    await page.screenshot({ path: `${OUT}/21-retrieval-no-held-match-1440.png`, fullPage: true });
  });

  test("retrieval remains compact at 1920", async ({ page }) => {
    await openLibrary(page, 1920);
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("country_iso3");
    await expect(page.getByTestId("library-evidence-row").first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/22-retrieval-field-1920.png`, fullPage: true });
  });
});