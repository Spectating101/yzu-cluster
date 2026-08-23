/**
 * Authenticated, read-only smoke against a running front door.
 *
 * Mounts every current destination at the workstation, reference, compact and
 * mobile viewports. Fails on JS errors, bad HTTP responses, a stuck lifecycle,
 * missing shell/heading, or horizontal document overflow. Screenshots are
 * retained as visual-review evidence; this script never submits a mutation.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = String(process.env.YZU_DESK_URL || "http://100.127.141.44:8765").replace(/\/$/, "");
const TOKEN = process.env.YZU_DESK_ACCESS_TOKEN || "";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const EVIDENCE_DIR = process.env.YZU_SMOKE_EVIDENCE_DIR || path.join(
  os.homedir(),
  ".config/yzu-host-acceptance/evidence",
  `fe_loop_live_smoke_${stamp}`,
);

const ALL_PAGES = [
  ["home", "/?tab=home", /home/i, true],
  ["library", "/?tab=library", /library/i, true],
  ["discover", "/?tab=browse", /discover/i, true],
  ["discover-history", "/?tab=browse&mode=history", /discover/i, true],
  // Synthesis leads with the active thread title by design.
  ["synthesis", "/?tab=synthesis", /.+/, true],
  ["resources", "/?tab=resources", /resources|research estate/i, true],
  // Profile and Settings are static account surfaces rather than data loaders.
  ["profile", "/?tab=profile", /profile/i, false],
  ["settings", "/?tab=settings", /settings/i, false],
];
const ALL_VIEWPORTS = [
  ["workstation", { width: 1920, height: 961 }],
  ["reference", { width: 1440, height: 900 }],
  ["compact", { width: 1280, height: 800 }],
  ["mobile", { width: 390, height: 844 }],
];
const ACCEPTABLE_SURFACE_STATES = /^(ready|idle|empty|stale)$/;

function requestedSet(name) {
  const raw = String(process.env[name] || "").trim();
  return raw ? new Set(raw.split(",").map((item) => item.trim()).filter(Boolean)) : null;
}

const requestedPages = requestedSet("YZU_SMOKE_PAGES");
const requestedViewports = requestedSet("YZU_SMOKE_VIEWPORTS");
const PAGES = requestedPages
  ? ALL_PAGES.filter(([name]) => requestedPages.has(name))
  : ALL_PAGES;
const VIEWPORTS = requestedViewports
  ? ALL_VIEWPORTS.filter(([name]) => requestedViewports.has(name))
  : ALL_VIEWPORTS;

mkdirSync(EVIDENCE_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
});
let failures = 0;

for (const [viewportName, viewport] of VIEWPORTS) {
  for (const [name, route, headingPattern, requiresSurfaceState] of PAGES) {
    const context = await browser.newContext({
      viewport,
      extraHTTPHeaders: TOKEN
        ? { Authorization: `Bearer ${TOKEN}`, "X-Desk-Token": TOKEN }
        : {},
    });
    const page = await context.newPage();
    const jsErrors = [];
    const responseStatus = new Map();
    page.on("pageerror", (error) => jsErrors.push(error.message.slice(0, 180)));
    page.on("response", (response) => {
      const request = response.request();
      const requestPath = response.url().replace(BASE, "").split("?")[0];
      responseStatus.set(`${request.method()} ${requestPath}`, response.status());
    });

    let heading = "";
    let surfaceState = "missing";
    let horizontalOverflow = false;
    let accessGate = false;
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.locator(".rd-v2-shell").waitFor({ state: "visible", timeout: 30_000 });
      const surface = page.locator("main.yzu-main .rd-v2-page").first();
      await surface.waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const state = document.querySelector("main.yzu-main .rd-v2-page")?.getAttribute("data-surface-state") || "";
          return state !== "loading" && state !== "partial";
        },
        null,
        { timeout: 20_000 },
      ).catch(() => {});

      heading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
      surfaceState = await surface.getAttribute("data-surface-state") || "missing";
      horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      accessGate = await page.getByText(/Desk access required|Check access again/i).isVisible().catch(() => false);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `${viewportName}-${name}.png`),
        fullPage: false,
      });

      // fetchJson deliberately retries a protected request after session
      // bootstrap. Judge the final response per method/path, not the expected
      // first 401 that established the need to mint a session.
      const uniqueResponses = [...responseStatus.entries()]
        .filter(([, status]) => status >= 400)
        .map(([key, status]) => `${status} ${key}`);
      const bad = Boolean(
        jsErrors.length
        || uniqueResponses.length
        || horizontalOverflow
        || accessGate
        || !headingPattern.test(heading)
        || (requiresSurfaceState && !ACCEPTABLE_SURFACE_STATES.test(surfaceState)),
      );
      if (bad) failures += 1;
      console.log(
        `${bad ? "FAIL" : "ok  "} ${viewportName.padEnd(11)} ${name.padEnd(17)} `
        + `h1=${JSON.stringify(heading)} state=${surfaceState} js=${jsErrors.length} `
        + `http>=400=${uniqueResponses.length} overflow=${horizontalOverflow} gate=${accessGate}`
        + (bad ? `  ${[...jsErrors, ...uniqueResponses].slice(0, 3).join(" ; ")}` : ""),
      );
    } catch (error) {
      failures += 1;
      console.log(
        `FAIL ${viewportName.padEnd(11)} ${name.padEnd(17)} load failed: ${String(error).slice(0, 160)}`,
      );
    }
    await context.close();
  }
}

await browser.close();
console.log(`\nEvidence: ${EVIDENCE_DIR}`);
console.log(`${failures ? `${failures} surface(s) failed` : "all surfaces clean"} (${PAGES.length * VIEWPORTS.length} checked)`);
process.exit(failures ? 1 : 0);
