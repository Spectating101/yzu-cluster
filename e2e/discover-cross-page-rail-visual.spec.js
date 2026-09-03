import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/discover-rail-reference";

async function open(page, tab) {
  await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
  await page.waitForTimeout(120);
}

async function snap(page, name) {
  await page.screenshot({ path: `${OUT}/${name}-1920x1080.png`, fullPage: false });
}

test("capture cross-page right-rail reference states", async ({ page }) => {
  await mkdir(OUT, { recursive: true });
  await mockV2Api(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await open(page, "home");
  await snap(page, "home-idle");

  await open(page, "library");
  await snap(page, "library-idle");
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
  const libraryRow = page.getByTestId("library-evidence-row").first();
  await expect(libraryRow).toBeVisible();
  await libraryRow.click();
  await expect(page.getByTestId("library-rail-source")).toBeVisible();
  await snap(page, "library-selected");

  await open(page, "synthesis");
  await expect(page.getByTestId("synthesis-home-state")).toBeVisible();
  await snap(page, "synthesis-idle");

  await open(page, "resources");
  await snap(page, "resources-overview");

  await open(page, "profile");
  await snap(page, "profile");
});
