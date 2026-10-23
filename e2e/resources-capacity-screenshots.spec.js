import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/screenshots-review/resources-capacity";

async function setup(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page);
  await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByRole("region", { name: "Sources overview" })).toContainText("Capacity & access");
}

test("render Resources capacity, routes, activity, and mobile review states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await setup(page, { width: 1440, height: 900 });
  await page.screenshot({ path: `${OUT}/01-desktop-overview.png`, fullPage: false });

  const capabilities = page.getByRole("region", { name: "Source capabilities" });
  await capabilities.scrollIntoViewIfNeeded();
  await expect(capabilities.getByRole("region", { name: "Licensed / institutional" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-desktop-source-capabilities.png`, fullPage: false });

  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Run log" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-desktop-activity.png`, fullPage: false });

});
