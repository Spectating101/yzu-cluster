import { mkdir } from "node:fs/promises";
import { test } from "@playwright/test";

const OUT = "artifacts/live-review";
const EXACT = "/?tab=discover&dataset=datacite_10.5281_zenodo.58938";
const ROOT = "/?tab=discover";

async function settle(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".rd-v2-shell").waitFor({ timeout: 45_000 });
  await page.waitForTimeout(2500);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

test("capture current live Discover exactly as rendered", async ({ page }) => {
  await mkdir(OUT, { recursive: true });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await settle(page, ROOT);
  await shot(page, "discover-root-1920x1080");
  await shot(page, "discover-root-1920-full", true);

  await settle(page, EXACT);
  await shot(page, "discover-datacite-1920x1080");
  await shot(page, "discover-datacite-1920-full", true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page, ROOT);
  await shot(page, "discover-root-1440x900");

  await settle(page, EXACT);
  await shot(page, "discover-datacite-1440x900");
});
