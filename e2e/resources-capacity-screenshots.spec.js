import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/resources-capacity";

async function setup(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page);
  await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByRole("region", { name: "Capacity and access" })).toBeVisible();
}

test("render RC3 Resources capability, selected provider, and usage states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await setup(page, { width: 1440, height: 900 });
  await page.screenshot({ path: `${OUT}/01-desktop-capabilities.png`, fullPage: false });

  await page.getByRole("region", { name: "Capacity and access" }).locator('[data-kind="source"]').first().click();
  await expect(page.getByRole("complementary", { name: "Inspector" }).locator(".rd-v2-rail-selection")).not.toHaveText("Resources");
  await page.screenshot({ path: `${OUT}/02-desktop-capability-detail.png`, fullPage: false });

  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(page.locator(".rd-rc3-usage-log")).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-desktop-usage.png`, fullPage: false });
});
