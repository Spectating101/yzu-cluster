import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "docs/screenshots-review/synthesis-graph-visual-audit";

async function openSynthesis(page, viewport) {
  await page.setViewportSize(viewport);
  await mockV2Api(page);
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("synthesis-workbench")).toBeVisible();
  await expect(page.locator(".rd-syn-flow")).toBeVisible();
  await expect(page.getByText("attention_proxy_index", { exact: true })).toBeVisible();
  await page.waitForTimeout(900);
}

async function shot(page, name) {
  await page.locator(".rd-v2-toast").waitFor({ state: "detached", timeout: 2500 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

test("render Synthesis construction workbench states", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await openSynthesis(page, { width: 1440, height: 900 });
  await shot(page, "01-desktop-map-proposed");

  await page.getByText("GDELT crypto news", { exact: true }).click();
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Candidate validation signal");
  await shot(page, "02-desktop-gdelt-detail");

  await page.getByTestId("synthesis-proposal").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("synthesis-proposal")).toHaveCount(0);
  await expect(page.locator("aside.rd-v2-rail")).toContainText("Validation signal");
  await page.waitForTimeout(700);
  await shot(page, "03-desktop-applied");

  await page.getByRole("button", { name: "Spec", exact: true }).click();
  await expect(page.getByTestId("synthesis-spec-view")).toBeVisible();
  await shot(page, "04-desktop-spec");

  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByTestId("synthesis-data-view")).toBeVisible();
  await shot(page, "05-desktop-data");

  await page.getByRole("button", { name: "Charts", exact: true }).click();
  await expect(page.getByTestId("synthesis-charts-view")).toBeVisible();
  await shot(page, "06-desktop-charts");

  await openSynthesis(page, { width: 390, height: 1200 });
  await shot(page, "07-mobile-map");

  await page.getByText("GDELT crypto news", { exact: true }).click();
  await expect(page.locator("aside.rd-v2-rail")).toContainText("GDELT crypto news");
  await page.waitForTimeout(400);
  await shot(page, "08-mobile-gdelt-detail");
});
