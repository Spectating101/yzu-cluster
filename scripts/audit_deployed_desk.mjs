#!/usr/bin/env node
/**
 * Read-only acceptance audit for a deployed Research Drive desk.
 *
 * This deliberately tests the front-door address, not a Vite fixture. It
 * bootstraps the same-origin HttpOnly desk session, visits every faculty
 * destination, runs only selection/search interactions, and saves viewport
 * captures plus a machine-readable report. It never creates research objects,
 * jobs, collection intents, or Ask turns.
 *
 * Usage:
 *   YZU_DESK_URL=http://100.127.141.44:8765 node scripts/audit_deployed_desk.mjs
 *   YZU_DESK_URL=http://100.127.141.44:8765 YZU_AUDIT_OUT=/tmp/rd-audit \
 *     node scripts/audit_deployed_desk.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Use the Playwright browser package directly so the audit can run from a
// clean release worktree whose dependency cache is supplied by the host.
import { chromium } from "playwright";

const baseUrl = String(process.env.YZU_DESK_URL || "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("Set YZU_DESK_URL to the deployed same-origin desk, e.g. http://100.127.141.44:8765");
  process.exit(2);
}

const outDir = process.env.YZU_AUDIT_OUT
  ? path.resolve(process.env.YZU_AUDIT_OUT)
  : fs.mkdtempSync(path.join(os.tmpdir(), "research-drive-live-audit-"));
fs.mkdirSync(outDir, { recursive: true });
const settleMs = Math.max(0, Number(process.env.YZU_AUDIT_SETTLE_MS || 5_000));
const pageFilter = new Set(
  String(process.env.YZU_AUDIT_PAGES || "").split(",").map((value) => value.trim()).filter(Boolean),
);
const includeCrossWidths = process.env.YZU_AUDIT_CROSS_WIDTHS !== "0";
const includeInteractions = process.env.YZU_AUDIT_INTERACTIONS !== "0";
const staticDir = process.env.YZU_AUDIT_STATIC_DIR ? path.resolve(process.env.YZU_AUDIT_STATIC_DIR) : "";
if (staticDir && !fs.existsSync(path.join(staticDir, "index.html"))) {
  console.error(`YZU_AUDIT_STATIC_DIR has no index.html: ${staticDir}`);
  process.exit(2);
}

const allPages = [
  ["home", "/?tab=home"],
  ["library", "/?tab=library"],
  ["discover", "/?tab=browse"],
  ["synthesis", "/?tab=synthesis"],
  ["resources", "/?tab=resources"],
  ["profile", "/?tab=profile"],
  ["settings", "/?tab=settings"],
];
const pages = pageFilter.size ? allPages.filter(([label]) => pageFilter.has(label)) : allPages;

const readOnlyApiPaths = [
  "/library/desk/capabilities",
  "/datasets",
  "/library/partitions",
  "/library/discover/sources?q=TWSE&limit=4",
  "/library/synthesis/threads?limit=4",
  "/library/desk/resources?live=0",
  "/health",
];

const report = {
  base_url: baseUrl,
  started_at: new Date().toISOString(),
  mode: "same-origin session; read-only page and API audit",
  static_candidate: staticDir || null,
  settle_ms: settleMs,
  session: null,
  api: [],
  pages: [],
  interactions: [],
  network: [],
  request_failures: [],
  console: [],
  page_errors: [],
};

const browser = await chromium.launch({
  headless: true,
  // Route-fulfilled candidate assets have a local address-space classification
  // even though their URL remains the front-door origin. The browser's private
  // network guard otherwise rejects the candidate's same-origin API calls;
  // this flag is limited to that local, non-deployed candidate check.
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    ...(staticDir ? ["--disable-web-security"] : []),
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
if (staticDir) {
  const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await context.route(new RegExp(`^${escapedBase}/(?:$|\\?.*|assets/)`), async (route) => {
    const requestUrl = new URL(route.request().url());
    const relative = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.replace(/^\//, "");
    const candidate = path.resolve(staticDir, relative);
    if (candidate === staticDir || !candidate.startsWith(`${staticDir}${path.sep}`) || !fs.existsSync(candidate)) {
      await route.continue();
      return;
    }
    await route.fulfill({ path: candidate });
  });
}
const page = await context.newPage();
const requestStarted = new Map();

function trackedRequestPath(requestUrl) {
  try {
    const pathname = new URL(requestUrl).pathname;
    return pathname === "/datasets"
      || pathname === "/library/discover"
      || pathname === "/library/discover/sources";
  } catch {
    return false;
  }
}

page.on("request", (request) => {
  if (trackedRequestPath(request.url())) requestStarted.set(request, Date.now());
});
page.on("response", (response) => {
  const request = response.request();
  const startedAt = requestStarted.get(request);
  if (startedAt == null) return;
  requestStarted.delete(request);
  const requestUrl = new URL(request.url());
  report.network.push({
    method: request.method(),
    path: `${requestUrl.pathname}${requestUrl.search}`,
    status: response.status(),
    duration_ms: Date.now() - startedAt,
  });
});
page.on("requestfailed", (request) => {
  if (!trackedRequestPath(request.url())) return;
  requestStarted.delete(request);
  const requestUrl = new URL(request.url());
  report.request_failures.push({
    method: request.method(),
    path: `${requestUrl.pathname}${requestUrl.search}`,
    error: request.failure()?.errorText || "request failed",
  });
});

page.on("console", (message) => {
  if (["warning", "error"].includes(message.type())) {
    report.console.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => report.page_errors.push(String(error)));

async function waitForDesk() {
  await page.waitForSelector(".rd-v2-shell, .yzu-shell", { timeout: 25_000 });
  // The backend serialises several bounded status calls. Give an already-mounted
  // shell time to settle so a screenshot is evidence of the usable state.
  await page.waitForTimeout(settleMs);
}

async function browserGet(url) {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      keys: Object.keys(body || {}),
      datasets: Array.isArray(body?.datasets) ? body.datasets.length : undefined,
      partitions: Array.isArray(body?.partitions) ? body.partitions.length : undefined,
      threads: Array.isArray(body?.threads) ? body.threads.length : undefined,
    };
  }, url);
}

async function inspectPage(label, url, { screenshot = true } = {}) {
  await page.goto(`${baseUrl}${url}`, { waitUntil: "load", timeout: 30_000 });
  await waitForDesk();
  // `goto` may restore the prior scroll position for a same-origin tab. The
  // reference capture is the page landing state, not an accidental retained
  // position after a preceding interaction.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const snapshot = await page.evaluate(() => ({
    title: document.title,
    gate: Boolean(document.querySelector("[data-testid='desk-access-gate']")),
    horizontal_overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll_y: window.scrollY,
    visible_buttons: Array.from(document.querySelectorAll("button")).filter((button) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).length,
    visible_text: String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1_000),
  }));
  const record = { label, url, ...snapshot };
  report.pages.push(record);
  if (screenshot) {
    await page.screenshot({ path: path.join(outDir, `${label}-1440x900.png`), fullPage: false });
  }
  return record;
}

try {
  // Bootstrap from a non-app route. Visiting the SPA first would itself start
  // the page's hydration requests and contaminate the launch timing we are
  // trying to measure.
  await page.goto(`${baseUrl}/healthz`, { waitUntil: "load", timeout: 30_000 });
  report.session = await page.evaluate(async () => {
    const response = await fetch("/library/desk/session", {
      method: "POST",
      credentials: "same-origin",
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });

  for (const requestPath of readOnlyApiPaths) {
    report.api.push({ path: requestPath, ...(await browserGet(requestPath)) });
  }

  for (const [label, url] of pages) await inspectPage(label, url);

  if (includeInteractions) {
    await page.goto(`${baseUrl}/?tab=library`, { waitUntil: "load", timeout: 30_000 });
    await waitForDesk();
    await page.evaluate(() => window.scrollTo(0, 0));
    const librarySearch = page.getByLabel("Search library holdings");
    await librarySearch.fill("stablecoin");
    await page.waitForFunction(
      () => document.querySelectorAll("[data-testid='library-directory'] button.row").length > 0,
      null,
      { timeout: 20_000 },
    ).catch(() => {});
    report.interactions.push({
      name: "Library query",
      query: await librarySearch.inputValue(),
      result_rows: await page.getByTestId("library-directory").locator("button.row").count(),
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "library-search-1440x900.png"), fullPage: false });

    await page.goto(`${baseUrl}/?tab=browse`, { waitUntil: "load", timeout: 30_000 });
    await waitForDesk();
    await page.evaluate(() => window.scrollTo(0, 0));
    const composer = page.getByLabel("Search or describe a research need");
    await composer.fill("TWSE");
    await composer.press("Enter");
    // The q transition briefly projects the idle recommendations into the
    // result DOM before the lookup effect clears them. First prove that the
    // new search cycle actually started; only then may ranked candidates
    // satisfy the completion wait.
    await page.waitForSelector("[data-testid='discover-lookup-progress']", { timeout: 5_000 });
    await page.waitForFunction(
      () => document.querySelectorAll("[data-testid='discover-ranked-results'] .rd-v2-discover-candidate").length > 0,
      null,
      { timeout: 20_000 },
    ).catch(() => {});
    const rankedCandidates = page
      .getByTestId("discover-ranked-results")
      .locator(".rd-v2-discover-candidate");
    report.interactions.push({
      name: "Discover keyword search",
      query: await composer.inputValue(),
      candidates: await rankedCandidates.count(),
      visible_candidates: await rankedCandidates.evaluateAll((nodes) =>
        nodes.filter((node) => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        }).length,
      ),
      candidate_bounds: await rankedCandidates.evaluateAll((nodes) =>
        nodes.slice(0, 3).map((node) => {
          const box = node.getBoundingClientRect();
          return { top: Math.round(box.top), bottom: Math.round(box.bottom), width: Math.round(box.width) };
        }),
      ),
      centre_scroll: await page.locator("main").evaluate((node) => ({
        scroll_top: Math.round(node.scrollTop),
        client_height: Math.round(node.clientHeight),
        scroll_height: Math.round(node.scrollHeight),
      })),
      search_wider_affordance: await page.getByText("Search wider", { exact: false }).count(),
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "discover-TWSE-1440x900.png"), fullPage: false });

    await page.goto(`${baseUrl}/?tab=synthesis`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForSelector("[data-testid='synthesis-studio']", { timeout: 25_000 });
    await page.waitForTimeout(2_000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const threadItems = page.locator("[data-testid='synthesis-thread-item']");
    const threadCount = await threadItems.count();
    if (threadCount) await threadItems.first().click();
    await page.waitForTimeout(750);
    report.interactions.push({
      name: "Synthesis thread selection",
      available_threads: threadCount,
      selection_visible: threadCount
        ? await page.locator("[data-testid='synthesis-thread-item'].active, [data-testid='synthesis-thread-item'][aria-current='true'], [data-testid='synthesis-thread-item'].selected").count() > 0
        : null,
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "synthesis-selected-1440x900.png"), fullPage: false });
  }

  // At smaller widths we gate against horizontal clipping on every faculty
  // surface. The 1440 captures above remain the visual authority.
  for (const [width, height] of includeCrossWidths ? [[1280, 800], [390, 844]] : []) {
    await page.setViewportSize({ width, height });
    for (const [label, url] of pages) {
      await page.goto(`${baseUrl}${url}`, { waitUntil: "load", timeout: 30_000 });
      await waitForDesk();
      report.pages.push({
        label: `${label}-${width}`,
        url,
        viewport: { width, height },
        gate: await page.locator("[data-testid='desk-access-gate']").count() > 0,
        horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        visible_text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 240),
      });
    }
  }
} finally {
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

const failures = [
  report.session?.status !== 200 ? "same-origin session bootstrap" : null,
  ...report.api.filter((entry) => entry.status !== 200).map((entry) => `API ${entry.path}`),
  ...report.pages.filter((entry) => entry.gate).map((entry) => `access gate: ${entry.label}`),
  ...report.pages.filter((entry) => entry.horizontal_overflow).map((entry) => `horizontal overflow: ${entry.label}`),
  // Same-origin SPA navigation intentionally aborts requests belonging to the
  // page being left. Keep those in the report for timing diagnosis, but do not
  // turn an expected Chromium cancellation into a release failure.
  ...report.request_failures
    .filter((entry) => !/ERR_ABORTED/i.test(entry.error))
    .map((entry) => `request failed: ${entry.method} ${entry.path}: ${entry.error}`),
  ...report.page_errors.map((error) => `page error: ${error}`),
].filter(Boolean);

console.log(JSON.stringify({
  out_dir: outDir,
  bootstrap: report.session,
  api: report.api,
  interactions: report.interactions,
  network: report.network,
  request_failures: report.request_failures,
  console: report.console,
  page_errors: report.page_errors,
  failures,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
