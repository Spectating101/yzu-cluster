import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const evidence =
  process.env.FE_EVIDENCE_DIR ||
  path.join(
    process.env.HOME,
    ".config/yzu-host-acceptance/evidence",
    `fe_loop_home_library_resources_${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z`,
  );

test.describe("visual capture Home Library Resources", () => {
  test("desktop and mobile screenshots", async ({ page }) => {
    fs.mkdirSync(evidence, { recursive: true });
    await mockV2Api(page);

    for (const [w, h, tag] of [
      [1440, 900, "desk"],
      [390, 844, "mobile"],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await page.screenshot({ path: path.join(evidence, `${tag}_home.png`), fullPage: false });

      await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await page.screenshot({ path: path.join(evidence, `${tag}_library_root.png`), fullPage: false });
      await page.locator('.rd-v2-catalog button.row[data-kind="folder"]', { hasText: "Research panels" }).click();
      await page.locator('.rd-v2-catalog button.row[data-kind="folder"]', { hasText: "gdelt" }).click();
      await page.locator('.rd-v2-catalog button.row[data-kind="dataset"]').click();
      await page.getByTestId("asset-workspace").waitFor();
      await page.screenshot({ path: path.join(evidence, `${tag}_library_asset.png`), fullPage: false });

      await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await page.screenshot({
        path: path.join(evidence, `${tag}_resources_capabilities.png`),
        fullPage: false,
      });
      await page.getByRole("button", { name: "Usage", exact: true }).click();
      await page.screenshot({ path: path.join(evidence, `${tag}_resources_usage.png`), fullPage: false });
    }

    fs.writeFileSync(path.join(evidence, "EVIDENCE_DIR.txt"), `${evidence}\n`);
    console.log(`EVIDENCE_DIR=${evidence}`);
  });
});
