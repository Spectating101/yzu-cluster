import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
import fs from "node:fs";

const LAB_READY = {
  dataset_id: "gdelt_asia_daily_country_panel",
  title: "Asia daily news-risk panel",
  source: "GDELT",
  analysis_readiness: "instant",
  local_root: "research_panels/gdelt",
  coverage: "2018–2024",
  grain: "country_day",
  description: "Lab panel ready for query",
};

function section(rows) {
  return { sections: [{ title: "Mixed", rows }], total: rows.length };
}

async function openDiscover(page, discoverBody) {
  await mockV2Api(page, { discoverBody, jobsBody: { jobs: [] } });
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.locator(".rd-v2-search-pill input").fill("coverage");
  await expect(page.getByTestId("discover-browse-mode")).toBeVisible();
}

async function geometry(page, state) {
  const data = await page.evaluate((label) => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        selector,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left },
        display: s.display,
        position: s.position,
        overflow: s.overflow,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        boxSizing: s.boxSizing,
        padding: s.padding,
        margin: s.margin,
        zIndex: s.zIndex,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    };
    return {
      state: label,
      viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      shell: pick(".rd-v2-shell"),
      main: pick(".yzu-main"),
      focus: pick(".rd-v2-discover-focus"),
      workspaceShell: pick(".rd-v2-eval-workspace-shell"),
      workspace: pick(".rd-v2-eval-workspace"),
      actions: pick('[data-testid="discover-eval-actions"]'),
      primary: pick('[data-testid="discover-eval-actions"] .rd-v2-btn.primary'),
      mobileSecondary: pick(".rd-v2-eval-actions-mobile"),
      mobileSecondaryRow: pick(".rd-v2-eval-mobile-secondary-row"),
      menu: pick(".rd-v2-eval-action-menu"),
      activeElement: document.activeElement?.tagName || null,
    };
  }, state);
  return data;
}

test("measure exact and partial mobile Focus action geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  const results = [];

  await openDiscover(page, section([
    {
      title: "GDELT Asia country panel (catalog mirror)",
      source: "GDELT",
      url: "https://example.com/gdelt-asia",
      candidate_key: "url:https://example.com/gdelt-asia",
      equivalent_dataset_id: "gdelt_asia_daily_country_panel",
      coverage: "2018–2024",
      grain: "country_day",
      collect_via: "http_fetch",
    },
  ]));
  await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "GDELT Asia" }).click();
  await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Exact local match/i);
  results.push(await geometry(page, "exact-local"));

  await openDiscover(page, section([
    LAB_READY,
    {
      title: "GDELT Asia extended panel",
      source_system: "GDELT news graph",
      source: "GDELT",
      url: "https://example.com/gdelt-ext",
      candidate_key: "url:https://example.com/gdelt-ext",
      coverage: "2015–2026",
      grain: "country_day",
      join_keys: ["date", "country_iso3"],
      collect_via: "http_fetch",
    },
  ]));
  await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "extended" }).click();
  await expect(page.getByTestId("discover-lab-coverage")).toContainText(/Partial local coverage/i);
  results.push(await geometry(page, "partial-local"));

  fs.writeFileSync("mobile-action-geometry.json", JSON.stringify(results, null, 2));
});
