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
  "/library/jobs",
  "/library/discover/history?limit=50",
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
  navigation_aborts: [],
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
      || pathname === "/library/partitions"
      || pathname === "/library/jobs"
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
  const failure = {
    method: request.method(),
    path: `${requestUrl.pathname}${requestUrl.search}`,
    error: request.failure()?.errorText || "request failed",
  };
  if (failure.error === "net::ERR_ABORTED") {
    // Page-to-page audit navigation intentionally cancels enrichment requests
    // that are no longer relevant. Keep those observable without classifying
    // them as transport failures.
    report.navigation_aborts.push(failure);
    return;
  }
  report.request_failures.push(failure);
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

async function waitForPageTruth(label) {
  if (label === "home") {
    const pickUp = page.getByTestId("home-continue");
    await pickUp.waitFor({ state: "attached", timeout: 20_000 });
    await page.locator('[data-testid="home-continue"][aria-busy="true"]').waitFor({
      state: "hidden",
      timeout: 30_000,
    }).catch(() => {});
    return;
  }
  if (label === "library") {
    await page.getByTestId("library-directory").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.getByTestId("library-directory").getByRole("status").waitFor({
      state: "hidden",
      timeout: 30_000,
    }).catch(() => {});
    return;
  }
  if (label === "discover") {
    await page.getByLabel("Search or describe a research need").waitFor({ state: "visible", timeout: 20_000 });
    return;
  }
  if (label === "synthesis") {
    await page.getByTestId("synthesis-studio").waitFor({ state: "visible", timeout: 20_000 });
    return;
  }
  if (label === "resources") {
    await page.getByText("Syncing…", { exact: true }).first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(
      () => {
        const rail = document.querySelector("aside.rd-v2-rail");
        return rail && !/Checking research decisions|Decisions\s*Checking/.test(rail.textContent || "");
      },
      null,
      { timeout: 30_000 },
    ).catch(() => {});
    return;
  }
  if (label === "settings") {
    await page.waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll(".rd-v2-settings-summary-card"));
        const jobs = cards.find((card) => /\bJobs\b/.test(card.textContent || ""));
        return jobs && !/Loading actionable jobs|Waiting for job inventory/.test(jobs.textContent || "");
      },
      null,
      { timeout: 30_000 },
    ).catch(() => {});
  }
}

async function browserGet(url) {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    const partitions = Array.isArray(body?.partitions) ? body.partitions : [];
    const shelves = Array.isArray(body?.shelves) ? body.shelves : [];
    const history = Array.isArray(body?.items) && requestPath.startsWith("/library/discover/history")
      ? body.items
      : [];
    return {
      status: response.status,
      keys: Object.keys(body || {}),
      datasets: Array.isArray(body?.datasets) ? body.datasets.length : undefined,
      partitions: partitions.length || undefined,
      nav_mode: requestPath === "/library/partitions" ? body?.nav_mode || null : undefined,
      shelves: requestPath === "/library/partitions" ? shelves.length : undefined,
      shelf_ids: requestPath === "/library/partitions"
        ? shelves.map((shelf) => String(shelf?.id || "")).filter(Boolean)
        : undefined,
      surfaced_shelf_ids: requestPath === "/library/partitions"
        ? shelves.filter((shelf) => Number(shelf?.surfaced_count || 0) > 0)
          .map((shelf) => String(shelf?.id || "")).filter(Boolean)
        : undefined,
      unassigned_partition_ids: requestPath === "/library/partitions"
        ? partitions.filter((lane) => !String(lane?.shelf_id || "").trim())
          .map((lane) => String(lane?.partition_id || "")).filter(Boolean)
        : undefined,
      library_navigation: requestPath === "/library/partitions"
        ? {
            shelves: shelves.map((shelf) => ({
              id: String(shelf?.id || ""),
              label: String(shelf?.label || shelf?.id || ""),
              partition_ids: Array.isArray(shelf?.partition_ids) ? shelf.partition_ids : [],
              surfaced_partition_ids: Array.isArray(shelf?.surfaced_partition_ids)
                ? shelf.surfaced_partition_ids
                : [],
            })),
            partitions: partitions.map((lane) => ({
              partition_id: String(lane?.partition_id || ""),
              shelf_id: String(lane?.shelf_id || ""),
              label: String(lane?.professor_label || lane?.name || lane?.partition_id || ""),
              registry_dataset_count: Array.isArray(lane?.detail?.registry_dataset_ids)
                ? lane.detail.registry_dataset_ids.length
                : 0,
            })),
          }
        : undefined,
      threads: Array.isArray(body?.threads) ? body.threads.length : undefined,
      jobs: jobs.length || undefined,
      job_statuses: jobs.reduce(
        (counts, job) => {
          const status = String(job?.status || "unknown");
          counts[status] = (counts[status] || 0) + 1;
          return counts;
        },
        {},
      ),
      pending_job_ids: jobs.filter((job) => job?.status === "pending_approval").map((job) => job.id).filter(Boolean),
      history_items: history.length || undefined,
      history_statuses: history.reduce((counts, item) => {
        const status = String(item?.status || item?.readiness || "unknown");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
      history_job_ids: history.map((item) => item?.job_id || item?.meta?.job_id).filter(Boolean),
      health_jobs: requestPath === "/health" ? body?.desk?.jobs || null : undefined,
    };
  }, url);
}

async function inspectPage(label, url, { screenshot = true } = {}) {
  await page.goto(`${baseUrl}${url}`, { waitUntil: "load", timeout: 30_000 });
  await waitForDesk();
  await waitForPageTruth(label);
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
    let auditedDatasetId = "";
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

    const libraryIntakes = [];
    for (const intake of [
      { menu: "Upload file...", heading: "Upload files", required: "Choose files to upload" },
      { menu: "Add URL / DOI...", heading: "Add URL / DOI", required: "rd-v2-rail-url-input" },
    ]) {
      await page.getByRole("button", { name: "Open new library item menu" }).click();
      const menu = page.getByRole("menu", { name: "New library item" });
      await menu.waitFor({ state: "visible", timeout: 5_000 });
      const newFolderDisabled = await menu.getByRole("menuitem", { name: "New folder" }).isDisabled();
      await menu.getByRole("menuitem", { name: intake.menu }).click();
      const inspector = page.getByRole("complementary", { name: "Inspector" });
      await inspector.getByText(intake.heading, { exact: true }).first().waitFor({ state: "visible", timeout: 5_000 });
      const requiredControl = intake.required === "rd-v2-rail-url-input"
        ? inspector.locator("#rd-v2-rail-url-input")
        : inspector.getByLabel(intake.required);
      libraryIntakes.push({
        kind: intake.menu,
        rail_visible: await inspector.getByText(intake.heading, { exact: true }).count() > 0,
        required_control: await requiredControl.count() > 0,
        send_disabled: await inspector.getByRole("button", { name: "Send to Ask" }).isDisabled(),
        new_folder_disabled: newFolderDisabled,
      });
      await page.screenshot({
        path: path.join(
          outDir,
          intake.menu.startsWith("Upload")
            ? "library-intake-upload-1440x900.png"
            : "library-intake-url-1440x900.png",
        ),
        fullPage: false,
      });
      // Selecting a real row restores the ordinary dataset Detail rail without
      // submitting an intake or creating any external state.
      const restoreRow = page.getByTestId("library-directory").locator('button.row[data-kind="dataset"]').first();
      await restoreRow.click();
      await page.getByTestId("library-asset-workspace").waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("button", { name: "← All Library assets" }).click();
      await page.getByTestId("library-directory").waitFor({ state: "visible", timeout: 15_000 });
      await librarySearch.fill("stablecoin");
      await page.waitForFunction(
        () => document.querySelectorAll("[data-testid='library-directory'] button.row").length > 0,
        null,
        { timeout: 20_000 },
      ).catch(() => {});
    }
    report.interactions.push({ name: "Library bounded intake rails", states: libraryIntakes });

    const libraryDatasetRows = page
      .getByTestId("library-directory")
      .locator('button.row[data-kind="dataset"]');
    const libraryDatasetCount = await libraryDatasetRows.count();
    if (libraryDatasetCount) {
      await libraryDatasetRows.first().click();
      await page.getByTestId("library-asset-workspace").waitFor({ state: "visible", timeout: 15_000 });
      auditedDatasetId = new URL(page.url()).searchParams.get("dataset") || "";
      const previewButton = page.getByTestId("library-asset-workspace").getByRole("button", { name: "Preview rows" });
      const previewAvailable = await previewButton.count() > 0;
      let preview = { opened: false, rows: 0, fields: 0, centre_scoped: null };
      if (previewAvailable) {
        await previewButton.click();
        const dialog = page.getByRole("dialog", { name: /preview/i });
        await dialog.waitFor({ state: "visible", timeout: 20_000 });
        await dialog.getByRole("status").waitFor({ state: "hidden", timeout: 25_000 }).catch(() => {});
        const scrimBox = await page.locator(".rd-preview-scrim").boundingBox();
        const inspectorBox = await page.getByRole("complementary", { name: "Inspector" }).boundingBox();
        preview = {
          opened: true,
          rows: await dialog.locator("tbody tr").count(),
          fields: await dialog.locator("thead th").count(),
          centre_scoped: Boolean(
            scrimBox && inspectorBox && scrimBox.x + scrimBox.width <= inspectorBox.x + 1,
          ),
        };
        await page.screenshot({ path: path.join(outDir, "library-preview-1440x900.png"), fullPage: false });
        await dialog.getByRole("button", { name: "Close preview" }).click();
      }
      report.interactions.push({
        name: "Library dataset workspace and preview",
        dataset_id: auditedDatasetId,
        workspace_visible: true,
        preview_available: previewAvailable,
        preview,
        horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      });

      if (auditedDatasetId) {
        await page.goto(`${baseUrl}/?dataset=${encodeURIComponent(auditedDatasetId)}`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        await waitForDesk();
        report.interactions.push({
          name: "Dataset-only deep link",
          dataset_id: auditedDatasetId,
          resolved_tab: new URL(page.url()).searchParams.get("tab"),
          library_heading: await page.getByRole("heading", { name: "Library", exact: true }).count() > 0,
          workspace_visible: await page.getByTestId("library-asset-workspace").count() > 0,
        });
      }
    }

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

    const heldEvidence = page.getByTestId("discover-library-evidence");
    const heldEvidenceAvailable = await heldEvidence.count() > 0;
    if (heldEvidenceAvailable) {
      await heldEvidence.locator("summary").click();
      report.interactions.push({
        name: "Discover held-evidence popover",
        preview_rows: await heldEvidence.locator(".rd-v2-discover-candidate").count(),
        compare_action: await heldEvidence.getByRole("button", { name: "Compare coverage" }).count() > 0,
        library_action: await heldEvidence.getByRole("button", { name: "Open Library results" }).count() > 0,
      });
      await page.screenshot({ path: path.join(outDir, "discover-held-evidence-1440x900.png"), fullPage: false });
      await heldEvidence.locator("summary").click();
    }

    const widerButton = page.getByRole("button", { name: "Search wider", exact: true });
    if (await widerButton.count()) {
      const beforeWider = await rankedCandidates.count();
      const widerResponse = page.waitForResponse(
        (response) => {
          const requestUrl = new URL(response.url());
          return requestUrl.pathname === "/library/discover/sources" && requestUrl.searchParams.get("live") === "1";
        },
        { timeout: 30_000 },
      ).catch(() => null);
      await widerButton.click();
      const widerStatus = page.getByText("Searching wider sources…", { exact: false });
      await widerStatus.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      const completedResponse = await widerResponse;
      await widerStatus.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(150);
      report.interactions.push({
        name: "Discover wider search",
        response_status: completedResponse?.status() || null,
        candidates_before: beforeWider,
        candidates_after: await rankedCandidates.count(),
        held_evidence_preserved: heldEvidenceAvailable
          ? await page.getByTestId("discover-library-evidence").count() > 0
          : null,
      });
      await page.screenshot({ path: path.join(outDir, "discover-wider-1440x900.png"), fullPage: false });
    }

    await page.getByRole("tab", { name: /History/ }).click();
    const history = page.getByTestId("discover-history");
    await history.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => document.querySelector("[data-testid='discover-history']")?.getAttribute("aria-busy") === "false",
      null,
      { timeout: 30_000 },
    ).catch(() => {});
    const historyRows = history.locator(".rd-v2-history-row");
    const historyStates = [];
    for (let index = 0; index < Math.min(await historyRows.count(), 6); index += 1) {
      const row = historyRows.nth(index);
      await row.click();
      historyStates.push({
        label: (await row.getAttribute("aria-label")) || "",
        selected: await row.getAttribute("aria-pressed"),
        rail: (await page.getByRole("complementary", { name: "Inspector" }).innerText())
          .replace(/\s+/g, " ")
          .slice(0, 280),
      });
    }
    report.interactions.push({
      name: "Discover History lifecycle",
      durable_rows: await historyRows.count(),
      filters: await history.locator(".rd-v2-history-filters button").allTextContents(),
      jobs_settled: await history.getAttribute("aria-busy") === "false",
      approval_rows: await historyRows.filter({ hasText: "Approval required" }).count(),
      sampled_states: historyStates,
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "discover-history-1440x900.png"), fullPage: false });

    const registeredHistoryRow = historyRows.filter({ hasText: "Registered" }).first();
    if (await registeredHistoryRow.count()) {
      await registeredHistoryRow.click();
      const libraryHandoff = page.getByRole("complementary", { name: "Inspector" })
        .getByRole("link", { name: "Open in Library" });
      const handoffAvailable = await libraryHandoff.count() > 0;
      const handoffHref = handoffAvailable ? await libraryHandoff.getAttribute("href") : "";
      if (handoffAvailable) {
        await libraryHandoff.click();
        await page.getByTestId("library-asset-workspace").waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      }
      report.interactions.push({
        name: "Discover History exact Library handoff",
        available: handoffAvailable,
        href: handoffHref,
        resolved_tab: new URL(page.url()).searchParams.get("tab"),
        dataset_id: new URL(page.url()).searchParams.get("dataset"),
        workspace_visible: await page.getByTestId("library-asset-workspace").count() > 0,
      });
    }

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
      measurements: await page.getByTestId("synthesis-measurement-status").count()
        ? (await page.getByTestId("synthesis-measurement-status").innerText()).replace(/\s+/g, " ").slice(0, 320)
        : "",
      reasoning_action: await page.getByRole("button", { name: /Start method reasoning|Accept & design method/i }).count(),
      resources_escape: await page.getByRole("button", { name: "Check Resources" }).count(),
      opening_rail: await page.getByTestId("synthesis-opening-rail").count() > 0,
    });
    await page.screenshot({ path: path.join(outDir, "synthesis-selected-1440x900.png"), fullPage: false });

    await page.goto(`${baseUrl}/?tab=resources`, { waitUntil: "load", timeout: 30_000 });
    await waitForDesk();
    await page.getByText("Syncing…", { exact: true }).first().waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
    await page.waitForFunction(
      () => {
        const rail = document.querySelector("aside.rd-v2-rail");
        return rail && !/Checking research decisions|Decisions\s*Checking/.test(rail.textContent || "");
      },
      null,
      { timeout: 30_000 },
    ).catch(() => {});
    const resourceViews = {};
    for (const label of ["Sources", "Usage", "Method"]) {
      const control = page.getByRole("button", { name: label, exact: true });
      if (await control.count()) {
        await control.click();
        await page.waitForTimeout(250);
        resourceViews[label.toLowerCase()] = (await page.locator("main.yzu-main").innerText())
          .replace(/\s+/g, " ")
          .slice(0, 360);
      }
    }
    report.interactions.push({
      name: "Resources operational views",
      views: resourceViews,
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "resources-settled-1440x900.png"), fullPage: false });

    await page.goto(`${baseUrl}/?tab=settings`, { waitUntil: "load", timeout: 30_000 });
    await waitForDesk();
    await page.getByText("Syncing…", { exact: true }).first().waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
    await page.waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll(".rd-v2-settings-summary-card"));
        const jobs = cards.find((card) => /\bJobs\b/.test(card.textContent || ""));
        return jobs && !/Loading actionable jobs|Waiting for job inventory/.test(jobs.textContent || "");
      },
      null,
      { timeout: 30_000 },
    ).catch(() => {});
    report.interactions.push({
      name: "Settings runtime truth",
      status_cards: await page.locator(".rd-v2-settings-summary-card").allTextContents(),
      connected: await page.getByText("Connected", { exact: true }).count() > 0,
      actionable_jobs_loaded: await page.locator(".rd-v2-settings-summary-card").nth(2).evaluate(
        (node) => !/Loading actionable jobs|Waiting for job inventory/.test(node.textContent || ""),
      ),
      horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    });
    await page.screenshot({ path: path.join(outDir, "settings-settled-1440x900.png"), fullPage: false });
  }

  // The release matrix covers the real 1920×961 Chrome content viewport, the
  // compact desktop breakpoint, and mobile. The 1440 captures above remain a
  // stable comparison fixture; they are not a claim about the user's display.
  for (const [width, height] of includeCrossWidths ? [[1920, 961], [1280, 800], [390, 844]] : []) {
    await page.setViewportSize({ width, height });
    for (const [label, url] of pages) {
      await page.goto(`${baseUrl}${url}`, { waitUntil: "load", timeout: 30_000 });
      await waitForDesk();
      await waitForPageTruth(label);
      report.pages.push({
        label: `${label}-${width}`,
        url,
        viewport: { width, height },
        gate: await page.locator("[data-testid='desk-access-gate']").count() > 0,
        horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        visible_text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 240),
      });
      if (width === 1920) {
        await page.screenshot({ path: path.join(outDir, `${label}-1920x961.png`), fullPage: false });
      }
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
  ...report.interactions.flatMap((entry) => {
    if (entry.name === "Library dataset workspace and preview") {
      return entry.workspace_visible && entry.preview?.opened && entry.preview?.rows > 0 && entry.preview?.centre_scoped
        ? []
        : ["workflow: Library workspace/preview"];
    }
    if (entry.name === "Dataset-only deep link") {
      return entry.resolved_tab === "library" && entry.library_heading && entry.workspace_visible
        ? []
        : ["workflow: dataset-only Library deep link"];
    }
    if (entry.name === "Library bounded intake rails") {
      return entry.states.length === 2 && entry.states.every(
        (state) => state.rail_visible && state.required_control && state.send_disabled && state.new_folder_disabled,
      )
        ? []
        : ["workflow: bounded Library intake rails"];
    }
    if (entry.name === "Discover wider search") {
      return entry.response_status === 200 && entry.candidates_after >= entry.candidates_before
        ? []
        : ["workflow: Discover wider search failed or discarded results"];
    }
    if (entry.name === "Discover History lifecycle") {
      const apiJobs = report.api.find((item) => item.path === "/library/jobs");
      const needsApproval = Number(apiJobs?.job_statuses?.pending_approval || 0);
      return entry.durable_rows > 0
        && entry.jobs_settled
        && (needsApproval === 0 || entry.approval_rows > 0)
        && entry.sampled_states.every((state) => state.selected === "true")
        ? []
        : ["workflow: Discover History selection/approval hydration"];
    }
    if (entry.name === "Discover History exact Library handoff") {
      return entry.available && entry.href && entry.resolved_tab === "library" && entry.dataset_id && entry.workspace_visible
        ? []
        : ["workflow: Discover History exact Library handoff"];
    }
    if (entry.name === "Synthesis thread selection") {
      return entry.available_threads > 0 && entry.selection_visible && entry.measurements
        ? []
        : ["workflow: Synthesis measured thread"];
    }
    if (entry.name === "Settings runtime truth") {
      return entry.status_cards.length === 3 && entry.actionable_jobs_loaded
        ? []
        : ["workflow: Settings runtime truth"];
    }
    return [];
  }),
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
