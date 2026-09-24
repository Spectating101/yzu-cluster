#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mockV2Api } from "../e2e/fixtures/v2MockApi.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deskUrl = (process.env.YZU_DESK_URL || "http://100.127.141.44:8765").replace(/\/$/, "");
const outDir = path.resolve(process.env.REVIEW_OUT || path.join(root, ".desk-review"));
const port = Number(process.env.REVIEW_PORT || 5197);
const refresh = process.env.REVIEW_REFRESH === "1";
const discoverQuery = process.env.REVIEW_QUERY || "stablecoin de-peg";
const viewports = [[1440, 900], [1920, 961]];
const snapshotPath = path.join(outDir, "live-snapshot.json");
fs.mkdirSync(outDir, { recursive: true });

async function snapshotLive(browser) {
  if (!refresh && fs.existsSync(snapshotPath)) return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${deskUrl}/?tab=home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const data = await page.evaluate(async (q) => {
    const get = async (p) => {
      const r = await fetch(p, { credentials: "include" });
      return r.ok ? r.json() : null;
    };
    const enc = encodeURIComponent(q);
    return {
      datasets: await get("/datasets"),
      jobs: await get("/library/jobs"),
      partitions: await get("/library/partitions"),
      history: await get("/library/discover/history?limit=50"),
      resources: await get("/library/desk/resources?live=0"),
      health: await get("/health"),
      profile: await get("/library/faculty/profile"),
      discoverSources: await get(`/library/discover/sources?q=${enc}&limit=12`),
      discover: await get(`/library/discover?q=${enc}`),
    };
  }, discoverQuery);
  await ctx.close();
  if (!data.datasets) throw new Error(`No live data from ${deskUrl}; is the desk up and this host a trusted entry?`);
  fs.writeFileSync(snapshotPath, JSON.stringify(data));
  return data;
}

function mockOptions(live) {
  const opts = {
    datasetsBody: live.datasets,
    jobsBody: live.jobs || undefined,
    libraryNavBody: live.partitions || undefined,
    historyBody: live.history || undefined,
    resourcesBody: live.resources || undefined,
    healthBody: live.health || undefined,
    profileBody: live.profile || undefined,
    discoverSourcesBody: live.discoverSources || undefined,
    discoverBody: live.discover || undefined,
  };
  return Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
}

function detectDefects() {
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    const tid = el.getAttribute?.("data-testid");
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${tid ? `[${tid}]` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const intentionalTruncation = (el, stop) => {
    for (let n = el; n && n !== stop; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none" || cs.getPropertyValue("-webkit-line-clamp") !== "none") return true;
    }
    return false;
  };
  const clipAncestor = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") return { node: n, cs };
    }
    return null;
  };
  const inModalLayer = (el) => !!el.closest('[role="dialog"], [aria-modal="true"]');
  const out = [];
  const seen = new Set();
  const push = (kind, el, detail) => {
    const key = `${kind}|${describe(el)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, element: describe(el), text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70), ...detail });
  };
  const textBearing = [...document.querySelectorAll("body *")].filter((el) => {
    if (!visible(el) || ["SCRIPT", "STYLE", "svg", "path", "circle"].includes(el.tagName)) return false;
    return [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  });
  for (const el of textBearing) {
    const r = el.getBoundingClientRect();
    const clip = clipAncestor(el);
    if (clip) {
      const c = clip.node.getBoundingClientRect();
      const scrollsX = /auto|scroll/.test(clip.cs.overflowX);
      const scrollsY = /auto|scroll/.test(clip.cs.overflowY);
      const cutRight = !scrollsX && r.right > c.right + 1 && r.left < c.right;
      const cutTop = !scrollsY ? r.top < c.top - 1 && r.bottom > c.top : clip.node.scrollTop === 0 && r.top < c.top - 1 && r.bottom > c.top;
      if ((cutRight || cutTop) && !intentionalTruncation(el, clip.node) && !inModalLayer(clip.node)) {
        push(cutRight ? "clipped-right" : "clipped-top", el, { container: describe(clip.node), px: Math.round(cutRight ? r.right - c.right : c.top - r.top) });
      }
    }
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && !/auto|scroll/.test(cs.overflowX)) {
      push("hard-cut-text", el, { px: el.scrollWidth - el.clientWidth });
    }
    if (cs.overflowX === "visible" && el.parentElement && cs.whiteSpace.includes("nowrap")) {
      const p = el.parentElement.getBoundingClientRect();
      if (r.right > p.right + 2 && getComputedStyle(el.parentElement).overflowX === "visible") {
        push("spills-parent", el, { parent: describe(el.parentElement), px: Math.round(r.right - p.right) });
      }
    }
  }
  const words = document.body.innerText.match(/\b[a-z]+_[a-z_]+\b|\b[0-9a-f]{12}\b/g) || [];
  const leaks = [...new Set(words)].filter((w) => !/^https?/.test(w)).slice(0, 20);
  return { defects: out, rawIdentifiers: leaks };
}

const scenarios = [
  { id: "home", url: "/?tab=home" },
  { id: "library", url: "/?tab=library" },
  {
    id: "library-selected",
    url: "/?tab=library",
    act: async (page) => {
      await page.locator(".rd-v2-cap-ledger-row").nth(1).click();
      await page.waitForTimeout(1200);
    },
  },
  { id: "discover", url: "/?tab=discover" },
  {
    id: "discover-question",
    url: "/?tab=discover",
    act: async (page) => {
      const box = page.locator("textarea, input[type=search], input[type=text]").first();
      await box.fill(discoverQuery);
      await box.press("Enter");
      await page.waitForTimeout(3500);
    },
  },
  { id: "history", url: "/?tab=discover&mode=history" },
  { id: "synthesis", url: "/?tab=synthesis" },
  { id: "resources", url: "/?tab=resources" },
  { id: "profile", url: "/?tab=profile" },
  { id: "settings", url: "/?tab=settings" },
];

async function waitForServer(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not start at ${url}`);
}

const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
});
const appUrl = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
const report = { desk: deskUrl, generated_at: new Date().toISOString(), pages: {} };
try {
  const live = await snapshotLive(browser);
  await waitForServer(appUrl);
  for (const [w, h] of viewports) {
    for (const s of scenarios) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
      await mockV2Api(page, mockOptions(live));
      await page.goto(`${appUrl}${s.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      if (s.act) {
        try {
          await s.act(page);
        } catch (e) {
          errors.push(`scenario action failed: ${String(e).slice(0, 160)}`);
        }
      }
      const key = `${s.id}-${w}`;
      const found = await page.evaluate(detectDefects);
      await page.screenshot({ path: path.join(outDir, `${key}.png`) });
      report.pages[key] = { ...found, errors };
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
let total = 0;
const lines = [];
for (const [key, p] of Object.entries(report.pages)) {
  total += p.defects.length + p.errors.length;
  if (!p.defects.length && !p.errors.length && !p.rawIdentifiers.length) continue;
  lines.push(`\n${key}`);
  for (const d of p.defects) lines.push(`  ${d.kind.padEnd(14)} ${String(d.px ?? "").padStart(4)}px  ${d.element}  "${d.text}"`);
  for (const e of p.errors) lines.push(`  page-error      ${e}`);
  if (p.rawIdentifiers.length) lines.push(`  raw-ids         ${p.rawIdentifiers.join(", ")}`);
}
console.log(lines.join("\n"));
console.log(`\n${total} layout defects/errors across ${Object.keys(report.pages).length} renders -> ${outDir}`);
process.exitCode = total ? 1 : 0;
