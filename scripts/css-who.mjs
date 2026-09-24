#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mockV2Api } from "../e2e/fixtures/v2MockApi.js";

const [, , tabUrl, selectorList, property = "font-size", width = "1440"] = process.argv;
if (!tabUrl || !selectorList) {
  console.error("usage: css-who.mjs <url> '<selector>[;;<selector>...]' [property] [width]");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = JSON.parse(fs.readFileSync(path.join(root, ".desk-review", "live-snapshot.json"), "utf8"));
const port = Number(process.env.PROBE_PORT || 5196);
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
const url = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
try {
  const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
  const opts = {
    datasetsBody: live.datasets, jobsBody: live.jobs, libraryNavBody: live.partitions, historyBody: live.history,
    resourcesBody: live.resources, healthBody: live.health, profileBody: live.profile,
    discoverSourcesBody: live.discoverSources, discoverBody: live.discover,
  };
  await mockV2Api(page, Object.fromEntries(Object.entries(opts).filter(([, v]) => v)));
  await page.goto(url + tabUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const cdp = await page.context().newCDPSession(page);
  const sheets = new Map();
  cdp.on("CSS.styleSheetAdded", ({ header }) => sheets.set(header.styleSheetId, header));
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1 });
  const names = new Map();
  async function sheetName(id) {
    if (names.has(id)) return names.get(id);
    const header = sheets.get(id) || {};
    let name = header.sourceURL || "";
    if (!name && header.ownerNode) {
      const { node } = await cdp.send("DOM.describeNode", { backendNodeId: header.ownerNode });
      const attrs = node.attributes || [];
      const i = attrs.indexOf("data-vite-dev-id");
      if (i >= 0) name = attrs[i + 1];
    }
    name = String(name || "inline").split("/").pop().split("?")[0];
    names.set(id, name);
    return name;
  }
  for (const sel of selectorList.split(";;")) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc.nodeId, selector: sel });
    if (!nodeId) {
      console.log(`${sel}: not found`);
      continue;
    }
    const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId });
    const value = computedStyle.find((p) => p.name === property)?.value;
    const matched = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
    const hits = [];
    for (const m of matched.matchedCSSRules || []) {
      const decl = (m.rule.style.cssProperties || []).find((p) => p.name === property && !p.disabled && p.text);
      if (!decl) continue;
      const src = await sheetName(m.rule.styleSheetId);
      const line = (m.rule.style.range?.startLine ?? -1) + 1;
      hits.push(`${src}:${line}  ${m.rule.selectorList.text.slice(0, 90)}  { ${decl.text.trim()} }`);
    }
    console.log(`\n${sel}  ->  ${property}: ${value}`);
    if (!hits.length) console.log("  (inherited or default)");
    for (const h of hits.slice(-4)) console.log(`  ${h}`);
  }
} finally {
  await browser.close();
  server.kill();
}
