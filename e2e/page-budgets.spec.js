import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const BUDGETS = JSON.parse(readFileSync(new URL("./fixtures/page-budgets.json", import.meta.url), "utf8"));

const measure = () => {
  const root = document.querySelector(".yzu-main") || document.querySelector("main");
  const vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < vh && c.visibility !== "hidden" && c.display !== "none" && Number(c.opacity) > 0.05;
  };
  const rgb = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return v.length > 3 && v[3] < 0.05 ? null : v.slice(0, 3);
  };
  let words = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const colours = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || !visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.top >= vh || r.bottom <= 0 || r.width < 2) continue;
    words += text.split(/\s+/).filter(Boolean).length;
    const c = rgb(getComputedStyle(el).color);
    if (c) colours.add(c.join(","));
  }
  let boxes = 0;
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const sides = ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(c[`border${s}Width`]) > 0 && rgb(c[`border${s}Color`]));
    if (sides.length >= 3 && r.height > 20) boxes += 1;
  }
  return { words, boxes, textColours: colours.size };
};

const PAGES = ["home", "library", "discover", "synthesis", "resources", "profile", "settings"];

for (const tab of PAGES) {
  test(`${tab}: first screen stays within its page budget`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockV2Api(page);
    await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(measure);
    console.log(`BUDGET ${tab} words=${m.words} boxes=${m.boxes} textColours=${m.textColours}`);
    const budget = BUDGETS[tab];
    if (!budget) return;
    expect(m.words, `${tab} first screen has ${m.words} words`).toBeLessThanOrEqual(budget.words);
    expect(m.boxes, `${tab} first screen has ${m.boxes} framed boxes`).toBeLessThanOrEqual(budget.boxes);
    expect(m.textColours, `${tab} first screen uses ${m.textColours} text colours`).toBeLessThanOrEqual(budget.textColours);
  });
}
