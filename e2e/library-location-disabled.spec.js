import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-location-disabled";

test("Folders keeps disconnected external locations in the compact Location dropdown", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();

  const location = page.getByTestId("library-location-filter");
  await expect(location).toBeVisible();
  await expect(location).toHaveValue("all");
  await expect(location.locator('option[value="all"]')).not.toHaveAttribute("disabled", "");

  const drive = location.locator('option[value="google_drive"]');
  const dropbox = location.locator('option[value="dropbox"]');
  await expect(drive).toHaveAttribute("disabled", "");
  await expect(dropbox).toHaveAttribute("disabled", "");
  await expect(drive).toHaveAttribute("data-state", "disconnected");
  await expect(dropbox).toHaveAttribute("data-state", "disconnected");
  await expect(drive).toHaveText("Google Drive");
  await expect(dropbox).toHaveText("Dropbox");
  await expect(page.locator('.rd-v2-library-location-options')).toHaveCount(0);

  await page.screenshot({ path: `${OUT}/01-folders-location-dropdown-1440.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(location).toBeVisible();
  await expect(location).toHaveValue("all");
  await expect(drive).toHaveAttribute("disabled", "");
  await expect(dropbox).toHaveAttribute("disabled", "");
  await page.screenshot({ path: `${OUT}/02-folders-location-dropdown-mobile.png`, fullPage: false });
});
