import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/synthesis-visual-audit";

async function openStudio(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page);
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("synthesis-studio")).toBeVisible();
}

async function shot(page, name) {
  await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 4000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

test("render Synthesis studio review states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await openStudio(page, { width: 1440, height: 900 });
  await shot(page, "01-desktop-studio");

  await page.getByRole("button", { name: "Run synthesis" }).click();
  await expect(page.getByTestId("synthesis-output-card")).toContainText("Registered in Library");
  await shot(page, "02-desktop-registered-output");

  await page.getByRole("button", { name: /Custom pair/i }).click();
  await expect(page.getByLabel("Synthesis input 1")).toBeVisible();
  await shot(page, "03-desktop-custom-pair");

  await openStudio(page, { width: 390, height: 1200 });
  await shot(page, "04-mobile-studio");

  await page.getByRole("button", { name: "Run synthesis" }).click();
  await expect(page.getByTestId("synthesis-output-card")).toContainText("Registered in Library");
  await shot(page, "05-mobile-registered-output");
});
