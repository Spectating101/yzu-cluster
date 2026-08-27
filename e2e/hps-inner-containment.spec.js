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
        const bodyRect = body?.getBoundingClientRect();
        const candidates = Array.from(document.querySelectorAll(
          ".rd-v2-settings-statement input, .rd-v2-settings-statement select, .rd-v2-settings-statement button, .rd-v2-settings-statement .rd-v2-statement-row"
        ));
        return {
          bodyRight: bodyRect?.right ?? 0,
          bodyOverflow: body ? body.scrollWidth - body.clientWidth : 0,
          bad: candidates.map((node) => {
            const r = node.getBoundingClientRect();
            return {
              text: (node.textContent || node.getAttribute("aria-label") || node.id || node.tagName).trim().slice(0, 80),
              right: r.right,
              width: r.width,
            };
          }).filter((item) => item.right > (bodyRect?.right ?? 0) + 2),
          innerOverflow: Array.from(document.querySelectorAll(".rd-v2-settings-statement .rd-v2-statement-body, .rd-v2-settings-statement .rd-v2-settings-row"))
            .map((node) => node.scrollWidth - node.clientWidth)
            .filter((delta) => delta > 2),
        };
      });

      expect(containment.bodyOverflow, `Settings ${width}: body clips horizontally`).toBeLessThanOrEqual(2);
      expect(containment.bad, `Settings ${width}: descendants escape body`).toEqual([]);
      expect(containment.innerOverflow, `Settings ${width}: inner rows clip content`).toEqual([]);
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
