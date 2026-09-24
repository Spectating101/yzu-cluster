#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mockV2Api } from "../e2e/fixtures/v2MockApi.js";

const [, , tabUrl = "/?tab=home", exprFile, width = "1440", height = "900"] = process.argv;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snap = path.join(process.env.REVIEW_OUT || path.join(root, ".desk-review"), "live-snapshot.json");
const live = JSON.parse(fs.readFileSync(snap, "utf8"));
const port = Number(process.env.PROBE_PORT || 5198);
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
const url = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
try {
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
  const opts = {
    datasetsBody: live.datasets, jobsBody: live.jobs, libraryNavBody: live.partitions, historyBody: live.history,
    resourcesBody: live.resources, healthBody: live.health, profileBody: live.profile,
    discoverSourcesBody: live.discoverSources, discoverBody: live.discover,
  };
  await mockV2Api(page, Object.fromEntries(Object.entries(opts).filter(([, v]) => v)));
  await page.goto(url + tabUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const expr = exprFile ? fs.readFileSync(exprFile, "utf8") : "document.title";
  console.log(JSON.stringify(await page.evaluate(expr), null, 1));
  if (process.env.PROBE_SHOT) await page.screenshot({ path: process.env.PROBE_SHOT });
} finally {
  await browser.close();
  server.kill();
}
