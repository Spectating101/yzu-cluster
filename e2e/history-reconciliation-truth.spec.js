import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/history-reconciliation-conflict.json"),
  "utf8",
);

test.use({ viewport: { width: 1920, height: 961 } });

test("new catalog reconciliation wins over a stale query-ready receipt everywhere", async ({ page }) => {
  await page.route("**/library/discover/history*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: FIXTURE }),
  );
  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "History" }).click();

  const row = page.getByRole("button", { name: /Route prove · TWSE BWIBBU_ALL/i });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Registered · reconciliation pending");
  await expect(row).toContainText("current catalog reconciliation pending");
  await expect(row).not.toContainText("query-ready on desk");
  await row.click();

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toContainText("Current catalog row is not loaded");
  await expect(inspector).toContainText("Registered · reconciliation pending");
  await expect(inspector).toContainText("current catalog reconciliation pending");
  await expect(inspector).not.toContainText("Registered in catalog");
  await expect(inspector).not.toContainText("query-ready on desk");
});
