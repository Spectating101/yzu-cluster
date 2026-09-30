import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

// Records every visible element's box and computed style per state, so a CSS
// refactor can be proven to change nothing (or exactly what it meant to).
// Inert unless CSS_SNAP_DIR is set; compare runs with scripts/css-snap-diff.mjs.
const OUT = process.env.CSS_SNAP_DIR;

const PROPS = [
  "display", "position", "float", "visibility", "opacity", "z-index", "overflow-x", "overflow-y",
  "box-sizing", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "color", "background-color", "background-image", "box-shadow", "outline-style", "outline-color", "outline-width",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform",
  "text-align", "text-decoration-line", "white-space", "text-overflow", "word-break",
  "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-column-start", "grid-column-end",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "flex-grow", "flex-shrink", "flex-basis",
  "transform", "filter", "backdrop-filter", "cursor", "list-style-type", "object-fit",
];
const PSEUDO_PROPS = ["content", "display", "position", "width", "height", "color", "background-color", "background-image", "border-top-width", "border-radius", "top", "left"];

const STATES = [
  { name: "home", go: "/?tab=home" },
  { name: "library", go: "/?tab=library" },
  { name: "library-asset", go: "/?tab=library", act: async (page) => page.locator(".rd-v2-cap-ledger-row, [data-testid=library-row]").first().click({ timeout: 8000 }) },
  { name: "discover", go: "/?tab=discover" },
  { name: "discover-query", go: "/?tab=discover&q=stablecoin" },
  { name: "discover-history", go: "/?tab=discover&mode=history" },
  { name: "synthesis", go: "/?tab=synthesis" },
  { name: "synthesis-thread", go: "/?tab=synthesis", act: async (page) => page.getByTestId("synthesis-thread-item").first().click({ timeout: 8000 }) },
  { name: "resources", go: "/?tab=resources" },
  { name: "profile", go: "/?tab=profile" },
  { name: "settings", go: "/?tab=settings" },
];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test.describe("css snapshot", () => {
  test.skip(!OUT, "set CSS_SNAP_DIR to record");
  for (const viewport of VIEWPORTS) {
    for (const state of STATES) {
      test(`${state.name} @${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.clock.install({ time: new Date("2026-09-30T08:00:00Z") });
        await mockV2Api(page);
        await page.goto(state.go, { waitUntil: "domcontentloaded" });
        await waitForShell(page);
        if (state.act) await state.act(page).catch(() => {});
        await page.clock.runFor(4000);
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
        await page.evaluate(() => document.fonts?.ready);
        const snap = await page.evaluate(({ props, pseudoProps }) => {
          const out = {};
          const pathOf = (el) => {
            const parts = [];
            for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
              const index = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0;
              parts.push(`${node.tagName.toLowerCase()}${node.classList[0] ? "." + node.classList[0] : ""}:${index}`);
            }
            return parts.reverse().join(">");
          };
          for (const el of document.body.querySelectorAll("*")) {
            if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const cs = getComputedStyle(el);
            const row = { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
            for (const p of props) row[p] = cs.getPropertyValue(p);
            for (const pseudo of ["::before", "::after"]) {
              const ps = getComputedStyle(el, pseudo);
              const content = ps.getPropertyValue("content");
              if (content && content !== "none" && content !== "normal") {
                row[pseudo] = Object.fromEntries(pseudoProps.map((p) => [p, ps.getPropertyValue(p)]));
              }
            }
            out[pathOf(el)] = row;
          }
          return out;
        }, { props: PROPS, pseudoProps: PSEUDO_PROPS });
        const dir = path.join(OUT, `${viewport.width}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${state.name}.json`), JSON.stringify(snap));
        await page.screenshot({ path: path.join(dir, `${state.name}.png`), fullPage: false });
      });
    }
  }
});
