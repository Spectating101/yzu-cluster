import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const DESTINATIONS = [
  ["Home", "home", ".rd-v2-home-page"],
  ["Library", "library", ".rd-v2-library-page"],
  ["Discover", "discover", ".rd-v2-discover-page"],
  ["Synthesis", "synthesis", ".rd-loop7-synthesis-page"],
  ["Resources", "resources", ".rd-rc3-resources-page"],
];

test("capture Sol ceiling desktop instrument", async ({ page }) => {
  await mockV2Api(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await mkdir("artifacts/sol-ceiling", { recursive: true });

  for (const [label, file, selector] of DESTINATIONS) {
    if (label !== "Home") {
      await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
    }
    await expect(page.locator(selector)).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/sol-ceiling/${file}-1440x900.png`,
      fullPage: false,
    });
  }
});
