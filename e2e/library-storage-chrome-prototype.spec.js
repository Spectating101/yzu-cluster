import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-storage-chrome";

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
          access: "available",
          state: "current",
          original: true,
          location: "Research Projects / Taiwan Markets / GDELT / asia_daily.csv",
        },
      ],
    },
    {
      dataset_id: "refinitiv_estimate_revision_panel",
      name: "Estimate revision panel",
      description: "Point-in-time analyst estimate revisions.",
      grain: "ric_day",
      analysis_readiness: "instant",
      local_root: "research_panels/refinitiv",
      source: "Refinitiv",
      coverage: "2017–2026",
      verification_status: "matched",
    },
  ],
};

const NAV = {
  nav_mode: "professor_shelves",
  shelves: [
    { id: "panels", label: "Research panels", partition_ids: ["panels.market"] },
  ],
  partitions: [
    {
      partition_id: "panels.market",
      shelf_id: "panels",
      professor_label: "Market & attention panels",
      detail: { registry_dataset_ids: ["gdelt_asia_daily_country_panel", "refinitiv_estimate_revision_panel"] },
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

async function addPrototypeStyles(page) {
  await page.addStyleTag({ content: `
    .proto-storage-chrome{display:flex;align-items:center;gap:12px;padding:10px 14px;margin:0 0 10px;border:1px solid rgba(30,45,65,.13);border-radius:10px;background:rgba(250,251,252,.95);box-shadow:0 1px 0 rgba(20,30,45,.03)}
    .proto-storage-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6a7482;font-weight:700;flex:0 0 auto}
    .proto-storage-tabs{display:flex;align-items:stretch;gap:4px;overflow-x:auto;scrollbar-width:none}
    .proto-storage-tabs::-webkit-scrollbar{display:none}
    .proto-storage-tab{appearance:none;border:1px solid transparent;background:transparent;border-radius:8px;padding:7px 10px;display:flex;flex-direction:column;align-items:flex-start;gap:1px;white-space:nowrap;color:#485364;font:inherit}
    .proto-storage-tab strong{font-size:12px;font-weight:650;color:#273344}.proto-storage-tab small{font-size:10px;color:#7b8591}
    .proto-storage-tab.active{background:#fff;border-color:rgba(43,72,112,.18);box-shadow:0 1px 3px rgba(30,45,65,.06)}
    .proto-storage-tab.active strong{color:#244b86}
    .proto-storage-status{margin-left:auto;font-size:11px;color:#7b8591;white-space:nowrap}
    .proto-location-card{margin-top:8px;padding:9px 10px;border:1px solid rgba(30,45,65,.11);border-radius:8px;background:rgba(248,249,251,.92)}
    .proto-location-card.active{background:#fff}
    .proto-location-card>span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#7b8591;margin-bottom:3px}
    .proto-location-card strong{display:block;font-size:12px;color:#263448;margin-bottom:2px}.proto-location-card small{display:block;font-size:10.5px;line-height:1.4;color:#6d7886}
    .proto-location-path{margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#536071;overflow-wrap:anywhere}
    .proto-browse-location{margin-top:7px;border:0;background:transparent;padding:0;color:#315f9d;font-size:11px;font-weight:650;cursor:pointer}
    .proto-trust{margin-top:10px;border-top:1px solid rgba(30,45,65,.1);padding-top:10px}.proto-trust summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:650;color:#354256}.proto-trust summary span{font-weight:500;color:#748091}
    @media(max-width:600px){.proto-storage-chrome{gap:8px;padding:8px 10px}.proto-storage-status{display:none}.proto-storage-tab{padding:6px 8px}.proto-storage-tab small{display:none}}
  ` });
}

async function injectStorageChrome(page, active = "research") {
  await page.evaluate((activeKey) => {
    document.querySelector(".proto-storage-chrome")?.remove();
    const pathbar = document.querySelector(".rd-v2-library-pathbar");
    if (!pathbar) return;
    const chrome = document.createElement("div");
    chrome.className = "proto-storage-chrome";
    chrome.setAttribute("data-testid", "prototype-storage-chrome");
    const tabs = [
      ["research", "Research Drive", "YZUC"],
      ["gdrive", "Google Drive", "Christopher"],
      ["dropbox", "Dropbox", "Prof. Kong"],
    ];
    chrome.innerHTML = `<span class="proto-storage-label">Storage</span><div class="proto-storage-tabs">${tabs.map(([key,label,owner]) => `<button class="proto-storage-tab${key===activeKey?" active":""}" type="button"><strong>${label}</strong><small>${owner}</small></button>`).join("")}</div><span class="proto-storage-status">3 known holdings</span>`;
    pathbar.parentElement.insertBefore(chrome, pathbar);
  }, active);
}

async function prototypeRail(page) {
  await page.evaluate(() => {
    const rail = document.querySelector("aside.rd-v2-rail");
    if (!rail) return;
    const holdings = rail.querySelector('[data-testid="library-rail-holdings"]');
    if (holdings) {
      holdings.innerHTML = `
        <p class="rd-v2-rail-section-label">Storage &amp; location</p>
        <h3 class="rd-v2-library-rail-module-title">3 known locations · 3 available</h3>
        <div class="proto-location-card active"><span>Using for analysis</span><strong>Research Drive</strong><small>YZUC Research Cluster · Query-ready replica</small><div class="proto-location-path">Research panels / GDELT</div></div>
        <div class="proto-location-card"><span>Other known holding</span><strong>Google Drive · Christopher</strong><div class="proto-location-path">Research / Asia markets / GDELT</div><button class="proto-browse-location" type="button">Browse location →</button></div>
        <div class="proto-location-card"><span>Original holding</span><strong>Dropbox · Prof. Kong</strong><div class="proto-location-path">Research Projects / Taiwan Markets / GDELT</div><button class="proto-browse-location" type="button">Browse location →</button></div>
      `;
    }
    const source = rail.querySelector('[data-testid="library-rail-source"]');
    const verification = rail.querySelector('[data-testid="library-rail-verification"]');
    if (source) source.style.display = "none";
    if (verification) verification.style.display = "none";
    const storage = rail.querySelector('[data-testid="library-rail-holdings"]');
    if (storage && !rail.querySelector(".proto-trust")) {
      const trust = document.createElement("details");
      trust.className = "proto-trust";
      trust.innerHTML = `<summary>Trust &amp; provenance <span>Verified · GDELT GKG</span></summary><p style="font-size:11px;line-height:1.5;color:#667281;margin:8px 0 0">Exact source and reproduction details remain available when needed.</p>`;
      storage.insertAdjacentElement("afterend", trust);
    }
  });
}

test("prototype minimal storage chrome and compact selected rail", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await setup(page);
  await addPrototypeStyles(page);

  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();
  await injectStorageChrome(page, "research");
  await page.screenshot({ path: `${OUT}/01-folders-storage-chrome-1440.png`, fullPage: false });

  await page.locator('.rd-v2-catalog .row[data-kind="folder"]', { hasText: "Research panels" }).click();
  await page.locator('.rd-v2-catalog .row[data-kind="folder"]', { hasText: "gdelt" }).click();
  await injectStorageChrome(page, "research");
  await page.locator('.rd-v2-catalog .row[data-kind="dataset"]', { hasText: "Asia daily news-risk panel" }).click();
  await expect(page.getByTestId("library-asset-workspace")).toBeVisible();
  await expect(page.locator("aside.rd-v2-rail")).toBeVisible();
  await prototypeRail(page);
  await page.screenshot({ path: `${OUT}/02-selected-compact-storage-rail-1440.png`, fullPage: false });

  await setup(page, { width: 390, height: 1200 });
  await addPrototypeStyles(page);
  await page.getByTestId("library-folders-root").click();
  await injectStorageChrome(page, "research");
  await page.screenshot({ path: `${OUT}/03-folders-storage-chrome-mobile.png`, fullPage: false });
});
