import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-location-open";

test("capture open Location selector with disconnected providers", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();
  const location = page.getByTestId("library-location-filter");
  await expect(location).toBeVisible();
  await location.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01-location-open-1440.png`, fullPage: false });
});
