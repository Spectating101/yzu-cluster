import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-right-rail";

const DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      description: "Country-day news intensity and market-risk research panel.",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      join_keys: ["date", "country_iso3"],
      columns: ["date", "country_iso3", "article_count", "news_risk", "market_return"],
      coverage: "2018–2026 · 13 Asian economies",
      rows: 188422,
      verification_status: "verified",
      refresh_policy: "daily",
      data_as_of: "2026-09-03",
      last_refreshed_at: "2026-09-03T15:15:00Z",
      next_refresh_at: "2026-09-04T15:15:00Z",
      stale: false,
      holdings: [
        {
          provider: "YZUC Research Cluster",
          custodian: "Research Drive",
          role: "query_ready_replica",
          access: "available",
          state: "current",
          active: true,
          query_ready: true,
          location: "Research panels / GDELT",
        },
        {
          provider: "Google Drive",
          custodian: "Christopher",
          role: "research_replica",
          access: "available",
          state: "current",
          location: "Research / Asia markets / GDELT / gdelt_asia_daily.csv",
        },
        {
          provider: "Dropbox",
          custodian: "Prof. Kong",
          role: "original_holding",
          access: "restricted",
          state: "current",
          original: true,
          location: "Research Projects / Taiwan Markets / GDELT / asia_daily.csv",
        },
      ],
    },
    {
      dataset_id: "stale_weekly_panel",
      name: "Weekly issuer attention panel",
      description: "Weekly issuer attention panel with a stale refresh state.",
      grain: "issuer_week",
      analysis_readiness: "instant",
      local_root: "research_panels/attention",
      source: "MOPS · GDELT",
      join_keys: ["issuer_id", "week"],
      columns: ["issuer_id", "week", "attention_score"],
      coverage: "2024–2026",
      verification_status: "partial",
      refresh_policy: "weekly",
      data_as_of: "2026-08-20",
      last_refreshed_at: "2026-08-20T09:00:00Z",
      next_refresh_at: "2026-08-27T09:00:00Z",
      stale: true,
      holdings: [
        {
          provider: "YZUC Research Cluster",
          custodian: "Research Drive",
          role: "query_ready_replica",
          access: "available",
          state: "current",
          active: true,
          query_ready: true,
          location: "Research panels / attention",
        },
      ],
    },
  ],
};

const NAV = {
  nav_mode: "professor_shelves",
  shelves: [{ id: "panels", label: "Research panels", partition_ids: ["panels.market"] }],
  partitions: [
    {
      partition_id: "panels.market",
      shelf_id: "panels",
      professor_label: "Market & attention panels",
      detail: { registry_dataset_ids: ["gdelt_asia_daily_country_panel", "stale_weekly_panel"] },
    },
  ],
};

const ROWS = [
  { date: "2026-09-03", country_iso3: "TWN", article_count: 1842, news_risk: 0.82, market_return: -0.0041 },
  { date: "2026-09-03", country_iso3: "JPN", article_count: 3921, news_risk: 0.44, market_return: 0.0038 },
  { date: "2026-09-03", country_iso3: "KOR", article_count: 2274, news_risk: 0.61, market_return: -0.0013 },
];

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, { datasetsBody: DATASETS, libraryNavBody: NAV });
  await page.unroute("**/query/*");
  await page.route("**/query/*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ rows: ROWS }),
  }));
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
}

async function addCompactRailStyles(page) {
  await page.addStyleTag({ content: `
    /* Prototype: same rail semantics, less visual serialization. */
    .rd-v2-library-inspector-basis{padding:14px 15px 12px!important}
    .rd-v2-library-inspector-basis-grid{display:block!important;border:0!important;border-radius:0!important;background:transparent!important}
    .rd-v2-library-inspector-basis-grid>div{display:grid!important;grid-template-columns:92px minmax(0,1fr)!important;align-items:baseline!important;gap:8px!important;padding:5px 0!important;border:0!important;border-top:1px solid rgba(38,52,72,.09)!important;background:transparent!important}
    .rd-v2-library-inspector-basis-grid>div:first-child{border-top:0!important}
    .rd-v2-library-inspector-basis-grid>div span{font-size:9px!important;letter-spacing:.06em!important;color:#7a8591!important}
    .rd-v2-library-inspector-basis-grid>div strong{font-size:11.5px!important;line-height:1.25!important;color:#263448!important}
    .rd-v2-library-inspector-next{margin-top:8px!important;padding:9px 10px!important;border-left:2px solid rgba(39,84,133,.45)!important;background:rgba(44,76,114,.035)!important}
    .rd-v2-library-inspector-next span{font-size:9px!important;letter-spacing:.06em!important}
    .rd-v2-library-inspector-next p{margin-top:3px!important;font-size:10.5px!important;line-height:1.45!important}

    .rd-v2-library-inspector-holdings{padding:12px 15px!important}
    .rd-v2-library-inspector-holdings .rd-v2-library-rail-module-title{font-size:11.5px!important;margin:2px 0 5px!important}
    .rd-v2-library-holding-focus{padding:0!important;border:0!important;background:transparent!important;display:grid!important;grid-template-columns:88px minmax(0,1fr)!important;gap:2px 8px!important}
    .rd-v2-library-holding-focus>span{grid-column:1;font-size:9px!important;align-self:baseline!important}
    .rd-v2-library-holding-focus>strong{grid-column:2;font-size:11.5px!important;line-height:1.25!important}
    .rd-v2-library-holding-focus>small{grid-column:2;font-size:9.5px!important;line-height:1.3!important}
    .rd-v2-library-holdings-provider-line{margin:6px 0 0!important;padding-top:6px!important;border-top:1px solid rgba(38,52,72,.09)!important;font-size:10px!important}

    .rd-v2-library-inspector-block{padding:12px 15px!important}
    .rd-v2-library-inspector-block .rd-v2-library-rail-module-title{font-size:12px!important;margin:2px 0 4px!important}
    .rd-v2-library-inspector-prose{font-size:10.5px!important;line-height:1.45!important;margin:4px 0!important}
    .rd-v2-library-verify-list{margin:6px 0 0!important;gap:3px!important}
    .rd-v2-library-verify-list li{font-size:10px!important;line-height:1.35!important}

    .rd-v2-library-inspector-tech{margin:9px 15px 12px!important}
    .rd-v2-library-inspector-tech>summary{font-size:10.5px!important}
  ` });
}

async function openDataset(page, name) {
  const row = page.locator('.rd-v2-catalog .row[data-kind="dataset"]', { hasText: name });
  if (await row.count()) {
    await row.first().click();
  } else {
    await page.getByText(name, { exact: true }).first().click();
  }
  await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
  await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
}

test("compact rail keeps existing semantics while reducing vertical weight", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page);
  await openDataset(page, "Asia daily news-risk panel");
  await addCompactRailStyles(page);
  await page.screenshot({ path: `${OUT}/01-query-ready-compact-rail-1440.png`, fullPage: false });

  await page.getByRole("button", { name: "Close" }).click();
  await openDataset(page, "Weekly issuer attention panel");
  await addCompactRailStyles(page);
  await expect(page.getByTestId("library-stale-warning")).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-stale-compact-rail-1440.png`, fullPage: false });
});
