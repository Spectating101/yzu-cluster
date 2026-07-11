/**
 * Discover Composition screenshots — Browse vs Focused Evaluation.
 * Run: CI=true YZU_PAGES=false TMPDIR=$PWD/.tmp-pw npx playwright test e2e/discover-composition-screenshots.spec.js
 */
import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import path from "node:path";
import fs from "node:fs";

const OUT = "docs/screenshots-review/discover-composition";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, label) {
  await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 6000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
}

test.describe("Discover composition screenshots", () => {
  test("browse and focused evaluation silhouettes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockV2Api(page, {
      discoverBody: {
        sections: [
          {
            title: "Mixed",
            rows: [
              {
                dataset_id: "gdelt_asia_daily_country_panel",
                title: "Asia daily news-risk panel",
                source: "GDELT",
                analysis_readiness: "instant",
                local_root: "research_panels/gdelt",
                coverage: "2018–2026 · Asia",
                description: "Lab panel ready for query",
              },
              ...(MOCK_DISCOVER_HIT.sections?.[0]?.rows || []),
              {
                title: "Licensed market feed",
                source: "Vendor",
                access: "licensed",
                license: "commercial",
                url: "https://vendor.example/feed",
              },
            ],
          },
        ],
        total: 3,
      },
    });

    // 01 browse empty / awaiting
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-shell")).toHaveClass(/no-rail/);
    await shot(page, "01-desktop-browse-awaiting");

    // 02 browse grouped results — full canvas, no empty Detail rail
    await page.locator(".rd-v2-search-pill input").fill("mops");
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await expect(page.locator(".rd-v2-discover-group")).toHaveCount(await page.locator(".rd-v2-discover-group").count());
    await expect(page.locator(".rd-v2-shell")).toHaveClass(/no-rail/);
    await shot(page, "02-desktop-browse-grouped");

    // 03–07 focused evaluation — silhouette change
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await expect(page.getByTestId("discover-focus-workspace")).toBeVisible();
    await expect(page.getByTestId("discover-browse-mode")).toHaveCount(0);
    await expect(page.locator(".rd-v2-shell")).toHaveClass(/no-rail/);
    await shot(page, "03-desktop-focus-entry");

    await page.locator('[data-testid="discover-eval-actions"]').getByRole("button", { name: "Probe source" }).click();
    await expect(
      page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface").locator(".rd-v2-eval-verified"),
    ).toBeVisible();
    await shot(page, "04-desktop-focus-probed");

    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail").getByRole("tab", { name: "Ask" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await shot(page, "05-desktop-focus-with-ask");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Discover", exact: true }).click();
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
    await shot(page, "06-desktop-back-to-browse");

    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await expect(page.getByTestId("discover-focus-workspace").getByTestId("discover-eval-surface")).toContainText(
      "Can I use this?",
    );
    await shot(page, "07-desktop-focus-workspace-wide");

    // tablet
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await shot(page, "08-tablet-browse");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await shot(page, "09-tablet-focus");

    // mobile
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "← Back to results" }).click();
    await shot(page, "10-mobile-browse");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();
    await expect(page.getByTestId("discover-focus-workspace")).toBeVisible();
    await shot(page, "11-mobile-focus");
  });
});
