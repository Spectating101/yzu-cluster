import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const SETTINGS_WIDTHS = [1180, 900, 768];

test.describe("HPS inner containment", () => {
  test("Settings controls and service truth stay inside the workspace", async ({ page }) => {
    await mockV2Api(page);
    for (const width of SETTINGS_WIDTHS) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await expect(page.locator(".rd-v2-settings-statement")).toBeVisible();

      const containment = await page.evaluate(() => {
        const body = document.querySelector(".rd-v2-body-scroll");
        const candidates = Array.from(document.querySelectorAll(
          ".rd-v2-settings-statement input, .rd-v2-settings-statement select, .rd-v2-settings-statement button, .rd-v2-settings-statement .rd-v2-statement-row"
        ));
        const clipping = [];
        for (const node of candidates) {
          const rect = node.getBoundingClientRect();
          let ancestor = node.parentElement;
          while (ancestor && ancestor !== document.body) {
            const style = getComputedStyle(ancestor);
            const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
            if (clipsX) {
              const a = ancestor.getBoundingClientRect();
              if (rect.left < a.left - 2 || rect.right > a.right + 2) {
                clipping.push({
                  text: (node.textContent || node.getAttribute("aria-label") || node.id || node.tagName).trim().slice(0, 80),
                  nodeLeft: Math.round(rect.left),
                  nodeRight: Math.round(rect.right),
                  ancestor: ancestor.className || ancestor.tagName,
                  ancestorLeft: Math.round(a.left),
                  ancestorRight: Math.round(a.right),
                });
                break;
              }
            }
            ancestor = ancestor.parentElement;
          }
        }
        return {
          bodyOverflow: body ? body.scrollWidth - body.clientWidth : 0,
          clipping,
          innerOverflow: Array.from(document.querySelectorAll(
            ".rd-v2-settings-statement, .rd-v2-settings-statement .rd-v2-statement-body, .rd-v2-settings-statement .rd-v2-settings-row"
          ))
            .map((node) => ({ cls: node.className, delta: node.scrollWidth - node.clientWidth }))
            .filter((item) => item.delta > 2),
        };
      });

      expect(containment.bodyOverflow, `Settings ${width}: body scrolls horizontally`).toBeLessThanOrEqual(2);
      expect(containment.clipping, `Settings ${width}: controls are clipped by an overflow ancestor`).toEqual([]);
      expect(containment.innerOverflow, `Settings ${width}: inner rows overflow horizontally`).toEqual([]);
    }
  });

  test("Home stacks before the persistent rail makes columns poster-width", async ({ page }) => {
    await mockV2Api(page);
    for (const width of [1180, 900]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await expect(page.getByTestId("home-continue")).toBeVisible();
      const columns = await page.locator(".rd-v2-home-topband").evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/));
      expect(columns.length, `Home ${width}: expected stacked top band`).toBe(1);
    }
  });

  test("Profile edit action stays a normal control at compact widths", async ({ page }) => {
    await mockV2Api(page);
    for (const width of [900, 768]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      const edit = page.getByRole("button", { name: "Edit research memory" });
      if (await edit.count()) {
        await expect(edit).toBeVisible();
        const box = await edit.boundingBox();
        expect(box?.height || 0, `Profile ${width}: edit action wrapped vertically`).toBeLessThanOrEqual(48);
      }
    }
  });
});
