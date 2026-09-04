import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-location-disabled";

test("Folders keeps disconnected external locations visible and faded", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();

  const location = page.getByTestId("library-location-filter");
  await expect(location).toBeVisible();

  const all = location.getByRole("button", { name: "All" });
  const drive = location.getByRole("button", { name: "Google Drive" });
  const dropbox = location.getByRole("button", { name: "Dropbox" });

  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(drive).toBeDisabled();
  await expect(dropbox).toBeDisabled();
  await expect(drive).toHaveAttribute("data-state", "disconnected");
  await expect(dropbox).toHaveAttribute("data-state", "disconnected");
  await expect(location).toContainText("All");
  await expect(location).toContainText("Google Drive");
  await expect(location).toContainText("Dropbox");

  await page.screenshot({ path: `${OUT}/01-folders-disabled-locations-1440.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(location).toBeVisible();
  await expect(drive).toBeDisabled();
  await expect(dropbox).toBeDisabled();
  await page.screenshot({ path: `${OUT}/02-folders-disabled-locations-mobile.png`, fullPage: false });
});
