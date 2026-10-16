import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test("the side panel folds away, stays folded, and comes back", async ({ page }) => {
  await mockV2Api(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const rail = page.locator("aside.rd-v2-rail");
  await expect(page.getByTestId("research-situation")).toBeVisible();
  const openWidth = (await page.locator("main.rd-v2-shell-main").boundingBox()).width;

  await page.getByRole("button", { name: "Hide side panel" }).click();
  await expect(page.getByTestId("research-situation")).toHaveCount(0);
  await expect(rail.getByRole("button", { name: "Details & Ask" })).toBeVisible();
  const foldedWidth = (await page.locator("main.rd-v2-shell-main").boundingBox()).width;
  expect(foldedWidth).toBeGreaterThan(openWidth + 200);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(rail.getByRole("button", { name: "Details & Ask" })).toBeVisible();

  await rail.getByRole("button", { name: "Details & Ask" }).click();
  await expect(page.getByTestId("research-situation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide side panel" })).toBeVisible();
});
