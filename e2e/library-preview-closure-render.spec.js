import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-renders";

const EXPANDED_ROWS = Array.from({ length: 30 }, (_, index) => {
  const countries = ["TW", "JP", "KR", "SG", "ID", "MY"];
  const day = 30 - Math.floor(index / countries.length);
  const country = countries[index % countries.length];
  return {
    date: `2026-04-${String(day).padStart(2, "0")}`,
    country,
    article_count: 820 + index * 47,
    news_risk: Number((0.18 + ((index * 7) % 61) / 100).toFixed(2)),
    market_return: Number((((index % 9) - 4) / 1000).toFixed(4)),
    source_mentions: 32 + ((index * 11) % 97),
  };
});

async function settle(page) {
  await page.waitForTimeout(180);
}

test("render final Library expanded sample and schema at desktop width", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await mockV2Api(page);
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: EXPANDED_ROWS }),
    }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
  await page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" }).click();
  const workspace = page.getByTestId("library-asset-workspace");
  await expect(workspace).toContainText("Asia daily news-risk panel");
  await workspace.getByRole("button", { name: "Expand sample" }).click();

  const preview = page.getByRole("dialog", { name: "Asia daily news-risk panel expanded sample" });
  const rail = page.getByRole("complementary", { name: "Inspector" });
  await expect(preview).toBeVisible();
  await expect(rail.getByTestId("library-preview-open-state")).toHaveText("Expanded sample open in centre");

  const [previewBox, railBox] = await Promise.all([preview.boundingBox(), rail.boundingBox()]);
  expect(previewBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(railBox.x + 1);
  expect(previewBox.width).toBeGreaterThan(950);

  await expect(preview.getByRole("button", { name: "Fields", exact: true })).toHaveCount(0);
  await expect(preview.locator("table")).toContainText("country");
  await expect(preview.locator("tbody tr")).toHaveCount(30);
  await expect(preview).toContainText("30 displayed");
  await settle(page);
  await page.screenshot({ path: `${OUT}/09-expanded-sample-1920.png`, fullPage: false });

  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(preview).toHaveCount(0);
  await workspace.getByRole("button", { name: "Inspect schema" }).click();
  const schema = page.getByRole("dialog", { name: "Declared structure" });
  await expect(schema).toBeVisible();
  await expect(schema).toContainText("country");
  await settle(page);
  await page.screenshot({ path: `${OUT}/10-schema-inspection-1920.png`, fullPage: false });
});
