import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/history-reconciliation-conflict.json"),
  "utf8",
);

test.use({ viewport: { width: 390, height: 844 } });

test("mobile History keeps the ledger visible until a researcher selects a row", async ({ page }, testInfo) => {
  await page.route("**/library/discover/history*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: FIXTURE }),
  );
  await page.goto("/?tab=browse&mode=history", { waitUntil: "domcontentloaded" });

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const row = page.getByRole("button", { name: /Route prove · TWSE BWIBBU_ALL/i });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toBeInViewport();
  await expect(inspector).toHaveClass(/rd-v2-rail-collapsed/);
  await expect(page.getByRole("button", { name: "Show Detail · Ask" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-history-ledger.png"), fullPage: false });

  await row.click();
  await expect(inspector).not.toHaveClass(/rd-v2-rail-collapsed/);
  await expect(page.getByRole("button", { name: "Hide panel" })).toBeVisible();
  await expect(inspector).toContainText("Route prove · TWSE BWIBBU_ALL");
  await page.screenshot({ path: testInfo.outputPath("mobile-history-detail.png"), fullPage: false });
});
